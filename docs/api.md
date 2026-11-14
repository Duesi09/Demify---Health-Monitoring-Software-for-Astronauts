# HTTP API

How devices and ground systems connect to Demify: send readings of a crew
member, and read back what the monitor concludes. The API is versioned and
lives under `/api/v1`.

- The machine-readable description (OpenAPI 3.1): `GET /api/v1/openapi.json`
- The same as a page in the running app: `/api/docs`
- This guide: copy-paste `curl` examples, the access rules, the limits, the
  error format, and a walk-through for a first device.

The mission data that ships with Demify is **simulated**. Every reading the
API returns carries a `source`, so a simulated value is never taken for a
measured one:

| `source` | What it is |
| --- | --- |
| `simulated` | The built-in mission log of the default crew member. Not a measurement. |
| `device` | Sent through this API by a device or a ground system. |
| `manual` | Entered by the crew member in the app. |

For one day and indicator the monitor uses a `manual` reading before a
`device` reading, and a `device` reading before a `simulated` one. The
reference ranges are demo defaults: not flight rules and not medical advice.

## Set up

The examples use two shell variables. Set them once:

```bash
export DEMIFY_URL=http://localhost:3000
export DEMIFY_API_TOKEN=replace-with-your-own-long-random-token
```

On the server, the same token is the setting `DEMIFY_API_TOKEN`: 16 to 512
printable characters without spaces. Make it long and random, for example with
`openssl rand -hex 32`. Start the server with it:

```bash
DEMIFY_API_TOKEN=$DEMIFY_API_TOKEN npm start
```

In the container, pass it as an environment variable, for example with an
`environment:` entry for the `demify` service in `compose.yaml`. The other
settings are in [data.md](data.md).

## Access

- `GET /status`, `GET /openapi.json` and `GET /metrics-catalog` are open. They
  carry no crew data and no secrets.
- Every address under `/crew` carries health data and needs the token:
  `Authorization: Bearer <token>`. A missing or wrong token answers `401` with a
  `WWW-Authenticate` header. The token is compared in constant time and is
  never logged or repeated in a response.
- **Without `DEMIFY_API_TOKEN` on the server, the data API is off.** Every
  address under `/crew` answers `503` with the problem
  `data-api-not-configured`, whatever the client sends. Health data is never
  served without a configured token. `GET /status` tells which it is:
  `"dataApiEnabled": true` or `false`.
- A request that writes names its sender in the `X-Demify-Client` header: 1 to
  48 characters, letters, digits, dot, hyphen and underscore, starting with a
  letter or digit (`hr-monitor-01`, `ground.console`). The name becomes the
  actor `api:<name>` in the audit trail. It is a label for the record, not an
  identity: everyone who holds the token can use any name.
- The token is one shared secret for all clients. Put HTTPS in front of the
  server (a reverse proxy), so the token and the health data do not travel in
  the clear. There are no per-client tokens and no roles yet.
- **Cross-origin access (CORS) is not supported.** The API never sends an
  `Access-Control-Allow-Origin` header, so a web page on another origin cannot
  read it. A ground web console calls the API from its own server, or sits
  behind the same reverse proxy as Demify.
- Every response is `Cache-Control: no-store`.

## Limits

| Limit | Value |
| --- | --- |
| Request body | 64 KiB at most (`413` above) |
| Readings in one batch | 1 to 500 (`400` outside) |
| Write requests | 60 per 60 seconds for each `X-Demify-Client` name (`429` above, with `Retry-After` in seconds) |
| Audit entries in one page | 50 by default, 200 at most |
| Mission days | 1 to 180 for a stored reading |

The write limit is counted **in memory, per server process**: several
processes each keep their own count, and a restart starts it again. It keeps a
device stuck in a retry loop from flooding the audit trail. It is not a
defence against an attacker; a deployment that needs one puts a rate limit in
the reverse proxy. Requests refused for a missing or wrong token are not
counted, and reading is not limited.

## Errors

Every error has one shape: a problem document
([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)) sent as
`application/problem+json`.

```json
{
  "type": "/api/docs#problem-invalid-request",
  "title": "Invalid request",
  "status": 400,
  "detail": "Blood oxygen: enter a value between 50 and 100 %.",
  "errors": [
    { "in": "body", "field": "readings[1].value", "detail": "Blood oxygen: enter a value between 50 and 100 %." }
  ]
}
```

`type` names the kind of problem and is the address of its entry on the
`/api/docs` page. `detail` says what went wrong in this request. `errors` is
only on a `400` and lists every fault found, not only the first: `in` is
`body`, `query`, `header` or `path`, and `field` is the parameter or header
name, or the place in the JSON body.

