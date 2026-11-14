import { routeHandlers } from '@/server/api/router'

// Health data: answered at request time, behind the token check, never from a cache.
export const dynamic = 'force-dynamic'

const route = routeHandlers('/crew/{crewId}/audit')

export const GET = route.GET
export const POST = route.POST
export const PUT = route.PUT
export const PATCH = route.PATCH
export const DELETE = route.DELETE
export const OPTIONS = route.OPTIONS
