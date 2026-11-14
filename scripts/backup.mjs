#!/usr/bin/env node
// Writes a consistent copy of the Demify SQLite database to a file.
//
//   node scripts/backup.mjs <destination file> [--data-dir <directory>]
//
// The data directory is --data-dir, else DEMIFY_DATA_DIR, else ./.data, the
// same as the server. Safe to run while the server is running: the copy is one
// snapshot of the database, taken inside a read transaction. Needs Node.js
// 22.13 or newer and nothing else. Restore: see docs/data.md.

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { DatabaseSync } from 'node:sqlite'

const DATABASE_FILE = 'demify.db'

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

function parseArguments(argv) {
  let destination
  let dataDir = process.env.DEMIFY_DATA_DIR || '.data'
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index]
    if (argument === '--data-dir') dataDir = argv[++index]
    else if (argument.startsWith('--')) return null
    else if (destination === undefined) destination = argument
    else return null
  }
  return destination && dataDir ? { destination: path.resolve(destination), dataDir: path.resolve(dataDir) } : null
}

const options = parseArguments(process.argv.slice(2))
if (!options) fail('Usage: node scripts/backup.mjs <destination file> [--data-dir <directory>]', 2)

const source = path.join(options.dataDir, DATABASE_FILE)
if (!existsSync(source)) {
  fail(`No database at ${source}. Is the data directory right, and is the server using the sqlite driver?`)
}
// A backup is never overwritten: an older copy may be the only good one.
if (existsSync(options.destination)) fail(`${options.destination} already exists. Choose a new name.`)

// Written under another name first, so the destination only ever holds a complete, checked copy.
const partial = `${options.destination}.partial`
rmSync(partial, { force: true })
mkdirSync(path.dirname(options.destination), { recursive: true, mode: 0o700 })

try {
  const database = new DatabaseSync(source, { readOnly: true })
  try {
    database.exec('PRAGMA busy_timeout = 5000')
    // VACUUM INTO copies one snapshot, including what is still in the write-ahead log, into a single file.
    database.prepare('VACUUM INTO ?').run(partial)
  } finally {
    database.close()
  }

  const copy = new DatabaseSync(partial, { readOnly: true })
  let summary
  try {
    const report = copy.prepare('PRAGMA integrity_check').all()
    if (report.length !== 1 || report[0].integrity_check !== 'ok') throw new Error('The copy failed its integrity check.')
    const number = (sql) => Number(Object.values(copy.prepare(sql).get())[0] ?? 0)
    summary = {
      schemaVersion: number('SELECT max(version) FROM schema_migrations'),
      readings: number('SELECT count(*) FROM readings'),
      auditEntries: number('SELECT count(*) FROM audit_log'),
    }
  } finally {
    copy.close()
  }

  renameSync(partial, options.destination)
  console.log(
    `Backup written to ${options.destination} at ${new Date().toISOString()}: ` +
      `schema version ${summary.schemaVersion}, ${summary.readings} readings, ${summary.auditEntries} audit entries.`,
  )
} catch (error) {
  rmSync(partial, { force: true })
  fail(`Backup failed: ${error instanceof Error ? error.message : error}`)
}
