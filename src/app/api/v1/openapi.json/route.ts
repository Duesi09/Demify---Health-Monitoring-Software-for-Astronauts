import { routeHandlers } from '@/server/api/router'

// Answered at request time like the rest of the API, so nothing of it is prerendered at build time.
export const dynamic = 'force-dynamic'

const route = routeHandlers('/openapi.json')

export const GET = route.GET
export const POST = route.POST
export const PUT = route.PUT
export const PATCH = route.PATCH
export const DELETE = route.DELETE
export const OPTIONS = route.OPTIONS
