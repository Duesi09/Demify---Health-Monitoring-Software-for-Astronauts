import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateMission } from '@/domain/simulator'
import { tempDataDir } from '../testing'
import { call as send, removeTempDataDirs, repository, startServer, stopServer, TEST_CLIENT, TEST_TOKEN, type CallOptions } from './testing'

/*
 * The API, endpoint by endpoint, through the real route files and against a
 * repository in a temporary directory.
 */

const READINGS = '/crew/morgan/readings'
const hr = (value: number, day = 51) => ({ day, metric: 'restingHr', value })

/**
 * Sends a request and checks what holds for every response of the API: it is
 * never cacheable, an error is a problem document, and its status is one the
 * OpenAPI document declares for that operation.
 */
async function call(method: string, target: string, options?: CallOptions): Promise<Response> {
  const response = await send(method, target, options)
  expect(response.headers.get('cache-control')).toBe('no-store')
  if (response.status >= 400) {
    expect(response.headers.get('content-type')).toBe('application/problem+json; charset=utf-8')
  } else if (response.status === 200) {
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
  }

  const { OPERATIONS, declaredResponses } = await import('./definitions')
  const pathname = new URL(target, 'http://demify.test').pathname
  const operation = OPERATIONS.find(
    (candidate) =>
      candidate.method === (method === 'HEAD' ? 'GET' : method) &&
      new RegExp(`^${candidate.path.replace(/\./g, '\\.').replace(/\{[^}]+\}/g, '[^/]+')}$`).test(pathname),
  )
  if (operation) expect(declaredResponses(operation).map((declared) => declared.status)).toContain(response.status)
  else expect([204, 404, 405]).toContain(response.status)
  return response
}

async function problem(response: Response, status: number, slug: string) {
  expect(response.status).toBe(status)
  const body = (await response.json()) as { type: string; title: string; status: number; detail: string; errors?: { in: string; field: string; detail: string }[] }
  expect(body.type).toBe(`/api/docs#problem-${slug}`)
  expect(body.status).toBe(status)
  expect(body.title).toEqual(expect.any(String))
  expect(body.detail).toEqual(expect.any(String))
  return body
}

const post = (readings: unknown, options?: CallOptions) => call('POST', READINGS, { json: { readings }, ...options })
const stored = async () => (await repository()).listReadings('morgan')
const trail = async () => (await repository()).listAuditTrail()

beforeEach(() => startServer())

afterEach(async () => {
  await stopServer()
  vi.restoreAllMocks()
})

afterAll(removeTempDataDirs)

describe('GET /status', () => {
  it.each(['sqlite', 'json'] as const)('reports readiness, the version and the %s store, without a token', async (store) => {
    await startServer({ store })
    const response = await call('GET', '/status', { token: null })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ready: true,
      version: '0.1.0',
      apiVersion: 'v1',
      dataApiEnabled: true,
      storage: {
        driver: store,
        schemaVersion: expect.any(Number),
        writable: true,
        audit: store === 'sqlite' ? 'transactional' : 'best-effort',
      },
    })
  })

  it('says that the data API is off when no token is configured, and gives no secret away when one is', async () => {
    const withToken = await (await call('GET', '/status', { token: null })).text()
    expect(withToken).not.toContain(TEST_TOKEN)

    await startServer({ token: null })
    const response = await call('GET', '/status', { token: null })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ready: true, dataApiEnabled: false })
  })

  it('answers 503 when storage cannot be reached, and keeps the cause to the server log', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    // A data directory below a file cannot be created.
    const file = path.join(await tempDataDir(), 'not-a-directory')
    await writeFile(file, '')
    await startServer({ dataDir: path.join(file, 'data') })

    const response = await call('GET', '/status', { token: null })
    const body = await problem(response, 503, 'not-ready')
    expect(body).toMatchObject({ ready: false, version: '0.1.0', dataApiEnabled: true })
    expect(JSON.stringify(body)).not.toContain('not-a-directory')
    expect(logged).toHaveBeenCalled()
  })
})

