import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { removeTempDataDirs, tempDataDir } from '@/server/testing'

// Outside a Next server there is no page cache to clear; the test only checks that it is asked for.
const revalidatePath = vi.hoisted(() => vi.fn())
vi.mock('next/cache', () => ({ revalidatePath }))

async function load() {
  vi.resetModules()
  return { ...(await import('./actions')), ...(await import('@/server/store')) }
}

describe.each(['sqlite', 'json'])('server actions on the %s driver', (store) => {
  beforeEach(async () => {
    vi.stubEnv('DEMIFY_DATA_DIR', await tempDataDir())
    vi.stubEnv('DEMIFY_STORE', store)
    revalidatePath.mockClear()
  })

  afterEach(async () => {
    await (await load()).closeRepository()
    vi.unstubAllEnvs()
  })

  afterAll(removeTempDataDirs)

  it('saves readings for the crew member, in their name, and refreshes every page', async () => {
    const { logReadings, getRepository } = await load()
    const result = await logReadings(90, [
      { metric: 'systolic', value: 118 },
      { metric: 'diastolic', value: 76 },
      { metric: 'bodyTemp', value: 36.94 },
    ])
    const saved = [
      { day: 90, metric: 'systolic', value: 118, source: 'manual' },
      { day: 90, metric: 'diastolic', value: 76, source: 'manual' },
      { day: 90, metric: 'bodyTemp', value: 36.9, source: 'manual' },
    ]
    expect(result).toEqual({ ok: true, readings: saved })

    const repository = await getRepository()
    expect(repository.driver).toBe(store)
    expect(await repository.listManualReadings('morgan')).toEqual(expect.arrayContaining(saved))
    const trail = await repository.listAuditTrail()
    expect(trail).toHaveLength(3)
    expect(trail.every((entry) => entry.actor === 'crew:morgan' && entry.crewId === 'morgan')).toBe(true)
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/', 'layout')
  })

  it('turns bad input away with the same messages as before, and saves nothing', async () => {
    const { logReadings, getRepository } = await load()
    expect(await logReadings(181, [{ metric: 'mood', value: 4 }])).toEqual({ ok: false, error: 'That mission day does not exist.' })
    expect(await logReadings(90, [])).toEqual({ ok: false, error: 'Nothing to save.' })
    expect(await logReadings(90, 'mood')).toEqual({ ok: false, error: 'Nothing to save.' })
    expect(await logReadings(90, [{ metric: 'weight', value: 70 }])).toEqual({ ok: false, error: 'Unknown health indicator.' })
    expect(await logReadings(90, [{ metric: 'mood', value: 'fine' }])).toMatchObject({ ok: false })
    expect(
      await logReadings(90, [
        { metric: 'systolic', value: 76 },
        { metric: 'diastolic', value: 118 },
      ]),
    ).toEqual({ ok: false, error: 'Systolic pressure must be higher than diastolic pressure.' })

    expect(await (await getRepository()).listManualReadings('morgan')).toEqual([])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('removes the manual readings and refreshes every page', async () => {
    const { logReadings, resetManualReadings, getRepository } = await load()
    await logReadings(90, [{ metric: 'mood', value: 4 }])
    revalidatePath.mockClear()

    await resetManualReadings()
    const repository = await getRepository()
    expect(await repository.listManualReadings('morgan')).toEqual([])
    expect((await repository.listAuditTrail())[0]).toMatchObject({ action: 'clear', actor: 'crew:morgan', before: 4, after: null })
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith('/', 'layout')
  })
})
