import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReadingRepository } from './repository'
import { MIGRATIONS, SchemaTooNewError, type Migration } from './sqliteMigrations'
import { createSqliteRepository, IMPORT_ACTOR, LEGACY_JSON_FILE, SQLITE_FILE, type SqliteOptions } from './sqliteRepository'
import { manual, removeTempDataDirs, tempDataDir, TEST_CREW, tickingClock } from './testing'

let dataDir: string
let now: () => Date
const repositories: ReadingRepository[] = []
const file = () => path.join(dataDir, SQLITE_FILE)

function open(extra: Partial<SqliteOptions> = {}): ReadingRepository {
  const repository = createSqliteRepository({ dataDir, crew: TEST_CREW, now, ...extra })
  repositories.push(repository)
  return repository
}

/** Looks into the database file directly, past the repository. */
function inspect<T>(look: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(file())
  try {
    return look(db)
  } finally {
    db.close()
  }
}

const NEXT_MIGRATION: Migration = {
  version: MIGRATIONS.length + 1,
  name: 'test: a note on every reading',
  up: 'ALTER TABLE readings ADD COLUMN note TEXT',
}

beforeEach(async () => {
  dataDir = await tempDataDir()
  now = tickingClock()
})

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.close()))
  vi.restoreAllMocks()
})

afterAll(removeTempDataDirs)

describe('sqlite driver: migrations', () => {
  it('applies every migration to a new database and records each one', async () => {
    const repository = open()
    expect((await repository.health()).schemaVersion).toBe(MIGRATIONS.length)
    const rows = inspect((db) => db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version').all())
    expect(rows.map((row) => row.version)).toEqual(MIGRATIONS.map((migration) => migration.version))
    expect(rows[0].name).toBe(MIGRATIONS[0].name)
    expect(rows[0].applied_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('does not apply a migration twice', async () => {
    await open().close()
    const before = inspect((db) => db.prepare('SELECT version, applied_at FROM schema_migrations').all())
    await open().close()
    await open().close()
    expect(inspect((db) => db.prepare('SELECT version, applied_at FROM schema_migrations').all())).toEqual(before)
  })

  it('upgrades a database made at an older schema version and keeps its data', async () => {
    const old = open()
    await old.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await old.close()

    const upgraded = open({ migrations: [...MIGRATIONS, NEXT_MIGRATION] })
    expect((await upgraded.health()).schemaVersion).toBe(MIGRATIONS.length + 1)
    expect(await upgraded.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96)])
    expect(inspect((db) => db.prepare('SELECT note FROM readings').all())).toEqual([{ note: null }])
  })

  it('rolls a failing migration back and leaves the database at the last complete version', async () => {
    await open().close()
    const broken: Migration = {
      version: NEXT_MIGRATION.version,
      name: 'test: fails halfway',
      up: 'CREATE TABLE half_done (id INTEGER PRIMARY KEY); INSERT INTO no_such_table VALUES (1)',
    }
    expect(() => open({ migrations: [...MIGRATIONS, broken] })).toThrow(/no_such_table/)

    const tables = inspect((db) => db.prepare("SELECT name FROM sqlite_schema WHERE name = 'half_done'").all())
    expect(tables).toEqual([])
    expect((await open().health()).schemaVersion).toBe(MIGRATIONS.length)
  })

  it('refuses a database written by a newer version, and leaves the file alone', async () => {
    await open({ migrations: [...MIGRATIONS, NEXT_MIGRATION] }).close()
    expect(() => open()).toThrow(SchemaTooNewError)
    expect((await readdir(dataDir)).some((name) => name.includes('.damaged-'))).toBe(false)
  })

  it('refuses a list of migrations with a gap in its numbering', () => {
    expect(() => open({ migrations: [...MIGRATIONS, { ...NEXT_MIGRATION, version: NEXT_MIGRATION.version + 1 }] })).toThrow(
      /without gaps/,
    )
  })
})

describe('sqlite driver: schema', () => {
  it('uses the write-ahead log and enforces foreign keys', () => {
    open()
    expect(inspect((db) => db.prepare('PRAGMA journal_mode').get())).toEqual({ journal_mode: 'wal' })
    expect(() =>
      inspect((db) =>
        db.exec(
          "INSERT INTO readings (crew_id, day, metric, value, source, created_at, updated_at) VALUES ('nobody', 1, 'mood', 3, 'manual', 'x', 'x')",
        ),
      ),
    ).toThrow(/FOREIGN KEY/)
  })

  it('stores the crew, and follows a change of name or role', () => {
    open().close()
    open({ crew: [{ id: 'morgan', name: 'A. Morgan', role: 'Commander' }, TEST_CREW[1]] })
    const rows = inspect((db) => db.prepare('SELECT id, name, role, created_at < updated_at AS changed FROM crew_members ORDER BY id').all())
    expect(rows).toEqual([
      { id: 'chen', name: 'L. Chen', role: 'Commander', changed: 0 },
      { id: 'morgan', name: 'A. Morgan', role: 'Commander', changed: 1 },
    ])
  })

  it('keeps when a reading was first entered and when it last changed', async () => {
    const repository = open()
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    const first = inspect((db) => db.prepare('SELECT created_at, updated_at, source FROM readings').get())
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 94)], 'crew:morgan')
    const second = inspect((db) => db.prepare('SELECT created_at, updated_at, value FROM readings').get())

    expect(first?.source).toBe('manual')
    expect(first?.updated_at).toBe(first?.created_at)
    expect(second?.created_at).toBe(first?.created_at)
    expect(Date.parse(String(second?.updated_at))).toBeGreaterThan(Date.parse(String(first?.updated_at)))
    expect(second?.value).toBe(94)
  })

  it('does not let an audit entry be changed or removed', async () => {
    const repository = open()
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    expect(() => inspect((db) => db.exec("UPDATE audit_log SET actor = 'someone-else'"))).toThrow(/append-only/)
    expect(() => inspect((db) => db.exec('DELETE FROM audit_log'))).toThrow(/append-only/)
    expect(await repository.listAuditTrail()).toHaveLength(1)
  })

  it('keeps every reading when two server processes save at once', async () => {
    const [one, two] = [open(), open()]
    await Promise.all(
      Array.from({ length: 30 }, (_, index) => index + 1).flatMap((day) => [
        one.saveManualReadings('morgan', [manual(day, 'mood', 4)], 'crew:morgan'),
        two.saveManualReadings('morgan', [manual(day, 'spo2', 97)], 'crew:morgan'),
      ]),
    )
    expect(await one.listManualReadings('morgan')).toHaveLength(60)
    expect(await two.listAuditTrail({ limit: 1000 })).toHaveLength(60)
  })
})

