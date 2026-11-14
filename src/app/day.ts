import { MISSION_DAYS } from '@/domain/simulator'

/** The mission day every page opens on when the address names none. */
export const DEFAULT_DAY = 42

/** Reads the `day` query parameter; anything that is not a mission day gives the default. */
export function parseDay(value: string | string[] | undefined): number {
  const day = Number(Array.isArray(value) ? value[0] : value)
  return Number.isInteger(day) && day >= 1 && day <= MISSION_DAYS ? day : DEFAULT_DAY
}
