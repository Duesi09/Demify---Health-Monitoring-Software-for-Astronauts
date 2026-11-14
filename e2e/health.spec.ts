import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

test.describe('Liveness endpoint', () => {
  test('GET /api/health answers with status, version and uptime, uncached', async ({ request }) => {
    const response = await request.get('/api/health')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/json')
    expect(response.headers()['cache-control']).toBe('no-store')
    const body = await response.json()
    expect(body).toEqual({ status: 'ok', version, uptimeSeconds: expect.any(Number) })
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})
