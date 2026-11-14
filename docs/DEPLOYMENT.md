# Deploying Demify

Demify ships as one Docker image that runs anywhere a container runtime
exists: a ground lab, a server on a station network, or an air-gapped
flight computer. You adapt it to each environment with **environment
variables**, so the image stays the same.

| File | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage build (deps → builder → runner) on `node:24-alpine`, using the Next.js `standalone` output |
| `docker/entrypoint.sh` | Seeds offline snapshots into the data volume, then `exec`s the server |
| `docker-compose.yml` | `demify` service plus an air-gapped `offline` profile |
| `.env.example` | Every setting, documented. Copy it to `.env` |
| `.dockerignore` | Keeps `node_modules`, `.next`, `.git`, secrets and local crew data out of the build context |

---

## 1. Quick start

```bash
# Docker Compose (recommended)
cp .env.example .env              # optional
docker compose up -d --build
docker compose ps                 # wait until STATUS shows "(healthy)"
open http://localhost:3000        # or the port set by DEMIFY_PORT

# Plain Docker (127.0.0.1: this machine only, like the Compose default)
docker build -t demify:dev .
docker run -d --name demify -p 127.0.0.1:3000:3000 -v demify-data:/data demify:dev
curl http://localhost:3000/api/health
# {"status":"ok","mission":"iss","offline":false,"time":"..."}
```

Compose publishes the port on `127.0.0.1` unless `DEMIFY_BIND` says otherwise,
so a fresh install is reachable from the host only. To serve a LAN, set
`DEMIFY_BIND=0.0.0.0` and an admin token (see section 3,
`DEMIFY_ADMIN_TOKEN`).

Stop the app with `docker compose down`. Your data stays in the named volume.
`docker compose down -v` also deletes the volume and all crew readings.

### Build arguments

| Arg | Default | Use |
| --- | --- | --- |
| `NODE_IMAGE` | `node:24-alpine` | Base image. Pin a digest or use an internal mirror |
| `NPM_CONFIG_REGISTRY` | `https://registry.npmjs.org/` | Private npm mirror |
| `VERSION`, `VCS_REF`, `BUILD_DATE` | `0.1.0`, `unknown`, `unknown` | OCI labels (`org.opencontainers.image.*`) |

```bash
docker build -t demify:$(git rev-parse --short HEAD) \
  --build-arg VCS_REF=$(git rev-parse --short HEAD) \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) .
```

The build needs **only the npm registry**. It installs no Alpine packages,
because the lockfile pins the musl builds of SWC, lightningcss and Tailwind
oxide. It loads no Google Fonts or other external assets, and neither does the
running app. The only outbound traffic at runtime is the data APIs below.

---

## 2. What is in the image

```
/app                      read-only for the app user (owned by root)
├── server.js             Next.js standalone server (node server.js)
├── node_modules/         only the traced runtime dependencies
├── .next/static/         hashed JS/CSS, served by server.js
├── public/
└── data/snapshots-seed/  offline API snapshots baked in from data/snapshots
/data                     VOLUME, owned by uid 1001 (DEMIFY_DATA_DIR)
├── demify-db.json        crew readings (JSON store)
└── snapshots/            DEMIFY_SNAPSHOT_DIR: seeded on start, refreshed when online
```

- **Non-root.** The app runs as `nextjs` (uid/gid **1001**). Only `/data` is
  writable, plus `/app/.next/cache` and `/tmp`, which Compose mounts as tmpfs.
- **Defaults.** `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`,
  `HOSTNAME=0.0.0.0` and `PORT=3000`. The image `EXPOSE`s 3000.
- **Health.** `HEALTHCHECK` calls `GET /api/health` with Node's built-in
  `fetch`, because Alpine has no curl. The probe runs with the proxy turned
  off, so it always talks to the local server.
- **Size.** About 300 MB unpacked and 75 MB compressed. The `node:24-alpine`
  base is about 244 MB of that. The image keeps only the musl `sharp`
  binaries and drops the glibc copies.

### Offline snapshots and the data volume

