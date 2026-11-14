import { describe, expect, it } from 'vitest'
import pkg from '../../../../package.json'
import { GET, dynamic } from './route'

describe('GET /api/health', () => {
  it('reports status, version and uptime', async () => {
    const response = GET()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body).toEqual({ status: 'ok', version: pkg.version, uptimeSeconds: expect.any(Number) })
    expect(Number.isInteger(body.uptimeSeconds)).toBe(true)
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })

  it('is never cached', () => {
    expect(GET().headers.get('cache-control')).toBe('no-store')
    expect(dynamic).toBe('force-dynamic')
  })
})
