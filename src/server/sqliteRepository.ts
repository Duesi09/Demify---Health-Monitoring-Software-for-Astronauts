import 'server-only'
import { mkdirSync, readFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_CREW_ID, type CrewMember } from '@/domain/crew'
import type { Reading } from '@/domain/types'
import {
  assertActor,
  assertCrewMember,
  checkedAuditQuery,
  checkedReadings,
  isManualReading,
  toReading,
  type Actor,
  type AuditEntry,
  type AuditQuery,
  type ReadingRepository,
  type RepositoryOptions,
  type StoreHealth,
} from './repository'
import { migrate, MIGRATIONS, schemaVersion, transaction, type Migration } from './sqliteMigrations'

/**
 * The SQLite driver: one database file in the data directory, opened with
 * Node's built-in `node:sqlite`. Calls are synchronous inside, which is what
 * makes a save atomic within one process; the write lock and the busy timeout
 * do the same between processes.
 */

export const SQLITE_FILE = 'demify.db'
/** The file of the JSON driver, imported once when a database is first created. */
export const LEGACY_JSON_FILE = 'manual-readings.json'
export const IMPORT_ACTOR: Actor = 'system:json-import'

export interface SqliteOptions extends RepositoryOptions {
  /** The schema to migrate to. Tests pass shorter and longer lists. */
  migrations?: readonly Migration[]
  /** How long a write waits for another process to finish before giving up. */
  busyTimeoutMs?: number
}

/** SQLITE_CORRUPT and SQLITE_NOTADB: the file is not a usable database. */
const DAMAGE_CODES = new Set([11, 26])

class DamagedDatabaseError extends Error {
  override name = 'DamagedDatabaseError'
}

function isDamage(error: unknown): boolean {
  if (error instanceof DamagedDatabaseError) return true
  const code = (error as { errcode?: unknown } | null)?.errcode
  // The low byte is the primary result code; the rest only refines it.
  return typeof code === 'number' && DAMAGE_CODES.has(code & 0xff)
}

