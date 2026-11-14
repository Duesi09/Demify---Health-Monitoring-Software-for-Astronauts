import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

type Store = typeof import('./readingStore')
let store: Store
let dir: string
const file = () => path.join(dir, 'manual-readings.json')

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'demify-store-'))
  process.env.DEMIFY_DATA_DIR = dir
  store = await import('./readingStore')
})

describe('reading store', () => {
  it('starts empty when nothing has been saved', async () => {
    expect(await store.loadManualReadings()).toEqual([])
  })

  it('saves readings and replaces an earlier one for the same day and indicator', async () => {
    await store.saveManualReadings([{ day: 5, metric: 'spo2', value: 96, source: 'manual' }])
    await store.saveManualReadings([
      { day: 5, metric: 'spo2', value: 94, source: 'manual' },
      { day: 6, metric: 'bodyTemp', value: 36.9, source: 'manual' },
    ])
    const saved = await store.loadManualReadings()
    expect(saved).toHaveLength(2)
    expect(saved.find((r) => r.metric === 'spo2')?.value).toBe(94)
  })

  it('keeps every reading when several saves arrive at once', async () => {
    await store.clearManualReadings()
    await Promise.all(
      [1, 2, 3, 4, 5].map((day) => store.saveManualReadings([{ day, metric: 'mood', value: 4, source: 'manual' }])),
    )
    expect(await store.loadManualReadings()).toHaveLength(5)
  })

  it('drops rows that are not valid readings', async () => {
    await writeFile(
      file(),
      JSON.stringify([
        { day: 5, metric: 'spo2', value: 'x', source: 'manual' },
        { day: 5, metric: 'unknown', value: 1, source: 'manual' },
        { day: 5, metric: 'spo2', value: 96, source: 'manual' },
      ]),
    )
    expect(await store.loadManualReadings()).toEqual([{ day: 5, metric: 'spo2', value: 96, source: 'manual' }])
  })

  it('survives a damaged file, sets it aside and accepts new readings', async () => {
    await writeFile(file(), '{not json')
    expect(await store.loadManualReadings()).toEqual([])
    expect((await readdir(dir)).some((name) => name.includes('.damaged-'))).toBe(true)

    await store.saveManualReadings([{ day: 7, metric: 'restingHr', value: 61, source: 'manual' }])
    expect(JSON.parse(await readFile(file(), 'utf8'))).toHaveLength(1)
  })
})
