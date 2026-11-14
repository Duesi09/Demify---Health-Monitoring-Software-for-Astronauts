import 'server-only'
import type { DatabaseSync } from 'node:sqlite'

/**
 * The SQLite schema, as numbered forward-only migrations. To change the
 * schema, append one entry to MIGRATIONS; never edit or reorder an entry that
 * has shipped, because databases in the field have already applied it.
 */

export interface Migration {
  /** Counts up from 1 without gaps. */
  version: number
  name: string
  /** SQL to run, or a function for changes that have to look at the data. Runs inside a transaction. */
  up: string | ((db: DatabaseSync) => void)
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'crew members, readings and audit log',
    up: `
      CREATE TABLE store_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT, WITHOUT ROWID;

      CREATE TABLE crew_members (
        id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 32),
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT, WITHOUT ROWID;

      -- One value per crew member, mission day and indicator. The unique
      -- constraint is also the index every read and upsert uses.
      CREATE TABLE readings (
        id INTEGER PRIMARY KEY,
        crew_id TEXT NOT NULL REFERENCES crew_members (id),
        day INTEGER NOT NULL,
        metric TEXT NOT NULL CHECK (length(metric) BETWEEN 1 AND 64),
        value REAL NOT NULL,
        source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 32),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (crew_id, day, metric)
      ) STRICT;

      -- AUTOINCREMENT: an id is never used twice, so the order of entries is the order of events.
      CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        at TEXT NOT NULL,
        actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 64),
        crew_id TEXT NOT NULL REFERENCES crew_members (id),
        action TEXT NOT NULL CHECK (action IN ('create', 'replace', 'clear')),
        day INTEGER NOT NULL,
        metric TEXT NOT NULL,
        value_before REAL,
        value_after REAL
      ) STRICT;

      CREATE INDEX audit_log_by_crew ON audit_log (crew_id, id);

      -- Append-only is enforced by the database, not left to the application.
      CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only');
      END;

      CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
      BEGIN
        SELECT RAISE(ABORT, 'audit_log is append-only');
      END;
    `,
  },
]

/** The database was written by a newer release. Opening it with older code could damage it. */
export class SchemaTooNewError extends Error {
  override name = 'SchemaTooNewError'
}

/** Runs `work` in a write transaction: all of it is stored, or none of it. */
export function transaction<T>(db: DatabaseSync, work: () => T): T {
  // IMMEDIATE takes the write lock now, so two writers queue up instead of failing halfway.
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      // The failed statement may already have rolled the transaction back.
    }
    throw error
  }
}

export function schemaVersion(db: DatabaseSync): number {
  const row = db.prepare('SELECT max(version) AS version FROM schema_migrations').get()
  return Number(row?.version ?? 0)
}

function checkNumbering(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error(`Migrations must be numbered 1, 2, 3 without gaps; entry ${index + 1} is numbered ${migration.version}.`)
    }
  })
}

/**
 * Brings the database to the latest schema and returns the versions it
 * applied. Each migration commits together with its row in schema_migrations,
 * so a failure leaves the database at the last complete version.
 */
export function migrate(db: DatabaseSync, migrations: readonly Migration[], now: () => Date): number[] {
  checkNumbering(migrations)
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `)

  const found = schemaVersion(db)
  if (found > migrations.length) {
    throw new SchemaTooNewError(
      `The database is at schema version ${found}, but this version of Demify only knows version ${migrations.length}. ` +
        'Run the newer version of Demify, or restore a backup made before the upgrade.',
    )
  }

  const applied: number[] = []
  for (const migration of migrations.slice(found)) {
    transaction(db, () => {
      // Checked again under the write lock: another process may have migrated in the meantime.
      if (schemaVersion(db) >= migration.version) return
      if (typeof migration.up === 'string') db.exec(migration.up)
      else migration.up(db)
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        now().toISOString(),
      )
      applied.push(migration.version)
    })
  }
  return applied
}