function connect(file: string, busyTimeoutMs: number): DatabaseSync {
  const db = new DatabaseSync(file)
  try {
    db.exec(`PRAGMA busy_timeout = ${Math.trunc(busyTimeoutMs)}`)
    // WAL: readers never block the writer, and a crash cannot leave a half-written page.
    db.exec('PRAGMA journal_mode = WAL')
    // Health data is written rarely; pay for a disk sync on every commit so a power cut loses nothing.
    db.exec('PRAGMA synchronous = FULL')
    db.exec('PRAGMA foreign_keys = ON')
    const report = db.prepare('PRAGMA integrity_check').all()
    if (report.length !== 1 || report[0].integrity_check !== 'ok') {
      throw new DamagedDatabaseError('The database failed its integrity check.')
    }
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

/** Renames the database and its journal files, so the damaged data stays recoverable. */
function setAside(file: string, now: () => Date): string {
  const target = `${file}.damaged-${now().getTime()}`
  renameSync(file, target)
  for (const suffix of ['-wal', '-shm']) {
    try {
      renameSync(file + suffix, target + suffix)
    } catch {
      // No journal file to move.
    }
  }
  return target
}

function seedCrew(db: DatabaseSync, crew: readonly CrewMember[], at: string): void {
  transaction(db, () => {
    const upsert = db.prepare(`
      INSERT INTO crew_members (id, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, updated_at = excluded.updated_at
      WHERE name IS NOT excluded.name OR role IS NOT excluded.role
    `)
    for (const member of crew) upsert.run(member.id, member.name, member.role, at, at)
  })
}

/** Stores readings and their audit entries. The caller holds the transaction. */
function writeReadings(db: DatabaseSync, crewId: string, readings: readonly Reading[], actor: Actor, at: string): void {
  const find = db.prepare('SELECT value FROM readings WHERE crew_id = ? AND day = ? AND metric = ?')
  const upsert = db.prepare(`
    INSERT INTO readings (crew_id, day, metric, value, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (crew_id, day, metric)
    DO UPDATE SET value = excluded.value, source = excluded.source, updated_at = excluded.updated_at
  `)
  const audit = db.prepare(`
    INSERT INTO audit_log (at, actor, crew_id, action, day, metric, value_before, value_after)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const reading of readings) {
    const earlier = find.get(crewId, reading.day, reading.metric)
    const before = earlier ? Number(earlier.value) : null
    upsert.run(crewId, reading.day, reading.metric, reading.value, reading.source, at, at)
    audit.run(at, actor, crewId, earlier ? 'replace' : 'create', reading.day, reading.metric, before, reading.value)
  }
}

/**
 * Brings the readings of the JSON driver into a database that has not looked
 * for them yet. A marker in store_meta, written in the same transaction as the
 * rows, is what makes this happen once.
 */
function importLegacyJson(db: DatabaseSync, dataDir: string, crew: readonly CrewMember[], now: () => Date): void {
  const marked = () => db.prepare("SELECT 1 FROM store_meta WHERE key = 'json_import_at'").get() !== undefined
  if (marked() || !crew.some((member) => member.id === DEFAULT_CREW_ID)) return

  const file = path.join(dataDir, LEGACY_JSON_FILE)
  let text: string | null = null
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      // An unreadable file must not stop the monitor. Leave it and look again at the next start.
      console.error(`${LEGACY_JSON_FILE} could not be read and was not imported.`)
      return
    }
  }

  let readings: Reading[] = []
  let damaged = false
  if (text !== null) {
    try {
      const parsed: unknown = JSON.parse(text)
      readings = Array.isArray(parsed) ? checkedReadings(parsed.filter(isManualReading)) : []
    } catch {
      damaged = true
    }
  }

  const at = now()
  const done = transaction(db, () => {
    // Checked again under the write lock: another process may have imported in the meantime.
    if (marked()) return false
    writeReadings(db, DEFAULT_CREW_ID, readings, IMPORT_ACTOR, at.toISOString())
    db.prepare("INSERT INTO store_meta (key, value) VALUES ('json_import_at', ?)").run(at.toISOString())
    return true
  })
  if (text === null || !done) return

  // Renamed after the commit: a crash in between leaves the marker, so nothing is imported twice.
  const target = `${file}.${damaged ? 'damaged' : 'imported'}-${at.getTime()}`
  try {
    renameSync(file, target)
  } catch {
    console.error(`${LEGACY_JSON_FILE} could not be renamed after the import.`)
  }
  if (damaged) console.error(`${LEGACY_JSON_FILE} could not be read and was set aside as ${path.basename(target)}.`)
  else console.info(`Imported ${LEGACY_JSON_FILE} (readings: ${readings.length}); the file is now ${path.basename(target)}.`)
}

function canWrite(db: DatabaseSync): boolean {
  try {
    // Taking and releasing the write lock proves a write would go through, without writing.
    db.exec('BEGIN IMMEDIATE')
    db.exec('ROLLBACK')
    return true
  } catch {
    return false
  }
}

class SqliteRepository implements ReadingRepository {
  readonly driver = 'sqlite'
  private readonly file: string
  private readonly crew: readonly CrewMember[]
  private readonly now: () => Date
  private readonly migrations: readonly Migration[]
  private readonly busyTimeoutMs: number
  private db: DatabaseSync | null
  private closed = false

  constructor(private readonly options: SqliteOptions) {
    this.file = path.join(options.dataDir, SQLITE_FILE)
    this.crew = options.crew
    this.now = options.now ?? (() => new Date())
    this.migrations = options.migrations ?? MIGRATIONS
    this.busyTimeoutMs = options.busyTimeoutMs ?? 5000
    this.db = this.open()
  }

  /** Opens the database, replacing a damaged one, and brings it up to date. */
  private open(): DatabaseSync {
    // Health data: a directory this server creates is readable by its own user only.
    mkdirSync(this.options.dataDir, { recursive: true, mode: 0o700 })
    let db: DatabaseSync
    try {
      db = connect(this.file, this.busyTimeoutMs)
    } catch (error) {
      if (!isDamage(error)) throw error
      // A damaged database must not take the whole monitor down. Set it aside
      // for recovery and carry on with a new one.
      const target = setAside(this.file, this.now)
      console.error(`The readings database is damaged and was set aside as ${path.basename(target)}. A new database was started.`)
      db = connect(this.file, this.busyTimeoutMs)
    }
    try {
      migrate(db, this.migrations, this.now)
      seedCrew(db, this.crew, this.now().toISOString())
      importLegacyJson(db, this.options.dataDir, this.crew, this.now)
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }

  /** Runs `work` on the open database. Damage found while running gets the same treatment as at start-up. */
  private use<T>(work: (db: DatabaseSync) => T): T {
    if (this.closed) throw new Error('The repository is closed.')
    try {
      this.db ??= this.open()
      return work(this.db)
    } catch (error) {
      if (!isDamage(error)) throw error
      try {
        this.db?.close()
      } catch {
        // Already closed.
      }
      // Opening again runs the integrity check, which sets the damaged file aside.
      this.db = null
      this.db = this.open()
      return work(this.db)
    }
  }

  async listManualReadings(crewId: string): Promise<Reading[]> {
    assertCrewMember(crewId, this.crew)
    return this.use((db) => {
      const rows: unknown[] = db
        .prepare("SELECT day, metric, value, source FROM readings WHERE crew_id = ? AND source = 'manual' ORDER BY day, metric")
        .all(crewId)
      // An indicator this version does not know, or a value that is not a number, is skipped, not served.
      return rows.filter(isManualReading).map(toReading)
    })
  }

  async saveManualReadings(crewId: string, readings: readonly Reading[], actor: Actor): Promise<void> {
    assertCrewMember(crewId, this.crew)
    assertActor(actor)
    const checked = checkedReadings(readings)
    if (checked.length === 0) return
    this.use((db) => transaction(db, () => writeReadings(db, crewId, checked, actor, this.now().toISOString())))
  }

  async clearManualReadings(crewId: string, actor: Actor): Promise<number> {
    assertCrewMember(crewId, this.crew)
    assertActor(actor)
    return this.use((db) =>
      transaction(db, () => {
        const at = this.now().toISOString()
        const rows = db
          .prepare("SELECT day, metric, value FROM readings WHERE crew_id = ? AND source = 'manual' ORDER BY day, metric")
          .all(crewId)
        const audit = db.prepare(`
          INSERT INTO audit_log (at, actor, crew_id, action, day, metric, value_before, value_after)
          VALUES (?, ?, ?, 'clear', ?, ?, ?, NULL)
        `)
        // One entry per reading, so the trail keeps every value that was removed.
        for (const row of rows) audit.run(at, actor, crewId, row.day, row.metric, row.value)
        db.prepare("DELETE FROM readings WHERE crew_id = ? AND source = 'manual'").run(crewId)
        return rows.length
      }),
    )
  }

  async listAuditTrail(query?: AuditQuery): Promise<AuditEntry[]> {
    const { crewId, limit, beforeId } = checkedAuditQuery(query)
    const where: string[] = []
    const values: (string | number)[] = []
    if (crewId !== undefined) {
      where.push('crew_id = ?')
      values.push(crewId)
    }
    if (beforeId !== undefined) {
      where.push('id < ?')
      values.push(beforeId)
    }
    return this.use((db) =>
      db
        .prepare(`
          SELECT id, at, actor, crew_id, action, day, metric, value_before, value_after FROM audit_log
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY id DESC LIMIT ?
        `)
        .all(...values, limit)
        .map(
          (row): AuditEntry => ({
            id: Number(row.id),
            at: String(row.at),
            actor: String(row.actor),
            crewId: String(row.crew_id),
            action: row.action as AuditEntry['action'],
            day: Number(row.day),
            metric: String(row.metric),
            before: row.value_before === null ? null : Number(row.value_before),
            after: row.value_after === null ? null : Number(row.value_after),
          }),
        ),
    )
  }

  async health(): Promise<StoreHealth> {
    return this.use((db) => {
      const count = (table: 'crew_members' | 'readings' | 'audit_log') =>
        Number(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n ?? 0)
      return {
        driver: this.driver,
        schemaVersion: schemaVersion(db),
        writable: canWrite(db),
        audit: 'transactional',
        counts: { crewMembers: count('crew_members'), readings: count('readings'), auditEntries: count('audit_log') },
      }
    })
  }

  async close(): Promise<void> {
    this.closed = true
    this.db?.close()
    this.db = null
  }
}

/** Opens the database in `dataDir`, creating and migrating it as needed. */
export function createSqliteRepository(options: SqliteOptions): ReadingRepository {
  return new SqliteRepository(options)
}
