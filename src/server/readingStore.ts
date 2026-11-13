import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isMetricId } from '@/domain/validate'
import type { Reading } from '@/domain/types'

/**
 * Stores the readings crew members enter by hand, as a JSON file on the
 * machine running the server. Good enough for one on-board computer and for
 * local development; it does not persist on serverless hosting, where a real
 * database has to take its place.
 */

const DATA_DIR = process.env.DEMIFY_DATA_DIR ?? path.join(process.cwd(), '.data')
const FILE = path.join(DATA_DIR, 'manual-readings.json')

/** Serialises writes so two saves at once cannot overwrite each other. */
let queue: Promise<unknown> = Promise.resolve()

function isReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    Number.isInteger(r.day) &&
    isMetricId(r.metric) &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    r.source === 'manual'
  )
}

export async function loadManualReadings(): Promise<Reading[]> {
  let text: string
  try {
    text = await fs.readFile(FILE, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const parsed: unknown = JSON.parse(text)
  return Array.isArray(parsed) ? parsed.filter(isReading) : []
}

async function write(readings: Reading[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })
  const temp = `${FILE}.${process.pid}.tmp`
  await fs.writeFile(temp, JSON.stringify(readings, null, 2), 'utf8')
  await fs.rename(temp, FILE)
}

/** Adds readings, replacing any earlier manual reading for the same day and metric. */
export function saveManualReadings(added: Reading[]): Promise<void> {
  const task = queue.then(async () => {
    const existing = await loadManualReadings()
    const kept = existing.filter(
      (e) => !added.some((a) => a.day === e.day && a.metric === e.metric),
    )
    await write([...kept, ...added])
  })
  queue = task.catch(() => undefined)
  return task
}

export function clearManualReadings(): Promise<void> {
  const task = queue.then(() => write([]))
  queue = task.catch(() => undefined)
  return task
}
