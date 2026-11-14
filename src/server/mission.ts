import 'server-only'
import { DEFAULT_CREW_ID } from '@/domain/crew'
import { simulateMission } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { getRepository } from './store'

/**
 * Everything recorded for a crew member: the sensor log plus the readings
 * they entered by hand. The simulated sensor log stands in for the default
 * crew member's hardware; other crew members have no sensors yet.
 */
export async function getMissionReadings(crewId: string = DEFAULT_CREW_ID): Promise<Reading[]> {
  const repository = await getRepository()
  const manual = await repository.listManualReadings(crewId)
  return crewId === DEFAULT_CREW_ID ? [...simulateMission(), ...manual] : manual
}
