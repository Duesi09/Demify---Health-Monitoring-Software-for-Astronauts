# Data layer

How Demify stores readings: those a crew member enters by hand (source
`manual`) and those a device or a ground system sends through the HTTP API
(source `device`, see [api.md](api.md)). This page covers the boundary, the two
drivers, the schema, and how to run it (settings, backup, restore, migrations).
The simulated sensor log is computed, not stored.

## The boundary

```
pages, server actions,     src/app
HTTP API (src/server/api)
        |
mission.ts, store.ts       src/server   getMissionReadings(crewId), getRepository()
        |
ReadingRepository          src/server/repository.ts   the port: an interface, no storage code
        |
   +----+-----------------+
sqliteRepository.ts    jsonRepository.ts               the drivers
```

Server code asks `getRepository()` for the port and never imports a driver.
There is one repository per server process, created on first use. Every module
the server loads from `src/server` starts with `import 'server-only'`, so importing one from a
client component fails the build.

The port, in short (`src/server/repository.ts` has the full types):

| Method | What it does |
| --- | --- |
| `listReadings(crewId)` | Every stored reading of a crew member, `device` and `manual`, by mission day. Rows that are not valid readings are skipped. |
| `listManualReadings(crewId)` | Only the manual readings. |
| `saveManualReadings(crewId, readings, actor)` | Saves all of the readings or none. Replaces an earlier manual reading for the same day and indicator. |
| `saveDeviceReadings(crewId, readings, actor)` | The same for readings a device sent. Replaces an earlier device reading for the same day and indicator. |
| `clearManualReadings(crewId, actor)` | Removes a crew member's manual readings and returns how many there were. Device readings stay. |
| `listAuditTrail({ crewId?, limit?, beforeId? })` | The audit trail, newest first. `beforeId` pages backwards. |
| `health()` | Driver, schema version, whether a write would go through, how the audit trail is kept, and counts. |
| `close()` | Releases files and locks. |

Every write names an actor: `crew:<id>` for a crew member, `system:<name>` for
the server itself, `api:<name>` for a client of the HTTP API. An actor is a
label that is stored and shown, never a secret. Bad input (unknown crew member,
missing actor, a reading that is not valid) is refused with a `StoreInputError`
and nothing is written.

A day can hold one reading per source for an indicator: a device reading and a
manual reading stand side by side, and neither overwrites the other. Which one
counts is decided when the readings are evaluated (`src/domain/engine.ts`):
`manual` before `device`, `device` before the simulated log. An audit entry
does not name the source; the actor tells it, since `api:` actors only write
device readings and `crew:` actors only manual ones.

The crew is defined in `src/domain/crew.ts`. Today it has one member, `morgan`,
who is also the default. Everything in storage is keyed by crew member id.

## Settings

Read once at start-up by `src/server/config.ts`. A bad value stops the server
with a message that names the variable. An empty value counts as not set.

| Variable | Values | Default | Meaning |
| --- | --- | --- | --- |
| `DEMIFY_DATA_DIR` | a directory path | `./.data` | Where the data files are kept. Created when missing. `/data` in the container image. |
| `DEMIFY_STORE` | `sqlite`, `json` | `sqlite` | The storage driver. |
| `DEMIFY_API_TOKEN` | 16 to 512 printable characters, no spaces | not set | Shared secret for the HTTP API ([api.md](api.md)). Without it the API serves no crew data. It is never logged or stored by the data layer. |

## Drivers

| | `sqlite` (default) | `json` |
| --- | --- | --- |
| Files in the data directory | `demify.db`, plus `demify.db-wal` and `demify.db-shm` while open | `manual-readings.json`, `manual-readings.<crew id>.json`, `audit-log.jsonl` |
| Schema and migrations | yes | no; the file format has version 2 |
| Audit trail | written in the same transaction as the change | appended to a file after the change (`audit: 'best-effort'` in the health report) |
| Several server processes | yes, on one machine | no, one process only |
| Meant for | every real deployment | first look, debugging, a Node.js without `node:sqlite` |

Both drivers pass the same contract tests (`src/server/repository.contract.test.ts`).
A new driver, for example for PostgreSQL, implements `ReadingRepository`, joins
the `DRIVERS` list of that test file and gets a branch in `src/server/store.ts`.

The JSON driver keeps the default crew member in `manual-readings.json`, the
file and format the project has always used: a list of
`{ "day": 90, "metric": "systolic", "value": 118, "source": "manual" }`.
Since format version 2 the same list also holds the readings devices sent,
with `"source": "device"`, so the file name says less than the file holds. A
file written before that is read as it is.

Switching from `json` to `sqlite` is automatic: when a database that has not
looked for it yet finds `manual-readings.json` in the data directory, it imports
the valid rows, manual and device, for the default crew member (actor `system:json-import`) and
renames the file to `manual-readings.json.imported-<time>`. This happens once
per database. There is no automatic way back from `sqlite` to `json`.

## SQLite schema

Schema version 2. Timestamps are ISO 8601 in UTC, for example
`2031-03-01T08:00:00.000Z`. The code calls an indicator a `metric`, and so do
the columns.

