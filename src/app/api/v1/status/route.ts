import { routeHandlers } from '@/server/api/router'

// Readiness is a fact of this moment: answered at request time, never at build time or from a cache.
export const dynamic = 'force-dynamic'

const route = routeHandlers('/status')

export const GET = route.GET
export const POST = route.POST
export const PUT = route.PUT
export const PATCH = route.PATCH
export const DELETE = route.DELETE
export const OPTIONS = route.OPTIONS
