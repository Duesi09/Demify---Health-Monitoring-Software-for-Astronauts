import 'server-only'
import { isCrewId, type CrewMember } from '@/domain/crew'
import { isMetricId } from '@/domain/validate'
import { READING_SOURCES, type Reading } from '@/domain/types'
import type { StoreDriver } from './config'

/**
 * The storage port. Server code depends on this interface and never on a
 * driver, so the drivers (SQLite, JSON file, and whatever comes next) stay
 * interchangeable. Every method is asynchronous, so a networked database fits
 * behind it too.
 */
export interface ReadingRepository {
  readonly driver: StoreDriver

  /**
   * Every stored reading of a crew member, sent by a device or entered by
   * hand, oldest mission day first. One day can hold both for an indicator.
   */
  listReadings(crewId: string): Promise<Reading[]>

  /** The readings a crew member entered by hand, oldest mission day first. */
  listManualReadings(crewId: string): Promise<Reading[]>

  /**
   * Saves readings a device or a ground system sent, replacing an earlier
   * device reading for the same day and indicator. A reading entered by hand
   * for that day is left alone. All of them are saved, or none.
   */
  saveDeviceReadings(crewId: string, readings: readonly Reading[], actor: Actor): Promise<void>

  /**
   * Saves readings for a crew member, replacing an earlier reading for the
   * same day and indicator. All of them are saved, or none.
   */
  saveManualReadings(crewId: string, readings: readonly Reading[], actor: Actor): Promise<void>

  /** Removes every manual reading of a crew member and returns how many there were. */
  clearManualReadings(crewId: string, actor: Actor): Promise<number>

  /** The audit trail, newest entry first. */
  listAuditTrail(query?: AuditQuery): Promise<AuditEntry[]>

  health(): Promise<StoreHealth>

  /** Releases files and locks. The repository must not be used afterwards. */
  close(): Promise<void>
}

/**
 * Who made a change, for the audit trail. By convention `crew:<id>` for a crew
 * member, `system:<name>` for the server itself and `api:<name>` for a client
 * of the HTTP API. Never a secret: actors are stored and shown as they are.
 */
export type Actor = string

export function crewActor(crewId: string): Actor {
  return `crew:${crewId}`
}

export type AuditAction = 'create' | 'replace' | 'clear'

export const AUDIT_ACTIONS: readonly AuditAction[] = ['create', 'replace', 'clear']

/** One change to one reading. Entries are only ever added, never changed or removed. */
export interface AuditEntry {
  /** Rises with every entry; later entries have higher ids. */
  id: number
  /** When it happened: ISO 8601, UTC. */
  at: string
  actor: Actor
  crewId: string
  action: AuditAction
  day: number
  /** An indicator id. Kept as stored: the trail must still show indicators this version no longer knows. */
  metric: string
  /** The stored value before the change; null when there was none. */
  before: number | null
  /** The stored value after the change; null when the reading was removed. */
  after: number | null
}

export interface AuditQuery {
  /** Only entries about this crew member. */
  crewId?: string
  /** At most this many entries. Default 100, at most 1000. */
  limit?: number
  /** Only entries with an id below this one, to page backwards through the trail. */
  beforeId?: number
}

export interface StoreHealth {
  driver: StoreDriver
  /** Version of the schema (SQLite) or of the file format (JSON) in use. */
  schemaVersion: number
  /** False when the store cannot take a write right now, for example on a read-only disk. */
  writable: boolean
  /** How the audit trail is kept: in the same transaction as the change, or appended to a file after it. */
  audit: 'transactional' | 'best-effort'
  counts: { crewMembers: number; readings: number; auditEntries: number }
}

/** The caller passed something the store will not accept. Nothing was written. */
export class StoreInputError extends Error {
  override name = 'StoreInputError'
}

/** What every driver needs to start. */
export interface RepositoryOptions {
  /** Directory holding the data files. Created when missing. */
  dataDir: string
  /** The crew members readings may be stored for. */
  crew: readonly CrewMember[]
  /** The clock, replaceable in tests. */
  now?: () => Date
}

export const DEFAULT_AUDIT_LIMIT = 100
export const MAX_AUDIT_LIMIT = 1000

/** The sources that are stored. Simulated readings are computed, never stored. */
export type StoredSource = 'device' | 'manual'

export const STORED_SOURCES: readonly StoredSource[] = ['device', 'manual']

/** A reading as it may be stored. Used on the way in and on the way out. */
export function isStoredReading(value: unknown): value is Reading {
  if (typeof value !== 'object' || value === null) return false
  const r = value as Record<string, unknown>
  return (
    Number.isInteger(r.day) &&
    isMetricId(r.metric) &&
    typeof r.value === 'number' &&
    Number.isFinite(r.value) &&
    STORED_SOURCES.includes(r.source as StoredSource)
  )
}

export function isManualReading(value: unknown): value is Reading {
  return isStoredReading(value) && value.source === 'manual'
}

export function isDeviceReading(value: unknown): value is Reading {
  return isStoredReading(value) && value.source === 'device'
}

/** A stored reading stripped to the four fields of a Reading. */
export function toReading(r: Reading): Reading {
  return { day: r.day, metric: r.metric, value: r.value, source: r.source }
}

/**
 * Mission day first, then indicator, then source in rising precedence: the
 * same order from every driver.
 */
export function byDayThenMetric(a: Reading, b: Reading): number {
  return (
    a.day - b.day ||
    (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0) ||
    READING_SOURCES.indexOf(a.source) - READING_SOURCES.indexOf(b.source)
  )
}

export function assertCrewMember(crewId: unknown, crew: readonly CrewMember[]): asserts crewId is string {
  if (!isCrewId(crewId) || !crew.some((member) => member.id === crewId)) {
    throw new StoreInputError('Unknown crew member.')
  }
}

/** No control characters: an actor is stored and shown as it is. */
const ACTOR = /^[\x20-\x7e]{1,64}$/

export function assertActor(actor: unknown): asserts actor is Actor {
  if (typeof actor !== 'string' || !ACTOR.test(actor) || actor.trim() !== actor) {
    throw new StoreInputError('Every change must name who made it.')
  }
}

/**
 * Checks readings of one source on the way in and returns them with one entry
 * per day and indicator; when a batch names the same one twice, the last
 * entry wins.
 */
export function checkedReadings(readings: unknown, source: StoredSource = 'manual'): Reading[] {
  if (!Array.isArray(readings)) throw new StoreInputError('Readings must be a list.')
  const unique = new Map<string, Reading>()
  for (const reading of readings) {
    if (!isStoredReading(reading) || reading.source !== source) throw new StoreInputError(`Not a valid ${source} reading.`)
    unique.set(`${reading.day}:${reading.metric}`, toReading(reading))
  }
  return [...unique.values()]
}

/** Brings an audit query to its defaults and limits. */
export function checkedAuditQuery(query: AuditQuery = {}): Required<Pick<AuditQuery, 'limit'>> & AuditQuery {
  const { crewId, limit = DEFAULT_AUDIT_LIMIT, beforeId } = query
  if (crewId !== undefined && !isCrewId(crewId)) throw new StoreInputError('Unknown crew member.')
  if (!Number.isInteger(limit) || limit < 1) throw new StoreInputError('The limit must be a whole number above 0.')
  if (beforeId !== undefined && !Number.isInteger(beforeId)) throw new StoreInputError('Not a valid entry id.')
  return { crewId, limit: Math.min(limit, MAX_AUDIT_LIMIT), beforeId }
}