describe('sqlite driver: import of the JSON file', () => {
  const legacy = () => path.join(dataDir, LEGACY_JSON_FILE)

  it('imports the valid rows once, for the default crew member, and renames the file', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    await writeFile(
      legacy(),
      JSON.stringify([
        { day: 5, metric: 'spo2', value: 96, source: 'manual' },
        { day: 5, metric: 'unknown', value: 1, source: 'manual' },
        { day: 6, metric: 'bodyTemp', value: 36.9, source: 'manual' },
      ]),
    )

    const repository = open()
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96), manual(6, 'bodyTemp', 36.9)])
    expect(await repository.listManualReadings('chen')).toEqual([])
    const trail = await repository.listAuditTrail()
    expect(trail).toHaveLength(2)
    expect(trail.every((entry) => entry.actor === IMPORT_ACTOR && entry.action === 'create')).toBe(true)

    const names = await readdir(dataDir)
    expect(names).not.toContain(LEGACY_JSON_FILE)
    expect(names.some((name) => name.startsWith(`${LEGACY_JSON_FILE}.imported-`))).toBe(true)
    await repository.close()

    // A file that turns up later, for example after a spell on the JSON driver, is not pulled in.
    await writeFile(legacy(), JSON.stringify([{ day: 9, metric: 'mood', value: 2, source: 'manual' }]))
    const again = open()
    expect(await again.listManualReadings('morgan')).toHaveLength(2)
    expect(await again.listAuditTrail()).toHaveLength(2)
    expect(await readdir(dataDir)).toContain(LEGACY_JSON_FILE)
  })

  it('starts without the readings when the JSON file is damaged, and sets it aside', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await writeFile(legacy(), '{not json')
    const repository = open()
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect((await readdir(dataDir)).some((name) => name.startsWith(`${LEGACY_JSON_FILE}.damaged-`))).toBe(true)
    expect(logged).toHaveBeenCalledOnce()
  })
})

describe('sqlite driver: a damaged database', () => {
  it('is set aside at start-up, and the store works', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await writeFile(file(), 'this is not a database, however long the file may be '.repeat(100))

    const repository = open()
    expect(await repository.listManualReadings('morgan')).toEqual([])
    await repository.saveManualReadings('morgan', [manual(7, 'restingHr', 61)], 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([manual(7, 'restingHr', 61)])

    const aside = (await readdir(dataDir)).filter((name) => name.startsWith(`${SQLITE_FILE}.damaged-`))
    expect(aside).toHaveLength(1)
    expect(await readFile(path.join(dataDir, aside[0]), 'utf8')).toContain('this is not a database')
    expect(logged).toHaveBeenCalledOnce()
    expect(String(logged.mock.calls[0][0])).toContain('set aside')
  })

  it('is set aside when its pages are damaged, together with what could still be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const first = open()
    await first.saveManualReadings('morgan', Array.from({ length: 150 }, (_, index) => manual(index + 1, 'mood', 4)), 'crew:morgan')
    await first.close()

    // Overwrite the middle of the file: the header still says "database", the content no longer adds up.
    const bytes = await readFile(file())
    bytes.fill(0x5a, 4096, bytes.length - 100)
    await writeFile(file(), bytes)

    const repository = open()
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect((await repository.health()).writable).toBe(true)
    expect((await readdir(dataDir)).filter((name) => name.includes('.damaged-')).length).toBeGreaterThanOrEqual(1)
  })

  it('is set aside when the damage appears while the server is running', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const repository = open()
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')

    // Point a table at a page that does not exist, as a failing disk might.
    inspect((db) => {
      db.exec('PRAGMA writable_schema = ON')
      db.exec("UPDATE sqlite_schema SET rootpage = 99999 WHERE name = 'readings'")
      // Makes the open connection read the schema again, as it would after any real change.
      db.exec('PRAGMA schema_version = 99999')
    })

    await repository.saveManualReadings('morgan', [manual(6, 'mood', 4)], 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([manual(6, 'mood', 4)])
    expect((await readdir(dataDir)).some((name) => name.startsWith(`${SQLITE_FILE}.damaged-`))).toBe(true)
  })
})