| Status | `type` ends in | When |
| --- | --- | --- |
| 400 | `invalid-request` | Bad input of any kind: a parameter, a header or the body is missing or not valid, the JSON cannot be parsed, a reading breaks a rule, or the request carries a query parameter the endpoint does not document. Bad input is always `400`, never `422`. |
| 401 | `unauthorized` | The token is missing or wrong. |
| 404 | `not-found` | No crew member with this id, or no such address under `/api/v1`. |
| 405 | `method-not-allowed` | The address does not take this method. `Allow` lists the ones it takes. |
| 413 | `payload-too-large` | The body is larger than 64 KiB. |
| 415 | `unsupported-media-type` | The body was not sent with `Content-Type: application/json`. |
| 429 | `rate-limited` | Too many write requests from this client name. Wait for `Retry-After` seconds. |
| 500 | `internal-error` | The server failed, for example because storage could not be reached. The cause is in the server log, never in the response. |
| 503 | `data-api-not-configured` | No token is configured on the server (addresses under `/crew`). |
| 503 | `not-ready` | The readiness check failed (`GET /status` only). |

## Endpoints

| Method | Address | Token | What it does |
| --- | --- | --- | --- |
| GET | `/api/v1/status` | no | Readiness of the server |
| GET | `/api/v1/openapi.json` | no | This API as an OpenAPI 3.1 document |
| GET | `/api/v1/metrics-catalog` | no | The indicator catalogue |
| GET | `/api/v1/crew` | yes | The crew members |
| GET | `/api/v1/crew/{crewId}/readings` | yes | Readings of a crew member |
| POST | `/api/v1/crew/{crewId}/readings` | yes | Send a batch of readings |
| GET | `/api/v1/crew/{crewId}/evaluation` | yes | The result of the rule engine for a mission day |
| GET | `/api/v1/crew/{crewId}/audit` | yes | The audit trail of a crew member |

`HEAD` works wherever `GET` does. The examples pipe nothing through `jq`; add
`| jq` to read the answers more easily.

### GET /api/v1/status

Readiness: `200` when storage can be reached and can take a write, `503` when
not. Use it as the readiness probe of a container platform. Never cached.

```bash
curl -sS "$DEMIFY_URL/api/v1/status"
```

```json
{
  "ready": true,
  "version": "0.1.0",
  "apiVersion": "v1",
  "dataApiEnabled": true,
  "storage": { "driver": "sqlite", "schemaVersion": 2, "writable": true, "audit": "transactional" }
}
```

### GET /api/v1/openapi.json

The OpenAPI 3.1 description of this API, generated from the same definitions
the server routes requests with. Feed it to a client generator or an API tool.

```bash
curl -sS "$DEMIFY_URL/api/v1/openapi.json"
```

### GET /api/v1/metrics-catalog

Every indicator: its id, label, unit, the limits a reading must keep to be
accepted (`input.min`, `input.max`, `input.step`), the bands a value is judged
by with their status and label, and the NASA hazard behind it. A band runs
from `from` (inclusive) to `below` (exclusive); `null` means the band is open
at that end.

```bash
curl -sS "$DEMIFY_URL/api/v1/metrics-catalog"
```

```json
{
  "notice": "The ranges are demo defaults ...",
  "missionDays": { "first": 1, "last": 180 },
  "statuses": ["nominal", "watch", "act", "critical"],
  "sources": ["simulated", "device", "manual"],
  "metrics": [
    {
      "id": "restingHr",
      "label": "Resting heart rate",
      "unit": "bpm",
      "decimals": 0,
      "input": { "min": 25, "max": 230, "step": 1 },
      "evaluatedOn": "latest",
      "staleAfterDays": 3,
      "bands": [
        { "from": null, "below": 40, "status": "act", "label": "Marked bradycardia", "action": "Re-measure after 5 minutes of rest. ..." },
        { "from": 50, "below": 101, "status": "nominal", "label": "Normal", "action": null }
      ],
      "drift": { "direction": "up", "watch": 8, "act": 15, "action": "..." },
      "hazard": { "id": "gravity", "label": "Gravity fields", "url": "https://www.nasa.gov/hrp/hazard-gravity-fields/" },
      "reference": "Adult resting heart rate, 60 to 100 bpm ..."
    }
  ]
}
```

### GET /api/v1/crew

The crew members. Their `id` is the `{crewId}` of the other addresses.
`simulatedSensorLog` says who has the built-in simulated mission log.