describe('GET /openapi.json and GET /metrics-catalog', () => {
  it('serves the OpenAPI document without a token', async () => {
    const response = await call('GET', '/openapi.json', { token: null })
    expect(response.status).toBe(200)
    const document = await response.json()
    expect(document.openapi).toBe('3.1.0')
    expect(Object.keys(document.paths)).toContain('/crew/{crewId}/readings')
  })

  it('serves the indicator catalogue without a token: limits, bands and hazard of every indicator', async () => {
    const response = await call('GET', '/metrics-catalog', { token: null })
    expect(response.status).toBe(200)
    const catalog = await response.json()
    expect(catalog.metrics).toHaveLength(12)
    expect(catalog.sources).toEqual(['simulated', 'device', 'manual'])
    expect(catalog.statuses).toEqual(['nominal', 'watch', 'act', 'critical'])
    expect(catalog.missionDays).toEqual({ first: 1, last: 180 })

    const heart = catalog.metrics.find((metric: { id: string }) => metric.id === 'restingHr')
    expect(heart).toMatchObject({
      label: 'Resting heart rate',
      unit: 'bpm',
      decimals: 0,
      input: { min: 25, max: 230, step: 1 },
      hazard: { id: 'gravity', label: 'Gravity fields' },
    })
    expect(heart.bands[0]).toMatchObject({ from: null, below: 40, status: 'act', label: 'Marked bradycardia' })
    expect(heart.bands[2]).toEqual({ from: 50, below: 101, status: 'nominal', label: 'Normal', action: null })
    expect(heart.bands.at(-1)).toMatchObject({ from: 141, below: null, status: 'critical' })
    // The step the entry forms use: whole numbers for an indicator without decimals, whatever its own step says.
    expect(catalog.metrics.find((metric: { id: string }) => metric.id === 'exerciseMin').input.step).toBe(1)
    expect(catalog.metrics.find((metric: { id: string }) => metric.id === 'bodyTemp').input.step).toBe(0.1)
  })

  it('still answers both when no token is configured', async () => {
    await startServer({ token: null })
    expect((await call('GET', '/openapi.json', { token: null })).status).toBe(200)
    expect((await call('GET', '/metrics-catalog', { token: null })).status).toBe(200)
  })
})

const CREW_REQUESTS: [string, string, CallOptions?][] = [
  ['GET', '/crew'],
  ['GET', READINGS],
  ['POST', READINGS, { json: { readings: [hr(130)] } }],
  ['GET', '/crew/morgan/evaluation?day=51'],
  ['GET', '/crew/morgan/audit'],
]

describe('access to crew data', () => {
  it.each(CREW_REQUESTS)('without a configured token, %s %s answers 503 whatever the client sends', async (method, target, options) => {
    await startServer({ token: null })
    for (const token of [null, TEST_TOKEN, '']) {
      const body = await problem(await call(method, target, { ...options, token }), 503, 'data-api-not-configured')
      expect(body.detail).toContain('not configured')
    }
    expect(await stored()).toEqual([])
  })

  it.each(CREW_REQUESTS)('%s %s needs the token: 401 with a challenge when it is missing or wrong', async (method, target, options) => {
    const missing = await call(method, target, { ...options, token: null })
    await problem(missing, 401, 'unauthorized')
    expect(missing.headers.get('www-authenticate')).toBe('Bearer realm="demify"')

    const wrong = await call(method, target, { ...options, token: `${TEST_TOKEN}x` })
    await problem(wrong, 401, 'unauthorized')
    expect(wrong.headers.get('www-authenticate')).toBe('Bearer realm="demify", error="invalid_token"')

    expect((await call(method, target, options)).status).toBe(200)
  })

  it('takes the token only as a bearer token', async () => {
    const basic = await call('GET', '/crew', { token: null, headers: { Authorization: `Basic ${TEST_TOKEN}` } })
    expect(basic.status).toBe(401)
    const bare = await call('GET', '/crew', { token: null, headers: { Authorization: TEST_TOKEN } })
    expect(bare.status).toBe(401)
    const inQuery = await call('GET', `/crew?token=${TEST_TOKEN}`, { token: null })
    expect(inQuery.status).toBe(401)
    // The name of the scheme is case-insensitive.
    const lowerCase = await call('GET', '/crew', { token: null, headers: { Authorization: `bearer ${TEST_TOKEN}` } })
    expect(lowerCase.status).toBe(200)
  })

  it('never repeats a token, in a response or in the log', async () => {
    const logs = ['error', 'warn', 'info', 'log'].map((level) => vi.spyOn(console, level as 'error').mockImplementation(() => undefined))
    const guess = 'a-wrong-token-that-must-not-leak'
    const response = await call('POST', READINGS, { token: guess, json: { readings: [hr(130)] } })
    const text = `${await response.text()} ${JSON.stringify([...response.headers])}`
    expect(text).not.toContain(guess)
    expect(text).not.toContain(TEST_TOKEN)
    for (const log of logs) expect(JSON.stringify(log.mock.calls)).not.toMatch(new RegExp(`${guess}|${TEST_TOKEN}`))
  })

  it('does not tell a client without the token which crew members exist', async () => {
    expect((await call('GET', '/crew/nobody/readings', { token: null })).status).toBe(401)
    expect((await call('GET', '/crew/morgan/readings', { token: null })).status).toBe(401)
  })
})

