import { simulateMission } from '@/domain/simulator'
import type { Reading } from '@/domain/types'
import { loadManualReadings } from './readingStore'

/**
 * Everything recorded for the crew member: the simulated sensor log plus the
 * readings they entered by hand.
 */
export async function getMissionReadings(): Promise<Reading[]> {
  return [...simulateMission(), ...(await loadManualReadings())]
}
