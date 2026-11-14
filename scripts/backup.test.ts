import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { createSqliteRepository } from '@/server/sqliteRepository'
import { manual, removeTempDataDirs, tempDataDir, TEST_CREW } from '@/server/testing'

const SCRIPT = fileURLToPath(new URL('./backup.mjs', import.meta.url))

function backup(args: string[], env: Record<string, string> = {}) {
  // No DEMIFY_DATA_DIR from the surrounding shell: each test names its own.
  const { DEMIFY_DATA_DIR: _ignored, ...clean } = process.env
  return spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', SCRIPT, ...args], {
    env: { ...clean, ...env },
    encoding: 'utf8',
  })
}

afterAll(removeTempDataDirs)

describe('backup script', () => {
  it('copies a database that is in use, and the copy opens as a working database', async () => {
    const dataDir = await tempDataDir()
    const live = createSqliteRepository({ dataDir, crew: TEST_CREW })
    await live.saveManualReadings('morgan', [manual(90, 'systolic', 118), manual(90, 'diastolic', 76)], 'crew:morgan')

    // The server still holds the database open, and the readings are still in the write-ahead log.
    const restoreDir = await tempDataDir()
    const destination = path.join(restoreDir, 'demify.db')
    const result = backup([destination], { DEMIFY_DATA_DIR: dataDir })
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('2 readings, 2 audit entries')
    await live.close()

    expect(await readdir(restoreDir)).toEqual(['demify.db'])
    const restored = createSqliteRepository({ dataDir: restoreDir, crew: TEST_CREW })
    expect(await restored.listManualReadings('morgan')).toEqual([manual(90, 'diastolic', 76), manual(90, 'systolic', 118)])
    expect(await restored.listAuditTrail()).toHaveLength(2)
    await restored.close()
  })

  it('takes the data directory from --data-dir and never overwrites a file', async () => {
    const dataDir = await tempDataDir()
    await createSqliteRepository({ dataDir, crew: TEST_CREW }).close()
    const destination = path.join(await tempDataDir(), 'kept.db')
    await writeFile(destination, 'an older backup')

    const result = backup([destination, '--data-dir', dataDir])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('already exists')
  })

  it('says so when there is no database to copy, and leaves nothing behind', async () => {
    const dataDir = await tempDataDir()
    const destination = path.join(dataDir, 'backup.db')
    const result = backup([destination], { DEMIFY_DATA_DIR: dataDir })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('No database at')
    expect(existsSync(destination)).toBe(false)
  })

  it('explains how to call it', () => {
    const result = backup([])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Usage: node scripts/backup.mjs')
  })
})
