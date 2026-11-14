/**
 * The crew. One member today; the data layer keys everything by crew member
 * id, so a whole crew is a matter of adding entries here.
 */

export interface CrewMember {
  /** Stable key used in storage and file names: lower case letters, digits and hyphens. */
  id: string
  name: string
  role: string
}

export const CREW: readonly CrewMember[] = [{ id: 'morgan', name: 'A. Morgan', role: 'Flight Engineer' }]

/** The crew member every page shows until there is a way to choose one. */
export const DEFAULT_CREW_ID = 'morgan'

/** Ids end up in file names and database keys, so their shape is strict. */
const CREW_ID = /^[a-z][a-z0-9-]{0,31}$/

/** Checks the shape of an id only; whether that crew member exists is a storage question. */
export function isCrewId(value: unknown): value is string {
  return typeof value === 'string' && CREW_ID.test(value)
}

export function findCrewMember(id: string, crew: readonly CrewMember[] = CREW): CrewMember | undefined {
  return crew.find((member) => member.id === id)
}
