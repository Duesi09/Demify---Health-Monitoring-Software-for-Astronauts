import 'server-only'
import { CREW, DEFAULT_CREW_ID } from '@/domain/crew'

/** The crew as the API lists it. Says who has the simulated sensor log, so its readings are not taken for measurements. */
export function crewList() {
  return {
    crew: CREW.map((member) => ({
      id: member.id,
      name: member.name,
      role: member.role,
      simulatedSensorLog: member.id === DEFAULT_CREW_ID,
    })),
  }
}