describe('GET /crew', () => {
  it('lists the crew members and says who has the simulated sensor log', async () => {
    const response = await call('GET', '/crew')
    expect(await response.json()).toEqual({
      crew: [{ id: 'morgan', name: 'A. Morgan', role: 'Flight Engineer', simulatedSensorLog: true }],
    })
  })
})

describe.each(['sqlite', 'json'] as const)('POST /crew/{crewId}/readings on the %s driver', (store) => {
  beforeEach(() => startServer({ store }))

  it('stores a batch as device readings and answers with what was stored', async () => {
    const response = await post([hr(130), { day: 51, metric: 'bodyTemp', value: 37.4 }, { day: 52, metric: 'spo2', value: 97 }])
    expect(response.status).toBe(200)
    const saved = [
      { day: 51, metric: 'bodyTemp', value: 37.4, source: 'device' },
      { day: 51, metric: 'restingHr', value: 130, source: 'device' },
      { day: 52, metric: 'spo2', value: 97, source: 'device' },
    ]
    expect(await response.json()).toEqual({ crewId: 'morgan', actor: `api:${TEST_CLIENT}`, saved: 3, readings: saved })
    expect(await stored()).toEqual(saved)
  })

  it('records every stored reading in the audit trail under the name of the client', async () => {
    await post([hr(128)], { client: 'hr-monitor-01' })
    await post([hr(130), { day: 51, metric: 'spo2', value: 97 }], { client: 'ground.console_2' })
    const entries = (await trail()).map(({ id: _id, at: _at, ...entry }) => entry)
    expect(entries).toHaveLength(3)
    expect(entries).toEqual(
      expect.arrayContaining([
        { actor: 'api:hr-monitor-01', crewId: 'morgan', action: 'create', day: 51, metric: 'restingHr', before: null, after: 128 },
        { actor: 'api:ground.console_2', crewId: 'morgan', action: 'replace', day: 51, metric: 'restingHr', before: 128, after: 130 },
        { actor: 'api:ground.console_2', crewId: 'morgan', action: 'create', day: 51, metric: 'spo2', before: null, after: 97 },
      ]),
    )
  })

  it('can take the same batch twice: the second replaces the first with the same values', async () => {
    const batch = [hr(130), { day: 51, metric: 'spo2', value: 97 }]
    const first = await (await post(batch)).json()
    const second = await (await post(batch)).json()
    expect(second).toEqual(first)
    expect(await stored()).toHaveLength(2)
    const entries = await trail()
    expect(entries.map((entry) => entry.action).sort()).toEqual(['create', 'create', 'replace', 'replace'])
    expect(entries.filter((entry) => entry.action === 'replace').every((entry) => entry.before === entry.after)).toBe(true)
  })

  it('keeps the last entry when one batch names a day and indicator twice', async () => {
    const response = await post([hr(120), hr(125, 52), hr(130)])
    expect(await response.json()).toMatchObject({
      saved: 2,
      readings: [
        { day: 51, metric: 'restingHr', value: 130, source: 'device' },
        { day: 52, metric: 'restingHr', value: 125, source: 'device' },
      ],
    })
  })

  it('saves none of a batch when one reading in it is not valid, and says which', async () => {
    const response = await post([hr(130), { day: 51, metric: 'spo2', value: 101 }, { day: 52, metric: 'bodyTemp', value: 36.9 }])
    const body = await problem(response, 400, 'invalid-request')
    expect(body.errors).toEqual([{ in: 'body', field: 'readings[1].value', detail: 'Blood oxygen: enter a value between 50 and 100 %.' }])
    expect(await stored()).toEqual([])
    expect(await trail()).toEqual([])
  })

  it('leaves a reading the crew member entered by hand in place, and the evaluation keeps using it', async () => {
    await (await repository()).saveManualReadings('morgan', [{ day: 51, metric: 'restingHr', value: 62, source: 'manual' }], 'crew:morgan')
    expect((await post([hr(130)])).status).toBe(200)

    expect(await stored()).toEqual([
      { day: 51, metric: 'restingHr', value: 130, source: 'device' },
      { day: 51, metric: 'restingHr', value: 62, source: 'manual' },
    ])
    const evaluation = await (await call('GET', '/crew/morgan/evaluation?day=51')).json()
    expect(evaluation.assessments[0]).toMatchObject({ metric: 'restingHr', value: 62, source: 'manual' })
  })
})

