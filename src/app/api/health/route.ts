import pkg from '../../../../package.json'

// Liveness is about this very moment, so the answer is never prerendered or cached.
export const dynamic = 'force-dynamic'

/**
 * Liveness probe for the container health check and for monitoring: it answers
 * as long as the server process can handle a request. It touches no storage.
 */
export function GET() {
  return Response.json(
    { status: 'ok', version: pkg.version, uptimeSeconds: Math.round(process.uptime()) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