Every external source (NOAA SWPC, NASA OSDR) has a snapshot file
`<key>.json`. The app reads the snapshot whenever the live API cannot be
reached. Snapshots live in two directories:

| Variable | Local default (`npm run dev` / `npm start`) | Docker image | Role |
| --- | --- | --- | --- |
| `DEMIFY_SNAPSHOT_SEED_DIR` | `data/snapshots` (committed) | `/app/data/snapshots-seed` (read-only, baked in from `data/snapshots`) | Bundled snapshots shipped with the release. Never written by the app |
| `DEMIFY_SNAPSHOT_DIR` | `data/runtime/snapshots` (git-ignored) | `/data/snapshots` (on the data volume) | Writable copies. Every successful live fetch rewrites the snapshot here, so a spacecraft keeps the latest data it saw before losing its link |

The app reads both directories and serves whichever copy of a snapshot is
newer, so a fresh seed shipped with a new image wins over an older refreshed
copy. Running the app locally never modifies the committed snapshots.

On each start, `docker/entrypoint.sh` does the following:

1. Copies every file from `/app/data/snapshots-seed` into
   `$DEMIFY_SNAPSHOT_DIR` (default `/data/snapshots`) **if that file is not
   there yet**. Snapshots the app refreshed earlier are not overwritten.
   Set `DEMIFY_RESEED_SNAPSHOTS=true` to force the bundled copies, for example
   after shipping a newer image to an offline vehicle.
2. Checks the snapshot dir. If it is not writable (a read-only mount, or a
   bind mount owned by another user), the entrypoint keeps using any
   snapshots already there. If the dir is empty, it points
   `DEMIFY_SNAPSHOT_DIR` at the read-only seed copy. Either way the app still
   serves data. Only the online refresh is turned off.
3. Logs a warning if `DEMIFY_DATA_DIR` is not writable, because crew readings
   cannot be saved then.

To refresh the snapshots bundled in the image, run the app online locally
and then run `npm run snapshots:promote`. It copies every valid JSON
snapshot from `DEMIFY_SNAPSHOT_DIR` (default `data/runtime/snapshots`) into
`DEMIFY_SNAPSHOT_SEED_DIR` (default `data/snapshots`). Alternatively, copy
the files from a running container with
`docker cp demify:/data/snapshots/. data/snapshots/`. Then commit and
rebuild.

**Bind mounts instead of a named volume:** the host directory must be
writable by uid 1001:

```bash
sudo mkdir -p /srv/demify && sudo chown -R 1001:1001 /srv/demify
docker run -v /srv/demify:/data ...
```

---

## 3. Configuration reference

All settings are environment variables, read when the server starts (nothing
is fixed at build time). See `.env.example` for the full list with comments.
An empty value counts as unset, so the default applies. The defaults below
are those of the Docker image; outside Docker the data and snapshot dirs
default to paths under `data/` (see section 2).

With Compose, `.env` only fills in the `${...}` placeholders of
`docker-compose.yml`. A variable reaches the container only if the
`x-demify-env` block lists it. When you add a setting, add it there too.