describe('POST /crew/{crewId}/readings: what it refuses', () => {
  const faults: [string, unknown, string, string][] = [
    ['an unknown indicator', [{ day: 51, metric: 'weight', value: 70 }], 'readings[0].metric', 'Unknown indicator'],
    ['an inherited property as indicator', [{ day: 51, metric: 'toString', value: 70 }], 'readings[0].metric', 'Unknown indicator'],
    ['a value below the input limits', [hr(24)], 'readings[0].value', 'between 25 and 230 bpm'],
    ['a value above the input limits', [hr(231)], 'readings[0].value', 'between 25 and 230 bpm'],
    ['a fraction for a whole-number indicator', [hr(64.5)], 'readings[0].value', 'whole number'],
    ['a value between two steps', [{ day: 51, metric: 'bodyTemp', value: 36.94 }], 'readings[0].value', 'steps of 0.1'],
    ['a value that is not a number', [{ day: 51, metric: 'restingHr', value: '130' }], 'readings[0].value', 'enter a number'],
    ['a missing value', [{ day: 51, metric: 'restingHr' }], 'readings[0].value', 'enter a number'],
    ['mission day 0', [hr(64, 0)], 'readings[0].day', '1 to 180'],
    ['mission day 181', [hr(64, 181)], 'readings[0].day', '1 to 180'],
    ['half a mission day', [hr(64, 51.5)], 'readings[0].day', '1 to 180'],
    ['a field it does not know', [{ ...hr(64), note: 'x' }], 'readings[0].note', 'Unknown field'],
    ['a source set by the client', [{ ...hr(64), source: 'manual' }], 'readings[0].source', 'cannot be set'],
    ['a reading that is not an object', [130], 'readings[0]', 'is an object'],
    ['an empty batch', [], 'readings', '1 to 500'],
    ['a batch of 501', Array.from({ length: 501 }, () => hr(64)), 'readings', '1 to 500'],
    ['readings that are not a list', { day: 51 }, 'readings', 'must be a list'],
    [
      'systolic pressure not above diastolic on one day',
      [
        { day: 51, metric: 'systolic', value: 80 },
        { day: 51, metric: 'diastolic', value: 80 },
      ],
      'readings[0].value',
      'Systolic pressure must be higher',
    ],
  ]

  it.each(faults)('refuses %s', async (_name, readings, field, detail) => {
    const body = await problem(await post(readings), 400, 'invalid-request')
    expect(body.errors).toEqual([{ in: 'body', field, detail: expect.stringContaining(detail) }])
    expect(body.detail).toContain(detail)
    expect(await stored()).toEqual([])
  })

  it('accepts a batch of 500, and values that only look off the step in binary', async () => {
    const batch = Array.from({ length: 500 }, (_, index) => ({ day: (index % 180) + 1, metric: 'bodyTemp', value: 36.6 + 0.1 * (index % 3) }))
    const response = await post(batch)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.saved).toBe(180)
    expect(new Set(body.readings.map((reading: { value: number }) => reading.value))).toEqual(new Set([36.6, 36.7, 36.8]))
  })

  it('compares systolic and diastolic per mission day only', async () => {
    const response = await post([
      { day: 51, metric: 'systolic', value: 118 },
      { day: 52, metric: 'diastolic', value: 120 },
    ])
    expect(response.status).toBe(200)
  })

  it('lists every fault of a batch, not only the first', async () => {
    const body = await problem(await post([hr(24), { day: 0, metric: 'weight', value: 'x' }, hr(130)]), 400, 'invalid-request')
    expect(body.errors?.map((error) => error.field)).toEqual(['readings[0].value', 'readings[1].day', 'readings[1].metric'])
    expect(body.detail).toContain('3 faults')
  })

  it('refuses a body that is not the documented object', async () => {
    for (const json of [[hr(130)], 'readings', 5, null]) {
      const body = await problem(await call('POST', READINGS, { json }), 400, 'invalid-request')
      expect(body.errors).toEqual([{ in: 'body', field: '', detail: expect.stringContaining('JSON object') }])
    }
    const extra = await problem(await call('POST', READINGS, { json: { readings: [hr(130)], crewId: 'chen' } }), 400, 'invalid-request')
    expect(extra.errors).toEqual([{ in: 'body', field: 'crewId', detail: expect.stringContaining('Unknown field') }])
    expect(await stored()).toEqual([])
  })

  it('refuses a body that is not valid JSON', async () => {
    for (const body of ['{"readings": [', '', 'day=51&metric=restingHr', new Uint8Array([0x7b, 0xff, 0x7d])]) {
      const response = await call('POST', READINGS, { body, headers: { 'Content-Type': 'application/json' } })
      const answer = await problem(response, 400, 'invalid-request')
      expect(answer.detail).toBe('The body is not valid JSON.')
    }
  })

  it('refuses a body that is not sent as JSON with 415', async () => {
    const text = JSON.stringify({ readings: [hr(130)] })
    for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Type': 'application/x-www-form-urlencoded' }, { 'Content-Type': 'application/jsonp' }]) {
      await problem(await call('POST', READINGS, { body: text, headers }), 415, 'unsupported-media-type')
    }
    const withCharset = await call('POST', READINGS, { body: text, headers: { 'Content-Type': 'application/json; charset=utf-8' } })
    expect(withCharset.status).toBe(200)
  })

  it('refuses a body above 64 KiB with 413, whether or not its length is declared', async () => {
    const large = JSON.stringify({ readings: [hr(130)], padding: 'x'.repeat(64 * 1024) })
    const declared = await call('POST', READINGS, { body: large, headers: { 'Content-Type': 'application/json', 'Content-Length': String(large.length) } })
    await problem(declared, 413, 'payload-too-large')

    // Sent in pieces without a declared length: the limit is counted while reading.
    const pieces = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let sent = 0; sent < large.length; sent += 16 * 1024) controller.enqueue(new TextEncoder().encode(large.slice(sent, sent + 16 * 1024)))
        controller.close()
      },
    })
    const streamed = await call('POST', READINGS, { body: pieces, headers: { 'Content-Type': 'application/json' } })
    await problem(streamed, 413, 'payload-too-large')
    expect(await stored()).toEqual([])
  })

  it('needs the name of the client, in a form fit for the audit trail', async () => {
    const missing = await problem(await post([hr(130)], { client: null }), 400, 'invalid-request')
    expect(missing.errors).toEqual([{ in: 'header', field: 'X-Demify-Client', detail: expect.stringContaining('is required') }])

    for (const client of ['has space', '-leading-hyphen', 'x'.repeat(49), 'semi;colon', 'api:name']) {
      const invalid = await problem(await post([hr(130)], { client }), 400, 'invalid-request')
      expect(invalid.errors?.[0]).toMatchObject({ in: 'header', field: 'X-Demify-Client' })
    }
    expect(await stored()).toEqual([])

    expect((await post([hr(130)], { client: 'x'.repeat(48) })).status).toBe(200)
    expect((await trail())[0].actor).toBe(`api:${'x'.repeat(48)}`)
  })

  it('answers 404 for someone who is not on the crew', async () => {
    const unknown = await problem(await call('POST', '/crew/chen/readings', { json: { readings: [hr(130)] } }), 404, 'not-found')
    expect(unknown.detail).toContain('"chen"')
    // An id that could not be one is not repeated in the answer.
    const odd = await problem(await call('POST', '/crew/..%2Fmorgan/readings', { json: { readings: [hr(130)] } }), 404, 'not-found')
    expect(odd.detail).not.toContain('morgan')
  })
})

