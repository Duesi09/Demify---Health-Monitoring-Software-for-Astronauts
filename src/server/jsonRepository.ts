import 'server-only'
import { constants, promises as fs } from 'node:fs'
import path from 'node:path'
import { DEFAULT_CREW_ID, type CrewMember } from '@/domain/crew'
import type { Reading } from '@/domain/types'
import {
  assertActor,
  assertCrewMember,
  AUDIT_ACTIONS,
  byDayThenMetric,
  checkedAuditQuery,
  checkedReadings,
  isManualReading,
  isStoredReading,
  toReading,
  type Actor,
  type AuditEntry,
  type AuditQuery,
  type ReadingRepository,
  type RepositoryOptions,
  type StoredSource,
  type StoreHealth,
} from './repository'

/**
 * The JSON driver: plain files in the data directory, nothing to set up and
 * easy to read while debugging. It is meant for one server process; for
 * anything more, use the SQLite driver.
 *
 * - `manual-readings.json` holds the default crew member's readings, in the
 *   format this project has always used: a list of readings. Since the HTTP
 *   API it also holds the readings devices sent (`"source": "device"`), so the
 *   name says less than the file holds.
 * - `manual-readings.<crew id>.json` holds any other crew member's readings.
 * - `audit-log.jsonl` is the audit trail, one JSON object per line, only ever
 *   appended to. It is written after the readings file, not together with it,
 *   so a crash between the two can leave a change without its entry. The
 *   health report says so (`audit: 'best-effort'`).
 */

export const JSON_FILE = 'manual-readings.json'
export const AUDIT_FILE = 'audit-log.jsonl'
/**
 * Version of the file format, reported as the schema version. Version 2: the
 * list may hold device readings beside the manual ones, one entry per day,
 * indicator and source.
 */
export const JSON_FORMAT_VERSION = 2

type StoredAuditEntry = Omit<AuditEntry, 'id'>

function isStoredAuditEntry(value: unknown): value is StoredAuditEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  const isValue = (v: unknown) => v === null || typeof v === 'number'
  return (
    typeof e.at === 'string' &&
    typeof e.actor === 'string' &&
    typeof e.crewId === 'string' &&
    AUDIT_ACTIONS.includes(e.action as AuditEntry['action']) &&
    Number.isInteger(e.day) &&
    typeof e.metric === 'string' &&
    isValue(e.before) &&
    isValue(e.after)
  )
}

