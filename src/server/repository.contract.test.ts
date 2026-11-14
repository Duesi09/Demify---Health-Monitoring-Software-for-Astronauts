import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createJsonRepository, JSON_FILE } from './jsonRepository'
import { StoreInputError, type ReadingRepository, type RepositoryOptions } from './repository'
import { createSqliteRepository, SQLITE_FILE } from './sqliteRepository'
import { device, manual, removeTempDataDirs, tempDataDir, TEST_CREW, tickingClock } from './testing'

/**
 * The contract every storage driver has to keep. Each test runs once per
 * driver; a new driver joins by adding one entry to DRIVERS.
 */

interface Driver {
  name: 'sqlite' | 'json'
  create(options: RepositoryOptions): ReadingRepository
  /** Puts rows straight into storage for morgan: two that are not valid readings, then spo2 96 on day 5. */
  plantRows(dataDir: string): Promise<void>
}

const DRIVERS: Driver[] = [
  {
    name: 'sqlite',
    create: createSqliteRepository,
    async plantRows(dataDir) {
      const db = new DatabaseSync(path.join(dataDir, SQLITE_FILE))
      const insert = db.prepare(
        "INSERT INTO readings (crew_id, day, metric, value, source, created_at, updated_at) VALUES ('morgan', ?, ?, ?, ?, 'x', 'x')",
      )
      insert.run(5, 'unknown', 1, 'manual')
      insert.run(6, 'spo2', Infinity, 'manual')
      insert.run(7, 'spo2', 97, 'made-up')
      insert.run(5, 'spo2', 96, 'manual')
      db.close()
    },
  },
  {
    name: 'json',
    create: createJsonRepository,
    async plantRows(dataDir) {
      await writeFile(
        path.join(dataDir, JSON_FILE),
        JSON.stringify([
          { day: 5, metric: 'unknown', value: 1, source: 'manual' },
          { day: 6, metric: 'spo2', value: 'x', source: 'manual' },
          { day: 7, metric: 'spo2', value: 97, source: 'made-up' },
          { day: 5, metric: 'spo2', value: 96, source: 'manual' },
        ]),
      )
    },
  },
]

afterAll(removeTempDataDirs)