| Table | Columns | Notes |
| --- | --- | --- |
| `schema_migrations` | `version` (key), `name`, `applied_at` | One row per applied migration. |
| `store_meta` | `key` (key), `value` | Facts about the database itself. `json_import_at`: when it looked for the JSON file. |
| `crew_members` | `id` (key), `name`, `role`, `created_at`, `updated_at` | Kept in step with `src/domain/crew.ts` at every start. |
| `readings` | `id` (key), `crew_id`, `day`, `metric`, `value`, `source`, `created_at`, `updated_at` | Unique per `crew_id`, `day`, `metric` and `source`; that index serves every read. `source` is `manual` or `device`. `crew_id` refers to `crew_members`. |
| `audit_log` | `id` (key), `at`, `actor`, `crew_id`, `action`, `day`, `metric`, `value_before`, `value_after` | `action` is `create`, `replace` or `clear`. Index on `crew_id, id`. |

| Version | What it changed |
| --- | --- |
| 1 | Crew members, readings and the audit log. One reading per crew member, day and indicator. |
| 2 | One reading per crew member, day, indicator and source, so a device reading and a manual reading for the same day are both kept. The `readings` table is rebuilt; its rows are carried over unchanged. |

The audit log is append-only, and the database enforces it: two triggers refuse
every `UPDATE` and `DELETE` on `audit_log`. A save writes one entry per reading
(`create` or `replace`, with the value before and after). A clear writes one
`clear` entry per reading removed, so the trail keeps every value that was ever
stored.

The database runs with foreign keys on, the write-ahead log (WAL), a disk sync
on every commit and a busy timeout of 5 seconds. Every write is one
`BEGIN IMMEDIATE` transaction, so saves that arrive together queue up and none
is lost.

## Start-up and damaged files

When the repository is first used, the SQLite driver:

1. Opens `demify.db` and runs `PRAGMA integrity_check`. A file that fails, or
   is not a database at all, is renamed to `demify.db.damaged-<time>` (with its
   `-wal` and `-shm` files), an error is logged, and a new database is started.
   The monitor always starts. The same happens if damage shows up while the
   server is running.
2. Applies the migrations the database has not seen yet, each in its own
   transaction.
3. Brings `crew_members` in step with the crew in the code.
4. Imports `manual-readings.json`, if this database has not looked for it yet.

One case is refused on purpose: a database at a higher schema version than the
running code knows. Old code writing to a newer schema could damage it, so the
server reports the versions and stops using the store until the newer release
is back or a backup is restored.

The JSON driver sets a readings file that is not valid JSON aside as
`<file>.damaged-<time>` and carries on without it.

To recover a file that was set aside, stop the server and inspect it with the
`sqlite3` command line tool (`.recover` writes out what can still be read).

## Adding a migration

Append one entry to `MIGRATIONS` in `src/server/sqliteMigrations.ts`:

```ts
{
  version: 3,
  name: 'note on a reading',
  up: 'ALTER TABLE readings ADD COLUMN note TEXT',
},
```

- Versions count up without gaps. `up` is SQL, or a function that gets the
  database when the change has to look at the data.
- Never edit or reorder an entry that has shipped. Databases in the field have
  applied it already; fix mistakes with a new entry.
- Migrations only go forward. To go back, restore a backup.
- A migration runs inside a transaction, and `PRAGMA foreign_keys` cannot be
  switched inside one. A migration that rebuilds a table should start with
  `PRAGMA defer_foreign_keys = ON`.
- Update the schema table and the list of versions above, and take a backup
  before rolling out.
- Migration 2 is an example of a table rebuild.

`src/server/sqliteRepository.test.ts` shows how to test an upgrade: open a
database with the old list, then with the new one.

## Backup and restore

SQLite driver, while the server is running:

```
node scripts/backup.mjs /backups/demify-2031-03-01.db
```

The script reads `DEMIFY_DATA_DIR` (or `--data-dir <directory>`), writes one
consistent snapshot as a single file, checks the copy, and never overwrites an
existing file. In the container:

```
docker compose exec demify node scripts/backup.mjs /data/backups/demify-2031-03-01.db
docker compose cp demify:/data/backups/demify-2031-03-01.db .
```

Do not copy `demify.db` on its own while the server runs: recent changes live
in `demify.db-wal`, and a copy taken mid-write can be inconsistent.

Restore:

1. Stop the server.
2. In the data directory, move `demify.db`, `demify.db-wal` and `demify.db-shm`
   away. The `-wal` file must not stay: it belongs to the old database.
3. Copy the backup to `demify.db`.
4. Start the server. A backup from an older release is migrated at start-up.

JSON driver: stop the server and copy the data directory.

## Limits

- `node:sqlite` is built into Node.js 22.13 and newer without a flag, and is
  still marked experimental in Node.js 22. It prints one `ExperimentalWarning`
  per process (hide it with `NODE_OPTIONS=--disable-warning=ExperimentalWarning`),
  and its API may change in a later major version of Node.js. Everything that
  touches it is in `sqliteRepository.ts`, `sqliteMigrations.ts` and
  `scripts/backup.mjs`. It was chosen because it needs no native add-on to
  compile, which keeps the container image and a fresh checkout simple.
- `node:sqlite` is synchronous. A query runs on the server's main thread; that
  is fine for a crew's worth of readings and wrong for heavy analytics.
- SQLite is one file on one machine. The data directory must be on a local
  disk or a Docker volume, not a network share (WAL needs shared memory).
  Several machines writing the same data need a database server behind the
  same port.
- The crew is defined in code. There are no accounts yet, so the server
  actions record every change as `crew:morgan`, and the HTTP API has one
  shared token for all its clients.
- A release older than schema version 2 cannot open a database this release
  has migrated; it stops with a message. To go back, restore a backup taken
  before the upgrade.