describe('the rate limit on writes', () => {
  it('answers 429 with Retry-After once a client has sent 60 write requests in a minute', async () => {
    // Requests that are refused count too: a device stuck on a bad batch is what the limit is for.
    for (let sent = 0; sent < 59; sent++) expect((await post([hr(24)])).status).toBe(400)
    expect((await post([hr(130)])).status).toBe(200)

    const limited = await post([hr(131)])
    const body = await problem(limited, 429, 'rate-limited')
    const wait = Number(limited.headers.get('retry-after'))
    expect(wait).toBeGreaterThanOrEqual(1)
    expect(wait).toBeLessThanOrEqual(60)
    expect(body.detail).toContain(`${wait} seconds`)
    expect(await stored()).toEqual([{ day: 51, metric: 'restingHr', value: 130, source: 'device' }])

    // The count is per client name, and reading is not limited.
    expect((await post([hr(131)], { client: 'another-device' })).status).toBe(200)
    expect((await call('GET', READINGS)).status).toBe(200)
  })

  it('does not count requests that were turned away for a missing or wrong token', async () => {
    for (let sent = 0; sent < 70; sent++) expect((await post([hr(130)], { token: 'wrong-token-wrong-token' })).status).toBe(401)
    expect((await post([hr(130)])).status).toBe(200)
  })
})