```bash
curl -sS "$DEMIFY_URL/api/v1/crew" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

```json
{ "crew": [{ "id": "morgan", "name": "A. Morgan", "role": "Flight Engineer", "simulatedSensorLog": true }] }
```

### GET /api/v1/crew/{crewId}/readings

Everything the monitor holds for a crew member, and so everything an
evaluation rests on: the stored readings (`device`, `manual`) and, for a crew
member with a simulated sensor log, the simulated ones. One day can hold up to
one reading per source for an indicator. They are listed by mission day, then
indicator, then source in rising precedence.

| Query parameter | Value | Meaning |
| --- | --- | --- |
| `from` | whole number, -13 to 180 | First mission day to return. Days of 0 and below are the pre-flight baseline of the simulated log. |
| `to` | whole number, -13 to 180 | Last mission day to return. Not before `from`. |
| `source` | `simulated`, `device` or `manual` | Only readings from this source. |

Without parameters the whole mission is returned, a few thousand readings.

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/readings?from=51&to=51&source=device" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

```json
{
  "crewId": "morgan",
  "count": 1,
  "readings": [{ "day": 51, "metric": "restingHr", "value": 130, "source": "device" }]
}
```

### POST /api/v1/crew/{crewId}/readings

Send a batch of readings. The body is a JSON object with a `readings` list;
each reading has `day`, `metric` and `value` and nothing else. The readings
are checked with the rules of the app's own entry forms:

- `metric` is an indicator of the catalogue.
- `value` is a number within the indicator's `input.min` and `input.max` and a
  whole multiple of its `input.step`.
- `day` is a mission day, a whole number from 1 to 180.
- Systolic pressure is higher than diastolic pressure when both arrive for one
  day.

All of the batch is saved or none of it. Sending is idempotent: a reading
replaces the earlier `device` reading for the same day and indicator, so a
batch can be sent again after a lost answer (each time is recorded in the
audit trail). When one batch names a day and indicator twice, the last entry
counts. Readings are stored with the source `device`; the source cannot be
set. A `device` reading never overwrites one the crew member entered by hand.

```bash
curl -sS -X POST "$DEMIFY_URL/api/v1/crew/morgan/readings" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN" \
  -H "X-Demify-Client: hr-monitor-01" \
  -H "Content-Type: application/json" \
  -d '{"readings":[{"day":51,"metric":"restingHr","value":130},{"day":51,"metric":"spo2","value":97}]}'
```

```json
{
  "crewId": "morgan",
  "actor": "api:hr-monitor-01",
  "saved": 2,
  "readings": [
    { "day": 51, "metric": "restingHr", "value": 130, "source": "device" },
    { "day": 51, "metric": "spo2", "value": 97, "source": "device" }
  ]
}
```

### GET /api/v1/crew/{crewId}/evaluation

The result of the rule engine for one mission day (`day`, required, 1 to 180),
from the readings up to that day: the overall `status`, the `findings` with
their `action`, the `reminders` (indicators that need a new measurement), and
one entry in `assessments` per indicator. Each assessment names the `source`
of the reading it rests on. It is the same result the crew member sees, and it
is computed on every request, so it reflects a reading the moment it is
stored. This is the address a ground console polls.

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/evaluation?day=51" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

```json
{
  "crewId": "morgan",
  "day": 51,
  "status": "act",
  "findings": [
    {
      "id": "range:restingHr",
      "kind": "range",
      "status": "act",
      "title": "Resting heart rate: tachycardia at rest",
      "detail": "Latest reading is 130 bpm. It has been above your pre-flight baseline.",
      "action": "Stop exertion, rest and re-measure in 10 minutes. If it persists, see the Crew Medical Officer for an ECG.",
      "metrics": ["restingHr"]
    }
  ],
  "reminders": [],
  "assessments": [
    {
      "metric": "restingHr",
      "status": "act",
      "value": 130,
      "source": "device",
      "latestDay": 51,
      "daysSinceReading": 0,
      "stale": false,
      "band": { "status": "act", "label": "Tachycardia at rest", "action": "Stop exertion, rest and re-measure in 10 minutes. ..." },
      "baseline": 57.285714285714285,
      "recentMean": 71.28571428571429,
      "delta": 14.000000000000007,
      "driftStatus": "watch",
      "driftDays": 1,
      "recentPeak": 130
    }
  ]
}
```

### GET /api/v1/crew/{crewId}/audit

Every change to a stored reading of this crew member, newest first: who made
it, when (UTC), and the value before and after. Entries are only ever added.
The `actor` tells the channel: `api:<client>` wrote a `device` reading,
`crew:<id>` a `manual` one, `system:<name>` is the server itself.

| Query parameter | Value | Meaning |
| --- | --- | --- |
| `limit` | whole number, 1 to 200, default 50 | Most entries to return. |
| `cursor` | the `nextCursor` of the page before | Gets the next, older page. Treat it as opaque. |

`nextCursor` is `null` on the last page.

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/audit?limit=1" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

```json
{
  "crewId": "morgan",
  "entries": [
    {
      "id": 2,
      "at": "2031-03-01T08:00:05.000Z",
      "actor": "api:hr-monitor-01",
      "crewId": "morgan",
      "action": "replace",
      "day": 51,
      "metric": "restingHr",
      "before": 128,
      "after": 130
    }
  ],
  "nextCursor": "2"
}
```

## Connecting a device

A walk-through with a heart rate monitor: it sends one reading and reads back
what the monitor makes of it. It needs a running server with a token (see
"Set up") and the two shell variables.

**1. Check that the server is ready and the data API is on.**

```bash
curl -sS "$DEMIFY_URL/api/v1/status"
```

Look for `"ready": true` and `"dataApiEnabled": true`. With `false`, the
server has no `DEMIFY_API_TOKEN` and will answer every step below with `503`.

**2. Look up the indicator.** The catalogue gives the id, the unit and the
limits, so the device can check a value before it sends it.

```bash
curl -sS "$DEMIFY_URL/api/v1/metrics-catalog"
```

Resting heart rate is `restingHr`, in `bpm`, a whole number from 25 to 230.

**3. Look at the day before sending.** Mission day 51 of the simulated
mission is quiet:

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/evaluation?day=51" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

The answer starts with `"status": "nominal"` and has no findings. The heart
rate assessment shows `"value": 64, "source": "simulated"`.

**4. Send the reading.** The device measured 130 bpm on mission day 51. It
names itself in `X-Demify-Client`.

```bash
curl -sS -X POST "$DEMIFY_URL/api/v1/crew/morgan/readings" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN" \
  -H "X-Demify-Client: hr-monitor-01" \
  -H "Content-Type: application/json" \
  -d '{"readings":[{"day":51,"metric":"restingHr","value":130}]}'
