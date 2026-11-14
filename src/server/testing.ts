import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { CrewMember } from '@/domain/crew'
import type { MetricId, Reading } from '@/domain/types'

/** Helpers shared by the storage tests. Not used by the server itself. */

export const TEST_CREW: readonly CrewMember[] = [
  { id: 'morgan', name: 'A. Morgan', role: 'Flight Engineer' },
  { id: 'chen', name: 'L. Chen', role: 'Commander' },
]

export function manual(day: number, metric: MetricId, value: number): Reading {
  return { day, metric, value, source: 'manual' }
}

export function device(day: number, metric: MetricId, value: number): Reading {
  return { day, metric, value, source: 'device' }
}

/** A clock that moves one second forward every time it is read, so the order of events shows in the timestamps. */
export function tickingClock(start = '2031-03-01T08:00:00.000Z'): () => Date {
  let time = Date.parse(start)
  return () => {
    const now = new Date(time)
    time += 1000
    return now
  }
}

const dirs: string[] = []

export async function tempDataDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'demify-test-'))
  dirs.push(dir)
  return dir
}

export async function removeTempDataDirs(): Promise<void> {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
}
