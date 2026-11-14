import { unknownRouteHandlers } from '@/server/api/router'

// Catches every address under /api/v1 that no other route file answers, so an
// unknown address gets the API's JSON error and not the HTML page of the app.
export const dynamic = 'force-dynamic'

const route = unknownRouteHandlers()

export const GET = route.GET
export const POST = route.POST
export const PUT = route.PUT
export const PATCH = route.PATCH
export const DELETE = route.DELETE
export const OPTIONS = route.OPTIONS