describe('GET /crew/{crewId}/readings', () => {
  beforeEach(async () => {
    await post([hr(130), hr(131, 60), { day: 51, metric: 'spo2', value: 97 }])
    await (await repository()).saveManualReadings('morgan', [{ day: 51, metric: 'restingHr', value: 62, source: 'manual' }], 'crew:morgan')
  })

  it('returns everything the monitor holds, each reading with its source', async () => {
    const body = await (await call('GET', READINGS)).json()
    expect(body.crewId).toBe('morgan')
    expect(body.count).toBe(simulateMission().length + 4)
    expect(body.readings).toHaveLength(body.count)
    expect(new Set(body.readings.map((reading: { source: string }) => reading.source))).toEqual(new Set(['simulated', 'device', 'manual']))
    expect(body.readings.every((reading: object) => Object.keys(reading).join() === 'day,metric,value,source')).toBe(true)
  })

  it('lists one day by indicator, and the sources of one indicator in rising precedence', async () => {
    const body = await (await call('GET', `${READINGS}?from=51&to=51`)).json()
    expect(body.count).toBe(15)
    expect(body.readings.filter((reading: { metric: string }) => reading.metric === 'restingHr')).toEqual([
      { day: 51, metric: 'restingHr', value: 64, source: 'simulated' },
      { day: 51, metric: 'restingHr', value: 130, source: 'device' },
      { day: 51, metric: 'restingHr', value: 62, source: 'manual' },
    ])
    const metrics = body.readings.map((reading: { metric: string }) => reading.metric)
    expect(metrics).toEqual([...metrics].sort())
  })

  it('filters by source and by mission days', async () => {
    const device = await (await call('GET', `${READINGS}?source=device`)).json()
    expect(device.readings).toEqual([
      { day: 51, metric: 'restingHr', value: 130, source: 'device' },
      { day: 51, metric: 'spo2', value: 97, source: 'device' },
      { day: 60, metric: 'restingHr', value: 131, source: 'device' },
    ])
    expect((await (await call('GET', `${READINGS}?source=manual`)).json()).count).toBe(1)
    expect((await (await call('GET', `${READINGS}?source=device&from=52`)).json()).readings).toEqual([{ day: 60, metric: 'restingHr', value: 131, source: 'device' }])
    expect((await (await call('GET', `${READINGS}?source=device&to=50`)).json()).readings).toEqual([])

    const baseline = await (await call('GET', `${READINGS}?to=0`)).json()
    expect(baseline.count).toBeGreaterThan(0)
    expect(baseline.readings.every((reading: { day: number; source: string }) => reading.day <= 0 && reading.source === 'simulated')).toBe(true)
  })

  it.each([
    ['from=abc', 'from'],
    ['from=1.5', 'from'],
    ['from=-14', 'from'],
    ['to=181', 'to'],
    ['source=sensor', 'source'],
    ['from=60&to=51', 'from'],
    ['from=1&from=2', 'from'],
    ['day=51', 'day'],
    ['sorce=device', 'sorce'],
  ])('refuses ?%s', async (query, field) => {
    const body = await problem(await call('GET', `${READINGS}?${query}`), 400, 'invalid-request')
    expect(body.errors).toEqual([{ in: 'query', field, detail: expect.any(String) }])
  })

  it('answers 404 for someone who is not on the crew', async () => {
    await problem(await call('GET', '/crew/chen/readings'), 404, 'not-found')
  })
})