describe.each(DRIVERS)('reading repository contract: $name driver', (driver) => {
  let dataDir: string
  let repository: ReadingRepository
  const open = () => driver.create({ dataDir, crew: TEST_CREW, now: tickingClock() })

  beforeEach(async () => {
    dataDir = await tempDataDir()
    repository = open()
  })

  afterEach(() => repository.close())

  it('starts empty', async () => {
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect(await repository.listAuditTrail()).toEqual([])
    expect((await repository.health()).counts).toMatchObject({ readings: 0, auditEntries: 0 })
  })

  it('saves readings and replaces an earlier one for the same day and indicator', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 94), manual(6, 'bodyTemp', 36.9)], 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 94), manual(6, 'bodyTemp', 36.9)])
  })

  it('returns readings by mission day, whatever the order they were saved in', async () => {
    await repository.saveManualReadings('morgan', [manual(9, 'mood', 4), manual(2, 'systolic', 118)], 'crew:morgan')
    await repository.saveManualReadings('morgan', [manual(2, 'diastolic', 76)], 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([
      manual(2, 'diastolic', 76),
      manual(2, 'systolic', 118),
      manual(9, 'mood', 4),
    ])
  })

  it('keeps the last entry when one save names a day and indicator twice', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96), manual(5, 'spo2', 93)], 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 93)])
  })

  it('clears the manual readings of a crew member and says how many there were', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96), manual(6, 'mood', 4)], 'crew:morgan')
    expect(await repository.clearManualReadings('morgan', 'crew:morgan')).toBe(2)
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect(await repository.clearManualReadings('morgan', 'crew:morgan')).toBe(0)
  })

  it('keeps the readings of two crew members apart', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await repository.saveManualReadings('chen', [manual(5, 'spo2', 91), manual(8, 'mood', 2)], 'crew:chen')
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96)])
    expect(await repository.listManualReadings('chen')).toEqual([manual(5, 'spo2', 91), manual(8, 'mood', 2)])

    await repository.clearManualReadings('morgan', 'crew:morgan')
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect(await repository.listManualReadings('chen')).toHaveLength(2)
  })

  it('keeps every reading when many saves arrive at once', async () => {
    const days = Array.from({ length: 40 }, (_, index) => index + 1)
    await Promise.all(
      days.flatMap((day) => [
        repository.saveManualReadings('morgan', [manual(day, 'mood', 4)], 'crew:morgan'),
        repository.saveManualReadings('chen', [manual(day, 'restingHr', 60), manual(day, 'spo2', 97)], 'crew:chen'),
      ]),
    )
    expect(await repository.listManualReadings('morgan')).toHaveLength(40)
    expect(await repository.listManualReadings('chen')).toHaveLength(80)
    expect(await repository.listAuditTrail({ limit: 1000 })).toHaveLength(120)
  })

  it('ignores rows in storage that are not valid readings', async () => {
    // The first save makes sure the files and tables exist before rows are planted in them.
    await repository.saveManualReadings('chen', [manual(1, 'mood', 3)], 'crew:chen')
    await driver.plantRows(dataDir)
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96)])
    expect(await repository.listReadings('morgan')).toEqual([manual(5, 'spo2', 96)])
  })

  it('reports its health', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96), manual(6, 'mood', 4)], 'crew:morgan')
    await repository.saveManualReadings('chen', [manual(5, 'spo2', 91)], 'crew:chen')
    await repository.clearManualReadings('chen', 'crew:chen')
    const health = await repository.health()
    expect(health.driver).toBe(driver.name)
    expect(repository.driver).toBe(driver.name)
    expect(health.schemaVersion).toBeGreaterThanOrEqual(1)
    expect(health.writable).toBe(true)
    expect(health.audit).toBe(driver.name === 'sqlite' ? 'transactional' : 'best-effort')
    expect(health.counts).toEqual({ crewMembers: 2, readings: 2, auditEntries: 4 })
  })

  it('keeps what was saved after the server restarts', async () => {
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    await repository.close()
    repository = open()
    expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 96)])
    expect(await repository.listAuditTrail()).toHaveLength(1)
  })

  describe('device readings', () => {
    it('keeps a device reading and a manual reading for the same day and indicator side by side', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93), device(4, 'restingHr', 61)], 'api:oximeter')
      // Saved again by hand after the device: neither source overwrites the other.
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 95)], 'crew:morgan')

      expect(await repository.listReadings('morgan')).toEqual([device(4, 'restingHr', 61), device(5, 'spo2', 93), manual(5, 'spo2', 95)])
      expect(await repository.listManualReadings('morgan')).toEqual([manual(5, 'spo2', 95)])
      expect(await repository.listReadings('chen')).toEqual([])
    })

    it('replaces an earlier device reading for the same day and indicator, so sending twice is harmless', async () => {
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 91), device(5, 'spo2', 90)], 'api:oximeter')
      expect(await repository.listReadings('morgan')).toEqual([device(5, 'spo2', 90)])
    })

    it('records each device reading in the audit trail against the earlier reading of its own source', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 91)], 'api:oximeter')

      const trail = await repository.listAuditTrail()
      expect(trail.map(({ id: _id, at: _at, ...entry }) => entry)).toEqual([
        { actor: 'api:oximeter', crewId: 'morgan', action: 'replace', day: 5, metric: 'spo2', before: 93, after: 91 },
        { actor: 'api:oximeter', crewId: 'morgan', action: 'create', day: 5, metric: 'spo2', before: null, after: 93 },
        { actor: 'crew:morgan', crewId: 'morgan', action: 'create', day: 5, metric: 'spo2', before: null, after: 96 },
      ])
    })

    it('stay when the manual readings are cleared', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
      expect(await repository.clearManualReadings('morgan', 'crew:morgan')).toBe(1)
      expect(await repository.listReadings('morgan')).toEqual([device(5, 'spo2', 93)])
      expect((await repository.health()).counts.readings).toBe(1)
    })

    it('are kept after the server restarts', async () => {
      await repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], 'api:oximeter')
      await repository.close()
      repository = open()
      expect(await repository.listReadings('morgan')).toEqual([device(5, 'spo2', 93)])
    })

    it('saves none of a batch when one reading is not a valid device reading', async () => {
      await expect(repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93), manual(6, 'mood', 4)], 'api:oximeter')).rejects.toThrow(
        StoreInputError,
      )
      await expect(repository.saveManualReadings('morgan', [device(5, 'spo2', 93)], 'crew:morgan')).rejects.toThrow(StoreInputError)
      await expect(repository.saveDeviceReadings('morgan', [device(5, 'spo2', 93)], '')).rejects.toThrow(StoreInputError)
      await expect(repository.saveDeviceReadings('nobody', [device(5, 'spo2', 93)], 'api:oximeter')).rejects.toThrow(StoreInputError)
      expect(await repository.listReadings('morgan')).toEqual([])
      expect(await repository.listAuditTrail()).toEqual([])
    })
  })

  describe('what it refuses', () => {
    it('refuses a crew member who is not on the crew', async () => {
      await expect(repository.listManualReadings('nobody')).rejects.toThrow(StoreInputError)
      await expect(repository.saveManualReadings('nobody', [manual(5, 'spo2', 96)], 'crew:nobody')).rejects.toThrow(StoreInputError)
      await expect(repository.clearManualReadings('../morgan', 'crew:morgan')).rejects.toThrow(StoreInputError)
    })

    it('refuses a change that does not name who made it', async () => {
      await expect(repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], '')).rejects.toThrow(StoreInputError)
      await expect(repository.clearManualReadings('morgan', ' ')).rejects.toThrow(StoreInputError)
      await expect(repository.clearManualReadings('morgan', 'line\nbreak')).rejects.toThrow(StoreInputError)
      expect(await repository.listAuditTrail()).toEqual([])
    })

    it('saves none of a batch when one reading in it is not valid', async () => {
      const batch = [manual(5, 'spo2', 96), manual(5.5, 'mood', 4)]
      await expect(repository.saveManualReadings('morgan', batch, 'crew:morgan')).rejects.toThrow(StoreInputError)
      await expect(
        repository.saveManualReadings('morgan', [{ day: 5, metric: 'spo2', value: 96, source: 'simulated' }], 'crew:morgan'),
      ).rejects.toThrow(StoreInputError)
      await expect(repository.saveManualReadings('morgan', [manual(5, 'spo2', Number.NaN)], 'crew:morgan')).rejects.toThrow(
        StoreInputError,
      )
      expect(await repository.listManualReadings('morgan')).toEqual([])
      expect(await repository.listAuditTrail()).toEqual([])
    })
  })

  describe('audit trail', () => {
    it('records create, replace and clear with the actor and the values before and after', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 94)], 'api:ground')
      await repository.clearManualReadings('morgan', 'crew:morgan')

      const trail = await repository.listAuditTrail()
      expect(trail.map(({ id: _id, at: _at, ...entry }) => entry)).toEqual([
        { actor: 'crew:morgan', crewId: 'morgan', action: 'clear', day: 5, metric: 'spo2', before: 94, after: null },
        { actor: 'api:ground', crewId: 'morgan', action: 'replace', day: 5, metric: 'spo2', before: 96, after: 94 },
        { actor: 'crew:morgan', crewId: 'morgan', action: 'create', day: 5, metric: 'spo2', before: null, after: 96 },
      ])
    })

    it('stamps entries with the time in UTC and numbers them in the order they happened', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
      await repository.saveManualReadings('morgan', [manual(6, 'spo2', 95)], 'crew:morgan')
      const [second, first] = await repository.listAuditTrail()
      expect(first.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(Date.parse(second.at)).toBeGreaterThan(Date.parse(first.at))
      expect(second.id).toBeGreaterThan(first.id)
    })

    it('writes one clear entry per reading removed', async () => {
      await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96), manual(6, 'mood', 4)], 'crew:morgan')
      await repository.clearManualReadings('morgan', 'crew:morgan')
      const cleared = (await repository.listAuditTrail()).filter((entry) => entry.action === 'clear')
      expect(cleared.map((entry) => [entry.day, entry.metric, entry.before, entry.after])).toEqual([
        [6, 'mood', 4, null],
        [5, 'spo2', 96, null],
      ])
    })

    it('can be read for one crew member, in pages', async () => {
      await repository.saveManualReadings('morgan', [manual(1, 'mood', 3), manual(2, 'mood', 4), manual(3, 'mood', 5)], 'crew:morgan')
      await repository.saveManualReadings('chen', [manual(1, 'mood', 2)], 'crew:chen')

      expect(await repository.listAuditTrail({ crewId: 'chen' })).toHaveLength(1)
      const firstPage = await repository.listAuditTrail({ crewId: 'morgan', limit: 2 })
      expect(firstPage.map((entry) => entry.day)).toEqual([3, 2])
      const secondPage = await repository.listAuditTrail({ crewId: 'morgan', limit: 2, beforeId: firstPage[1].id })
      expect(secondPage.map((entry) => entry.day)).toEqual([1])
      await expect(repository.listAuditTrail({ limit: 0 })).rejects.toThrow(StoreInputError)
    })
  })
})
