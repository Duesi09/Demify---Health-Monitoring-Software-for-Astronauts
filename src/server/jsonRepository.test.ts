import { appendFile, chmod, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AUDIT_FILE, createJsonRepository, JSON_FILE } from './jsonRepository'
import type { ReadingRepository } from './repository'
import { device, manual, removeTempDataDirs, tempDataDir, TEST_CREW, tickingClock } from './testing'

let dataDir: string
let repository: ReadingRepository
const file = (name = JSON_FILE) => path.join(dataDir, name)

beforeEach(async () => {
  dataDir = await tempDataDir()
  repository = createJsonRepository({ dataDir, crew: TEST_CREW, now: tickingClock() })
})

afterEach(async () => {
  await repository.close()
  vi.restoreAllMocks()
})

afterAll(removeTempDataDirs)

describe('json driver', () => {
  it('keeps the file format the project has always used for the default crew member', async () => {
    await writeFile(file(), JSON.stringify([{ day: 5, metric: 'spo2', value: 96, source: 'manual' }]))
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96)])

    await repository.saveManualReadings('morgan', [manual(6, 'bodyTemp', 36.9)], 'crew:morgan')
    expect(JSON.parse(await readFile(file(), 'utf8'))).toEqual([manual(5, 'spo2', 96), manual(6, 'bodyTemp', 36.9)])
  })

  it('keeps device readings in the same file, marked by their source', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
    expect(JSON.parse(await readFile(file(), 'utf8'))).toEqual([manual(5, 'spo2', 96), device(5, 'spo2', 93)])

    await repository.clearManualReadings('morgan', 'crew:morgan')
    expect(JSON.parse(await readFile(file(), 'utf8'))).toEqual([device(5, 'spo2', 93)])
  })

  it('keeps every other crew member in a file of their own', async () => {
    await repository.saveManualReadings('chen', [manual(5, 'spo2', 91)], 'crew:chen')
    expect(JSON.parse(await readFile(file('manual-readings.chen.json'), 'utf8'))).toEqual([manual(5, 'spo2', 91)])
    expect(await readdir(dataDir)).not.toContain(JSON_FILE)
  })

  it('survives a damaged file, sets it aside and accepts new readings', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await writeFile(file(), '{not json')
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect((await readdir(dataDir)).some((name) => name.startsWith(`${JSON_FILE}.damaged-`))).toBe(true)
    expect(logged).toHaveBeenCalledOnce()

    await repository.saveManualReadings('morgan', [manual(7, 'restingHr', 61)], 'crew:morgan')
    expect(JSON.parse(await readFile(file(), 'utf8'))).toHaveLength(1)
  })

  it('treats a file that holds something other than a list as empty', async () => {
    await writeFile(file(), JSON.stringify({ readings: [] }))
    expect(await repository.listManualReadings('morgan')).toEqual([])
  })

  it('appends the audit trail to a second file, one entry per line', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 94)], 'crew:morgan')
    const lines = (await readFile(file(AUDIT_FILE), 'utf8')).trimEnd().split('\n')
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { at: '2031-03-01T08:00:00.000Z', actor: 'crew:morgan', crewId: 'morgan', action: 'create', day: 5, metric: 'spo2', before: null, after: 96 },
      { at: '2031-03-01T08:00:01.000Z', actor: 'crew:morgan', crewId: 'morgan', action: 'replace', day: 5, metric: 'spo2', before: 96, after: 94 },
    ])
  })

  it('skips a damaged line of the audit trail and keeps the rest readable', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await appendFile(file(AUDIT_FILE), '{half a line\n{"at":"x"}\n')
    await repository.saveManualReadings('morgan', [manual(6, 'mood', 4)], 'crew:morgan')
    const trail = await repository.listAuditTrail()
    expect(trail.map((entry) => [entry.id, entry.day])).toEqual([
      [4, 6],
      [1, 5],
    ])
  })

  // Root may write anywhere, so the check proves nothing when the tests run as root.
  it.skipIf(process.getuid?.() === 0)('reports that it is not writable when the data directory is read-only', async () => {
    await chmod(dataDir, 0o500)
    expect((await repository.health()).writable).toBe(false)
    await chmod(dataDir, 0o700)
  })
})