describe('GET /crew/{crewId}/evaluation', () => {
  it('returns the result of the rule engine for the day: status, findings, reminders and one assessment per indicator', async () => {
    const body = await (await call('GET', '/crew/morgan/evaluation?day=51')).json()
    expect(body).toMatchObject({ crewId: 'morgan', day: 51, status: 'nominal', findings: [], reminders: [] })
    expect(body.assessments).toHaveLength(12)
    expect(body.assessments[0]).toMatchObject({
      metric: 'restingHr',
      status: 'nominal',
      value: 64,
      source: 'simulated',
      latestDay: 51,
      stale: false,
      band: { status: 'nominal', label: 'Normal', action: null },
    })
  })

  it('changes as soon as a device sends a reading, and names the device as its source', async () => {
    await post([hr(130)])
    const body = await (await call('GET', '/crew/morgan/evaluation?day=51')).json()
    expect(body.status).toBe('act')
    expect(body.findings).toEqual([
      {
        id: 'range:restingHr',
        kind: 'range',
        status: 'act',
        title: 'Resting heart rate: tachycardia at rest',
        detail: expect.stringContaining('130 bpm'),
        action: expect.stringContaining('Crew Medical Officer'),
        metrics: ['restingHr'],
      },
    ])
    expect(body.assessments[0]).toMatchObject({ metric: 'restingHr', status: 'act', value: 130, source: 'device', band: { status: 'act' } })
    expect(body.assessments.slice(1).every((assessment: { source: string }) => assessment.source === 'simulated')).toBe(true)

    // The day before knows nothing of it.
    expect((await (await call('GET', '/crew/morgan/evaluation?day=50')).json()).status).toBe('nominal')
  })

  it('lists the indicators that need a new measurement', async () => {
    // Blood pressure was not measured on days 86 to 90 of the simulated mission.
    const body = await (await call('GET', '/crew/morgan/evaluation?day=90')).json()
    expect(body.reminders).toEqual(
      expect.arrayContaining([
        { metric: 'systolic', daysSinceReading: 5 },
        { metric: 'diastolic', daysSinceReading: 5 },
      ]),
    )
    expect(body.assessments[1]).toMatchObject({ metric: 'systolic', stale: true, band: null, source: 'simulated', latestDay: 85 })
  })

  it.each(['', '?day=', '?day=0', '?day=181', '?day=abc', '?day=51&day=52', '?day=5.0'])('refuses "%s": the day is required and must be a mission day', async (query) => {
    const body = await problem(await call('GET', `/crew/morgan/evaluation${query}`), 400, 'invalid-request')
    expect(body.errors).toEqual([{ in: 'query', field: 'day', detail: expect.any(String) }])
  })

  it('answers 404 for someone who is not on the crew', async () => {
    await problem(await call('GET', '/crew/chen/evaluation?day=51'), 404, 'not-found')
  })
})