```

```json
{
  "crewId": "morgan",
  "actor": "api:hr-monitor-01",
  "saved": 1,
  "readings": [{ "day": 51, "metric": "restingHr", "value": 130, "source": "device" }]
}
```

If the answer got lost on the way, send the same request again: the reading
replaces itself.

**5. Read the evaluation back.**

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/evaluation?day=51" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

The status is now `"act"`, with the finding
`"Resting heart rate: tachycardia at rest"` and what the crew member is told
to do. The heart rate assessment shows `"value": 130, "source": "device"`.
The app shows the same: open `/?day=51` or `/checkin?day=51`, where the
reading is marked "from device". A page that was already open shows it after
a reload.

**6. See the record.** The audit trail names the device:

```bash
curl -sS "$DEMIFY_URL/api/v1/crew/morgan/audit?limit=1" \
  -H "Authorization: Bearer $DEMIFY_API_TOKEN"
```

```json
{
  "crewId": "morgan",
  "entries": [
    {
      "id": 1,
      "at": "2031-03-01T08:00:00.000Z",
      "actor": "api:hr-monitor-01",
      "crewId": "morgan",
      "action": "create",
      "day": 51,
      "metric": "restingHr",
      "before": null,
      "after": 130
    }
  ],
  "nextCursor": null
}
```

What a device should do with the answers:

- `200`: stored. Nothing more to do.
- `400`: the batch is wrong and will stay wrong. Do not retry it; log `errors`.
- `401`, `503`: a configuration problem. Do not retry in a tight loop.
- `429`: wait for the seconds in `Retry-After`, then send again.
- `500`, or no answer at all: send the same batch again later. Sending twice
  is harmless.

## Where the code is

| Part | File |
| --- | --- |
| The list of operations, the source of the OpenAPI document | `src/server/api/definitions.ts` |
| Parameters, schemas, limits | `src/server/api/params.ts`, `schemas.ts`, `limits.ts` |
| The request pipeline (method, access, crew member, parameters, rate limit, body) | `src/server/api/router.ts` |
| What each operation does | `src/server/api/handlers.ts` |
| The route files, one line of path each | `src/app/api/v1/**/route.ts` |
| The page at `/api/docs` | `src/app/api/docs/page.tsx` |

To add an endpoint: add an entry to `OPERATIONS`, a handler to `HANDLERS`, and
a route file that names the path. `src/server/api/openapi.test.ts` fails until
the three agree, and until the server sends every status the document
declares.