| Variable | Default | Notes |
| --- | --- | --- |
| `DEMIFY_MISSION` | `iss` | `iss` \| `artemis-lunar` \| `mars-transit`. Sets the radiation baseline, comm delay, gravity and duration. Unknown values fall back to `iss` with a warning in the log |
| `DEMIFY_MISSION_START` | 92 days before start-up | Mission start as an ISO date (`2026-09-01`). Drives mission day and the dose budget. The default moves on every restart, so set it for a real mission. Invalid values are ignored with a warning |
| `DEMIFY_OFFLINE` | `false` | `true` means the app never calls external APIs and serves snapshots only |
| `DEMIFY_CACHE_TTL` | `300` | Seconds a live response is kept in memory |
| `DEMIFY_FETCH_TIMEOUT_MS` | `8000` | Timeout for each outbound request. Lower it to fall back to snapshots sooner on a degraded link |
| `DEMIFY_SIMULATE` | `true` | Demo telemetry generator. Set `false` with real sensors |
| `DEMIFY_DATA_DIR` | `/data` | Persistent JSON store. Must be a volume. Fixed by Compose |
| `DEMIFY_SNAPSHOT_DIR` | `/data/snapshots` | Writable snapshot dir, seeded from the image. Fixed by Compose |
| `DEMIFY_SNAPSHOT_SEED_DIR` | `/app/data/snapshots-seed` | Read-only bundled snapshots (see section 2) |
| `DEMIFY_RESEED_SNAPSHOTS` | `false` | Overwrite snapshots with the image's copies on start |
| `DEMIFY_RETENTION_DAYS` | `1100` | Crew readings older than this are pruned from the store on write (keep it longer than the mission) |
| `DEMIFY_MAX_READINGS` | `50000` | Hard cap on stored readings; oldest sensor readings are evicted first, then oldest manual ones |
| `DEMIFY_RATE_LIMIT_PER_MIN` | `600` | Readings accepted per crew member per minute on `POST /api/readings` (429 above) |
| `DEMIFY_ADMIN_TOKEN` | empty (off) | Optional write protection. When set, `POST`/`DELETE /api/scenarios` and `POST /api/readings` answer `401` unless the request sends the header `x-demify-admin: <token>` or the httpOnly `SameSite=Strict` cookie a browser gets from `GET /unlock?token=<token>` (compared in constant time; the cookie holds a value derived from the token, valid 7 days). Pages and `GET` APIs stay open. Use a long random value (`openssl rand -hex 24`); see [`OPERATIONS.md` §3.7](OPERATIONS.md#37-stage-and-shared-networks) |
| `NASA_API_KEY` | `DEMO_KEY` | Get a key at <https://api.nasa.gov/>. `DEMO_KEY` is heavily rate limited |
| `OSDR_BASE_URL` | `https://osdr.nasa.gov` | Point at a ground relay or mirror if needed |
| `OSDR_BIODATA_URL` | `https://visualization.osdr.nasa.gov` | |
| `SWPC_BASE_URL` | `https://services.swpc.noaa.gov` | |
| `PORT` / `HOSTNAME` | `3000` / `0.0.0.0` | Listen address inside the container |

Compose-only variables, which the app does not read: `DEMIFY_PORT`,
`DEMIFY_OFFLINE_PORT`, `DEMIFY_BIND`, `DEMIFY_IMAGE`, `DEMIFY_CPUS`,
`DEMIFY_MEMORY`, `DEMIFY_BUILD_CA`, plus the `DEMIFY_*PROXY` and
`DEMIFY_NODE_EXTRA_CA_CERTS` variables described in the next section.

`DEMIFY_BIND` (default `127.0.0.1`) is the host address of the published
ports of `demify` and of the air-gapped relay `demify-offline-gateway`. The
loopback default suits a stage laptop and a host with its own reverse proxy;
`0.0.0.0` publishes on every interface for LAN clients. Combine `0.0.0.0`
with `DEMIFY_ADMIN_TOKEN`.

---

## 4. Behind a proxy / custom CA

Node's built-in `fetch` **ignores** `HTTPS_PROXY`/`HTTP_PROXY` unless
`NODE_USE_ENV_PROXY=1` is set. Without it, every external API call fails
with `fetch failed`. The image sets `NODE_USE_ENV_PROXY=1`. This changes
nothing when no proxy variables are set.

**Runtime with Docker Compose.** Use the `DEMIFY_`-prefixed names in `.env`.
Compose maps them onto the standard names inside the container. The prefix
keeps a proxy set in your own shell (often `http://127.0.0.1:...`) out of the
container, where `127.0.0.1` would mean the container itself.

```dotenv
DEMIFY_HTTPS_PROXY=http://proxy.example.internal:3128
DEMIFY_HTTP_PROXY=http://proxy.example.internal:3128
DEMIFY_NO_PROXY=localhost,127.0.0.1
# TLS-intercepting proxy or private mirror: mount its CA and point Node at it
DEMIFY_NODE_EXTRA_CA_CERTS=/etc/demify/ca.crt
```

Then uncomment the CA volume of the `demify` service in `docker-compose.yml`:

```yaml
    volumes:
      - demify-data:/data
      - ./certs/ca.crt:/etc/demify/ca.crt:ro
```

**Runtime with plain Docker.** Use the standard names directly:

```bash
docker run -d -p 3000:3000 -v demify-data:/data \
  -e HTTPS_PROXY=http://proxy.example.internal:3128 \
  -e NO_PROXY=localhost,127.0.0.1 \
  -v $PWD/certs/ca.crt:/etc/demify/ca.crt:ro \
  -e NODE_EXTRA_CA_CERTS=/etc/demify/ca.crt \
  demify:dev
```

**Build time.** `npm ci` fails with `SELF_SIGNED_CERT_IN_CHAIN` behind a
TLS-intercepting proxy. Pass the CA bundle as a BuildKit **secret**. It is
mounted only for the `npm ci` and `next build` steps and never stored in an
image layer:

```bash
docker build --secret id=build_ca,src=./certs/ca.crt -t demify:dev .
```

With Compose, set `DEMIFY_BUILD_CA=./certs/ca.crt`. The `certs/` dir is
git- and docker-ignored. Without it, Compose passes `docker/no-extra-ca.pem`,
a committed placeholder without certificates that the build ignores
(`.gitignore` excludes `*.pem` but makes an exception for this file). Recent Compose versions build
through Bake, which refuses secret files outside the project directory
(`additional privileges requested: --allow=fs.read=...`). Keep the CA file
inside the repo checkout, for example in `./certs/`.

---

## 5. Offline and air-gapped operation

There are two layers of isolation:

1. **`DEMIFY_OFFLINE=true`.** The app never attempts an outbound request and
   serves snapshots right away. Responses are marked `"freshness":"snapshot"`,
   for example on `GET /api/space-weather`. This setting alone is enough for
   most deployments.
2. **No network route at all.** `network_mode: none` would also stop the
   published port from working. The `offline` Compose profile does this
   instead:
   - `demify-offline` runs only on an `internal: true` network, which has no
     egress and no DNS.
   - `demify-offline-gateway` is a tiny Node TCP relay built from the same
     image. It sits on the internal network and the default network, and
     publishes `${DEMIFY_OFFLINE_PORT:-3001}`.

```bash
docker compose --profile offline up -d --build demify-offline demify-offline-gateway
curl http://localhost:3001/api/health        # {"status":"ok",...,"offline":true}
```

On real flight hardware, the vehicle network usually provides the
isolation. In that case, run the single `demify` service with
`DEMIFY_OFFLINE=true`, or let it fall back to snapshots on its own while the
link is down. `DEMIFY_FETCH_TIMEOUT_MS` controls how fast that fallback
happens.

**Moving the image without a registry:**

```bash
docker save demify:1.0.0 | gzip > demify-1.0.0.tar.gz      # on the ground
docker load < demify-1.0.0.tar.gz                           # on the target
```

---

## 6. Multi-architecture builds (ARM flight computers)

The lockfile contains musl binaries for both `x64` and `arm64`, so the same
Dockerfile builds for ARM:

```bash
# one-time: a builder that can target several platforms (+ QEMU if cross-building)
docker buildx create --name demify-builder --use
docker run --privileged --rm tonistiigi/binfmt --install arm64   # only on x86 hosts

docker buildx build --platform linux/amd64,linux/arm64 \
  -t registry.example.internal/demify:1.0.0 --push .

# Single-arch tarball for an offline ARM target
docker buildx build --platform linux/arm64 \
  -t demify:1.0.0-arm64 -o type=docker,dest=demify-1.0.0-arm64.tar .
```

Building `arm64` under QEMU emulation is slow, because `next build` is
CPU-heavy. A native ARM builder node (`docker buildx create --append ...`)
is much faster. Add `--secret id=build_ca,src=...` when building behind a
proxy (see section 4).

---

## 7. Resource limits

Compose sets `cpus: 1.0` and `memory: 512M` by default. Override them with
`DEMIFY_CPUS` and `DEMIFY_MEMORY`. The server used about 50 MB of RAM when idle in testing.
Budget 150 to 250 MB under load. For very small boards:

```bash
docker run --memory=256m --cpus=0.5 \
  -e NODE_OPTIONS=--max-old-space-size=192 ...
```

Compose also applies `read_only: true`, `cap_drop: [ALL]`,
`no-new-privileges`, `init: true` (tini as PID 1 for clean `SIGTERM`
handling) and rotating json-file logs (3 × 10 MB). Allow a stop grace
period of 10 to 30 s (`stop_grace_period: 20s`) so in-flight requests and
pending writes can finish.

---

## 8. Reverse proxy and TLS

Do not expose the Node server to untrusted networks directly. Put a
reverse proxy in front for TLS, request limits and authentication. Compose
already binds the app to loopback (`DEMIFY_BIND` defaults to `127.0.0.1`),
so the proxy on the same host reaches it and nothing else does:

**Caddy** (automatic TLS):

```caddyfile
demify.example.org {
    reverse_proxy 127.0.0.1:3000
}
```

**nginx:**

```nginx
server {
    listen 443 ssl http2;
    server_name demify.example.org;
    ssl_certificate     /etc/ssl/demify.crt;
    ssl_certificate_key /etc/ssl/demify.key;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;          # keep App Router streaming working
    }
}
```

On an isolated spacecraft LAN without a public CA, issue certificates from
the mission's internal CA, or terminate TLS at the vehicle's gateway.

**Demify has no user accounts.** The optional `DEMIFY_ADMIN_TOKEN` locks the
write APIs (drills and device readings) but not the pages, which show crew
health data. Restrict who can read them at the proxy or network layer. Behind
TLS, pass `X-Forwarded-Proto` (as above; Caddy does it by default) so the
unlock cookie is marked `Secure`.

---

## 9. Scaling and swapping the JSON store for a database

The default store (`src/lib/store/readings.ts`) is one JSON file,
`$DEMIFY_DATA_DIR/demify-db.json`. Writes are serialised in-process and
replaced atomically (`.tmp` + rename). This suits **one instance** per
vehicle or station. Do not run several replicas on the same volume.

To scale out or keep a longer history:

1. Keep the exported functions of `src/lib/store/readings.ts`
   (`listCrew`, `getCrew`, `listReadings`, `addReadings`, ...) and
   reimplement them on top of a database: SQLite (single node, still one
   file on `/data`), PostgreSQL, or a time-series DB.
2. Add a connection variable (for example `DATABASE_URL`) to
   `src/lib/config.ts`, `.env.example` and `docker-compose.yml`. Add the DB as
   a Compose service with its own volume, and put it in `depends_on` with
   `condition: service_healthy`.
3. With more than one app instance, also follow the multi-instance notes in
   the Next.js self-hosting guide: share `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`
   and `deploymentId`, and use a shared cache handler. The in-memory API
   cache (`DEMIFY_CACHE_TTL`) is per instance, which is fine.

---

## 10. Operations checklist

```bash
docker compose ps                                  # health state
docker compose logs -f demify                      # entrypoint + server logs
docker inspect --format '{{json .State.Health}}' demify | jq
docker compose exec demify ls -la /data /data/snapshots

# Backup / restore crew data
docker run --rm -v demify_demify-data:/data -v $PWD:/backup alpine \
  tar czf /backup/demify-data-$(date +%F).tgz -C /data .
docker run --rm -v demify_demify-data:/data -v $PWD:/backup alpine \
  sh -c 'tar xzf /backup/demify-data-YYYY-MM-DD.tgz -C /data && chown -R 1001:1001 /data'

# Upgrade (data volume is kept)
docker compose pull || docker compose build
docker compose up -d
```

`docker-compose.yml` fixes the Compose project name to `demify`, so the
volume is always `demify_demify-data`. It changes if you pass `-p`. Check
with `docker volume ls`.