describe('GET /crew/{crewId}/audit', () => {
  beforeEach(async () => {
    for (const value of [121, 122, 123, 124, 125]) await post([hr(value)])
  })

  it('returns the trail newest first, with the actor and the values before and after', async () => {
    const body = await (await call('GET', '/crew/morgan/audit')).json()
    expect(body.crewId).toBe('morgan')
    expect(body.nextCursor).toBeNull()
    expect(body.entries.map((entry: { after: number }) => entry.after)).toEqual([125, 124, 123, 122, 121])
    expect(body.entries[0]).toEqual({
      id: expect.any(Number),
      at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      actor: `api:${TEST_CLIENT}`,
      crewId: 'morgan',
      action: 'replace',
      day: 51,
      metric: 'restingHr',
      before: 124,
      after: 125,
    })
    expect(body.entries.at(-1)).toMatchObject({ action: 'create', before: null, after: 121 })
  })

  it('pages backwards with limit and cursor until the trail ends', async () => {
    const seen: number[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const body: { entries: { after: number }[]; nextCursor: string | null } = await (
        await call('GET', `/crew/morgan/audit?limit=2${cursor ? `&cursor=${cursor}` : ''}`)
      ).json()
      expect(body.entries.length).toBeLessThanOrEqual(2)
      seen.push(...body.entries.map((entry) => entry.after))
      cursor = body.nextCursor
      pages++
    } while (cursor !== null)
    expect(seen).toEqual([125, 124, 123, 122, 121])
    expect(pages).toBe(3)

    // A page that ends exactly at the oldest entry has no next one.
    expect((await (await call('GET', '/crew/morgan/audit?limit=5')).json()).nextCursor).toBeNull()
  })

  it.each([
    ['limit=0', 'limit'],
    ['limit=201', 'limit'],
    ['limit=ten', 'limit'],
    ['cursor=abc', 'cursor'],
    ['cursor=-1', 'cursor'],
    ['cursor=0', 'cursor'],
    ['before=3', 'before'],
  ])('refuses ?%s', async (query, field) => {
    const body = await problem(await call('GET', `/crew/morgan/audit?${query}`), 400, 'invalid-request')
    expect(body.errors).toEqual([{ in: 'query', field, detail: expect.any(String) }])
  })

  it('answers 404 for someone who is not on the crew', async () => {
    await problem(await call('GET', '/crew/chen/audit'), 404, 'not-found')
  })
})

describe('methods and addresses the API does not have', () => {
  it('answers 405 with the methods an address takes', async () => {
    const readOnly = await call('DELETE', '/crew')
    const body = await problem(readOnly, 405, 'method-not-allowed')
    expect(readOnly.headers.get('allow')).toBe('GET, HEAD, OPTIONS')
    expect(body.detail).toContain('DELETE')

    for (const method of ['PUT', 'PATCH', 'DELETE']) {
      const response = await call(method, READINGS, { json: { readings: [hr(130)] } })
      await problem(response, 405, 'method-not-allowed')
      expect(response.headers.get('allow')).toBe('GET, POST, HEAD, OPTIONS')
    }
    await problem(await call('POST', '/status'), 405, 'method-not-allowed')
    await problem(await call('POST', '/crew/morgan/evaluation?day=51'), 405, 'method-not-allowed')
    expect(await stored()).toEqual([])
  })

  it('answers OPTIONS with the methods and no cross-origin permission', async () => {
    const response = await call('OPTIONS', READINGS, { headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'POST' } })
    expect(response.status).toBe(204)
    expect(response.headers.get('allow')).toBe('GET, POST, HEAD, OPTIONS')
    expect([...response.headers.keys()].filter((name) => name.startsWith('access-control'))).toEqual([])

    const get = await call('GET', '/status', { headers: { Origin: 'https://example.org' } })
    expect([...get.headers.keys()].filter((name) => name.startsWith('access-control'))).toEqual([])
  })

  it('answers 404 in the same format for an address under /api/v1 that is no endpoint', async () => {
    for (const [method, target] of [
      ['GET', '/'],
      ['GET', '/nope'],
      ['GET', '/crew/morgan'],
      ['POST', '/crew/morgan/readings/1'],
      ['DELETE', '/crew/morgan/evaluation/now'],
    ]) {
      const body = await problem(await call(method, target, { token: null }), 404, 'not-found')
      expect(body.detail).toContain('/api/v1/openapi.json')
    }
  })
})

describe('when storage fails', () => {
  it.each(CREW_REQUESTS.filter(([, target]) => target !== '/crew'))('%s %s answers 500 without the cause', async (method, target, options) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const file = path.join(await tempDataDir(), 'not-a-directory')
    await writeFile(file, '')
    await startServer({ dataDir: path.join(file, 'data') })

    const response = await call(method, target, options)
    const body = await problem(response, 500, 'internal-error')
    expect(JSON.stringify(body)).not.toMatch(/not-a-directory|ENOTDIR|sqlite/i)
    expect(logged).toHaveBeenCalled()
  })
})
