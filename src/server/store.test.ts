import { readdir } from 'node:fs/promises'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateMission } from '@/domain/simulator'
import { device, manual, removeTempDataDirs, tempDataDir } from './testing'

let dataDir: string

/** Loads the modules afresh, the way a server process (or a reload in development) does. */
async function load() {
  vi.resetModules()
  return { ...(await import('./store')), ...(await import('./mission')), ...(await import('./config')) }
}

beforeEach(async () => {
  dataDir = await tempDataDir()
  vi.stubEnv('DEMIFY_DATA_DIR', dataDir)
  vi.stubEnv('DEMIFY_STORE', '')
})

afterEach(async () => {
  await (await load()).closeRepository()
  vi.unstubAllEnvs()
})

afterAll(removeTempDataDirs)

describe('the repository of the server process', () => {
  it('is the SQLite driver unless configured otherwise', async () => {
    const { getRepository } = await load()
    const repository = await getRepository()
    expect(repository.driver).toBe('sqlite')
    expect(await readdir(dataDir)).toContain('demify.db')
  })

  it('is the JSON driver when DEMIFY_STORE says so', async () => {
    vi.stubEnv('DEMIFY_STORE', 'json')
    const { getRepository } = await load()
    const repository = await getRepository()
    expect(repository.driver).toBe('json')
    await repository.saveManualReadings('morgan', [manual(5, 'spo2', 96)], 'crew:morgan')
    expect(await readdir(dataDir)).toEqual(['audit-log.jsonl', 'manual-readings.json'])
  })

  it('is created once, however many requests ask for it at the same time', async () => {
    const { getRepository } = await load()
    const all = await Promise.all([getRepository(), getRepository(), getRepository()])
    expect(all[1]).toBe(all[0])
    expect(all[2]).toBe(all[0])
  })

  it('stays the same instance when the modules are loaded again', async () => {
    const first = await (await load()).getRepository()
    const second = await (await load()).getRepository()
    expect(second).toBe(first)
  })

  it('does not keep a failed start: the next request tries again', async () => {
    vi.stubEnv('DEMIFY_STORE', 'tape')
    const { getRepository, ConfigError } = await load()
    await expect(getRepository()).rejects.toThrow(ConfigError)
    vi.stubEnv('DEMIFY_STORE', 'json')
    expect((await getRepository()).driver).toBe('json')
  })

  it('opens a new repository after the old one was closed', async () => {
    const { getRepository, closeRepository } = await load()
    const first = await getRepository()
    await closeRepository()
    expect(await getRepository()).not.toBe(first)
  })
})

describe('mission readings', () => {
  it('are the simulated mission plus the manual readings, for the default crew member', async () => {
    const { getRepository, getMissionReadings } = await load()
    expect(await getMissionReadings()).toEqual(simulateMission())

    await (await getRepository()).saveManualReadings('morgan', [manual(90, 'systolic', 118)], 'crew:morgan')
    const readings = await getMissionReadings()
    expect(readings).toHaveLength(simulateMission().length + 1)
    expect(readings.at(-1)).toEqual(manual(90, 'systolic', 118))
    expect(await getMissionReadings('morgan')).toEqual(readings)
  })

  it('include the readings devices sent, between the simulated and the manual ones', async () => {
    const { getRepository, getMissionReadings } = await load()
    const repository = await getRepository()
    await repository.saveManualReadings('morgan', [manual(90, 'systolic', 118)], 'crew:morgan')
    await repository.saveDeviceReadings('morgan', [device(90, 'systolic', 121)], 'api:cuff')
    expect((await getMissionReadings()).slice(simulateMission().length)).toEqual([device(90, 'systolic', 121), manual(90, 'systolic', 118)])
  })

  it('are refused for someone who is not on the crew', async () => {
    const { getMissionReadings } = await load()
    await expect(getMissionReadings('nobody')).rejects.toThrow('Unknown crew member.')
  })
})
