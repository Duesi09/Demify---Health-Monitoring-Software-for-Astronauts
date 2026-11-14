import 'server-only'
import type { CrewMember } from '@/domain/crew'
import type { ReadingSource } from '@/domain/types'
import { getMissionReadings } from '../mission'
import { byDayThenMetric } from '../repository'
import { getRepository } from '../store'
import { metricsCatalog } from './catalog'
import { crewList } from './crew'
import type { OperationId } from './definitions'
import { evaluationView } from './evaluation'
import { CLIENT_HEADER } from './limits'
import { buildOpenApiDocument } from './openapi'
import type { ParameterValue } from './params'
import { filterReadings, parseBatch } from './readings'
import { serverStatus } from './status'

/*
 * What each operation does once the router has let the request through:
 * access is checked, the crew member exists, the parameters are parsed and
 * within their limits. A handler returns the body of the 200 response, or
 * throws an ApiError.
 */

export interface HandlerInput {
  /** The crew member named in the path. The router sets it for every operation that has a `crewId`. */
  crew?: CrewMember
  /** Query and header parameters by name, as declared by the operation. */
  params: Record<string, ParameterValue>
  /** The parsed JSON body, for operations that take one. */
  body?: unknown
}

type Handler = (input: HandlerInput) => unknown

function crewOf(input: HandlerInput): CrewMember {
  if (!input.crew) throw new Error('This operation has no crew member in its path.')
  return input.crew
}

export const HANDLERS: Record<OperationId, Handler> = {
  getStatus: () => serverStatus(),

  getOpenApi: () => buildOpenApiDocument(),

  getMetricsCatalog: () => metricsCatalog(),

  listCrew: () => crewList(),

  async listReadings(input) {
    const crew = crewOf(input)
    const { from, to, source } = input.params
    const readings = filterReadings(await getMissionReadings(crew.id), {
      from: from as number | undefined,
      to: to as number | undefined,
      source: source as ReadingSource | undefined,
    })
    return { crewId: crew.id, count: readings.length, readings }
  },

  async saveReadings(input) {
    const crew = crewOf(input)
    const readings = parseBatch(input.body)
    // The client name was checked against its pattern by the router; it is a label for the trail, not an identity.
    const actor = `api:${input.params[CLIENT_HEADER]}`
    const repository = await getRepository()
    await repository.saveDeviceReadings(crew.id, readings, actor)
    return { crewId: crew.id, actor, saved: readings.length, readings: [...readings].sort(byDayThenMetric) }
  },

  async getEvaluation(input) {
    const crew = crewOf(input)
    return evaluationView(crew.id, await getMissionReadings(crew.id), input.params.day as number)
  },

  async listAudit(input) {
    const crew = crewOf(input)
    const limit = input.params.limit as number
    const cursor = input.params.cursor as string | undefined
    const repository = await getRepository()
    // One more than asked for: the extra entry only tells whether an older page exists.
    const found = await repository.listAuditTrail({
      crewId: crew.id,
      limit: limit + 1,
      beforeId: cursor === undefined ? undefined : Number(cursor),
    })
    const entries = found.slice(0, limit)
    return {
      crewId: crew.id,
      entries: entries.map((e) => ({
        id: e.id,
        at: e.at,
        actor: e.actor,
        crewId: e.crewId,
        action: e.action,
        day: e.day,
        metric: e.metric,
        before: e.before,
        after: e.after,
      })),
      nextCursor: found.length > limit ? String(entries[entries.length - 1].id) : null,
    }
  },
}
