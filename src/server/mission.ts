import 'server-only'
import { DEFAULT_CREW_ID } from '@/domain/crew'
import { simulateMission } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { getRepository } from './store'

/**
 * Everything recorded for a crew member: the sensor log plus the stored
 * readings, which devices sent through the HTTP API or the crew member
 * entered by hand. The simulated sensor log stands in for the default crew
 * member's hardware; other crew members have no simulated log.
 */
export async function getMissionReadings(crewId: string = DEFAULT_CREW_ID): Promise<Reading[]> {
  const repository = await getRepository()
  const stored = await repository.listReadings(crewId)
  return crewId === DEFAULT_CREW_ID ? [...simulateMission(), ...stored] : stored
}