class JsonRepository implements ReadingRepository {
  readonly driver = 'json'
  private readonly dataDir: string
  private readonly crew: readonly CrewMember[]
  private readonly now: () => Date
  /** Serialises writes so two saves at once cannot overwrite each other. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: RepositoryOptions) {
    this.dataDir = options.dataDir
    this.crew = options.crew
    this.now = options.now ?? (() => new Date())
  }

  private fileOf(crewId: string): string {
    // The default crew member keeps the original file name, so existing data keeps working.
    return path.join(this.dataDir, crewId === DEFAULT_CREW_ID ? JSON_FILE : `manual-readings.${crewId}.json`)
  }

  private get auditFile(): string {
    return path.join(this.dataDir, AUDIT_FILE)
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const task = this.queue.then(work)
    this.queue = task.catch(() => undefined)
    return task
  }

  private async load(crewId: string): Promise<Reading[]> {
    const file = this.fileOf(crewId)
    let text: string
    try {
      text = await fs.readFile(file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      // A damaged log must not take the whole monitor down. Set the file aside
      // for recovery and carry on without the manual readings.
      await fs.rename(file, `${file}.damaged-${this.now().getTime()}`).catch(() => undefined)
      console.error('The manual readings file could not be read and was set aside.')
      return []
    }
    return Array.isArray(parsed) ? parsed.filter(isStoredReading).map(toReading) : []
  }

  private async write(crewId: string, readings: Reading[]): Promise<void> {
    // Health data: a directory this server creates is readable by its own user only.
    await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 })
    const file = this.fileOf(crewId)
    // Written beside the file and renamed over it, so a crash cannot leave half a file.
    const temp = `${file}.${process.pid}.tmp`
    await fs.writeFile(temp, JSON.stringify(readings, null, 2), 'utf8')
    await fs.rename(temp, file)
  }

  private async appendAudit(entries: StoredAuditEntry[]): Promise<void> {
    if (entries.length === 0) return
    await fs.appendFile(this.auditFile, entries.map((entry) => `${JSON.stringify(entry)}\n`).join(''), 'utf8')
  }

  private async loadAudit(): Promise<AuditEntry[]> {
    let text: string
    try {
      text = await fs.readFile(this.auditFile, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const entries: AuditEntry[] = []
    text.split('\n').forEach((line, index) => {
      if (line.trim() === '') return
      try {
        const parsed: unknown = JSON.parse(line)
        // The line number is the id: lines are only ever appended, so it never changes.
        if (isStoredAuditEntry(parsed)) entries.push({ id: index + 1, ...parsed })
      } catch {
        // A damaged line is skipped; the rest of the trail stays readable.
      }
    })
    return entries
  }

  async listReadings(crewId: string): Promise<Reading[]> {
    assertCrewMember(crewId, this.crew)
    return (await this.load(crewId)).sort(byDayThenMetric)
  }

  async listManualReadings(crewId: string): Promise<Reading[]> {
    return (await this.listReadings(crewId)).filter(isManualReading)
  }

  saveManualReadings(crewId: string, readings: readonly Reading[], actor: Actor): Promise<void> {
    return this.save(crewId, readings, actor, 'manual')
  }

  saveDeviceReadings(crewId: string, readings: readonly Reading[], actor: Actor): Promise<void> {
    return this.save(crewId, readings, actor, 'device')
  }

  private save(crewId: string, readings: readonly Reading[], actor: Actor, source: StoredSource): Promise<void> {
    return this.enqueue(async () => {
      assertCrewMember(crewId, this.crew)
      assertActor(actor)
      const added = checkedReadings(readings, source)
      if (added.length === 0) return
      const existing = await this.load(crewId)
      // A reading replaces the earlier one of its own source only; the other source keeps its reading for that day.
      const same = (e: Reading, a: Reading) => e.day === a.day && e.metric === a.metric && e.source === a.source
      const kept = existing.filter((e) => !added.some((a) => same(e, a)))
      await this.write(crewId, [...kept, ...added])

      const at = this.now().toISOString()
      await this.appendAudit(
        added.map((a) => {
          const earlier = existing.find((e) => same(e, a))
          return {
            at,
            actor,
            crewId,
            action: earlier ? 'replace' : 'create',
            day: a.day,
            metric: a.metric,
            before: earlier ? earlier.value : null,
            after: a.value,
          }
        }),
      )
    })
  }

  clearManualReadings(crewId: string, actor: Actor): Promise<number> {
    return this.enqueue(async () => {
      assertCrewMember(crewId, this.crew)
      assertActor(actor)
      const stored = await this.load(crewId)
      const existing = stored.filter(isManualReading).sort(byDayThenMetric)
      await this.write(crewId, stored.filter((e) => !isManualReading(e)))
      const at = this.now().toISOString()
      // One entry per reading, so the trail keeps every value that was removed.
      await this.appendAudit(
        existing.map((e) => ({ at, actor, crewId, action: 'clear', day: e.day, metric: e.metric, before: e.value, after: null })),
      )
      return existing.length
    })
  }

  async listAuditTrail(query?: AuditQuery): Promise<AuditEntry[]> {
    const { crewId, limit, beforeId } = checkedAuditQuery(query)
    return (await this.loadAudit())
      .filter((entry) => (crewId === undefined || entry.crewId === crewId) && (beforeId === undefined || entry.id < beforeId))
      .reverse()
      .slice(0, limit)
  }

  async health(): Promise<StoreHealth> {
    let writable = true
    try {
      await fs.mkdir(this.dataDir, { recursive: true, mode: 0o700 })
      await fs.access(this.dataDir, constants.W_OK)
    } catch {
      writable = false
    }
    const perMember = await Promise.all(this.crew.map((member) => this.load(member.id)))
    return {
      driver: this.driver,
      schemaVersion: JSON_FORMAT_VERSION,
      writable,
      audit: 'best-effort',
      counts: {
        crewMembers: this.crew.length,
        readings: perMember.reduce((sum, readings) => sum + readings.length, 0),
        auditEntries: (await this.loadAudit()).length,
      },
    }
  }

  async close(): Promise<void> {
    // Nothing is held open between calls; wait for writes still under way.
    await this.queue
  }
}

/** Uses the JSON files in `dataDir`, creating them on the first save. */
export function createJsonRepository(options: RepositoryOptions): ReadingRepository {
  return new JsonRepository(options)
}
