# Demify onboard server on an NVIDIA DGX Spark

This guide sets up the Demify onboard server: one NVIDIA DGX Spark (GB10,
Arm64, 128 GB unified memory, DGX OS) that stands in for the medical server of
a crewed station, with the ISS as the example. It is optional. The pitch setup
stays [`docker-compose.yml`](../docker-compose.yml) and needs neither a
database nor a model; nothing in this guide changes it.

Research prototype, not a certified medical device. The DGX Spark is a
desktop unit used as a prototype stand-in, not flight hardware and not
radiation-hardened (see [Reliability and flight hardware](#11-reliability-and-flight-hardware)).

The one-page overview for the pitch is [`ARCHITECTURE.md`](ARCHITECTURE.md).

**Contents**

1. [What runs where](#1-what-runs-where)
2. [Prerequisites on DGX OS](#2-prerequisites-on-dgx-os)
3. [Install step by step](#3-install-step-by-step)
4. [Verify](#4-verify)
5. [The library: first ingest and updates](#5-the-library-first-ingest-and-updates)
6. [Blackout demo](#6-blackout-demo)
7. [Backups](#7-backups)
8. [Updating](#8-updating)
9. [Troubleshooting](#9-troubleshooting)
10. [Settings reference](#10-settings-reference)
11. [Reliability and flight hardware](#11-reliability-and-flight-hardware)

---

## 1. What runs where

Four long-running containers in one compose file,
[`docker-compose.spark.yml`](../docker-compose.spark.yml):

```
  EARTH SIDE (simulated)       ┊        STATION: one NVIDIA DGX Spark
                               ┊
                               ┊          crew browsers and tablets
                               ┊          (station LAN, port 3000)
                               ┊                     │
                               ┊                     ▼
  NOAA SWPC, NASA OSDR ◄───────┊───────────── ┌─────────────┐   question,     ┌─────────────┐
  (live data)                  ┊              │     app     │   passages      │    model    │
                               ┊              │  Demify UI  │ ──────────────► │ Ollama, GPU │
                               ┊              │ rule engine │                 │   gpt-oss   │
                               ┊              │  assistant  │                 │ nomic-embed │
                               ┊              └──────┬──────┘                 └──────▲──────┘
                               ┊                     │ readings, library,            │
                               ┊                     ▼ ground link switch            │ embeddings
                               ┊              ┌─────────────┐                 ┌──────┴──────┐
                               ┊              │     db      │                 │    sync     │
                               ┊              │ PostgreSQL  │ ◄────────────── │   service   │
                               ┊              │ + pgvector  │                 │             │
                               ┊              └─────────────┘                 └──────▲──────┘
  ground library ──────────────┊─────────────────────────────────────────────────────┘
  (./library folder)           ┊
                               ┊
                  ground link (simulated switch)

  default network: ground link path, published app port, model downloads
  onboard network (internal, no route out): db, model, app, sync
```

| Container | Image | What it does | Network | Data |
|---|---|---|---|---|
| `db` | `pgvector/pgvector:pg17` | Crew readings, the onboard library (passages, 768-d embeddings, full-text index), medical-kit inventory, sync history, the simulated ground link switch. Cluster created with `--data-checksums` | onboard only, never published | volume `pgdata` |
| `model` | `ollama/ollama` (set `DEMIFY_OLLAMA_IMAGE`) | The local language model and the embedding model on the GPU. The app uses only its OpenAI-compatible API (`http://model:11434/v1`), so it can be swapped for vLLM, llama.cpp or TensorRT-LLM | onboard + default (downloads) | volume `models` |
| `app` | Demify, built from the [`Dockerfile`](../Dockerfile) | The crew UI, the deterministic rule engine and alarms, the onboard assistant (library assistant, local language model) | onboard + default | volume `app-data` (snapshots, JSON spool) |
| `sync` | the same Demify image | Library sync from the ground every `DEMIFY_SYNC_INTERVAL_HOURS` (default 6) while the ground link is up, data snapshot refresh, embeddings for new passages | onboard + default | none (tmpfs) |
| `model-pull` | `ollama/ollama` | One-shot, explicit model download (profile `models`, never started by `up`) | onboard | none |
| `model-port` | the Demify image | Optional: publishes the model API on `127.0.0.1` when `DEMIFY_MODEL_BIND` is set; not running otherwise | default | none |

The rule engine and alarms stay primary and do not depend on the model. The
onboard assistant explains and finds the right procedure; it never raises or
clears an alarm. It advises and never decides: the crew and, when the ground
link is up, the flight surgeons make every medical decision.

**Normal mode** (ground link up): the library syncs from the ground, the data
pages show live NOAA and NASA OSDR data (labelled REAL). **Blackout** (ground
link down): the onboard library and the last snapshots only (labelled
SNAPSHOT with their date); every answer says how old the library is.

---

## 2. Prerequisites on DGX OS

DGX OS ships with Docker and the NVIDIA Container Toolkit. Check both, as the
user that will run the stack:

```bash
docker --version
docker compose version        # Compose v2
nvidia-smi                    # the GB10 and the driver
# A CUDA container sees the GPU (any recent CUDA base image works):
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu24.04 nvidia-smi
```

If `docker` needs `sudo`, add your user to the `docker` group
(`sudo usermod -aG docker $USER`, then log in again).

If the CUDA container fails with `could not select device driver "" with
capabilities: [[gpu]]`, the toolkit is not wired into Docker:

```bash
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

You also need:

- **Disk:** about 5 GB for images, plus the models: about 14 GB for
  `gpt-oss:20b` or about 65 GB for `gpt-oss:120b`.
- **Setup network:** Docker Hub (images), the npm registry (image build) and
  the Ollama model registry (`model-pull`). After setup the stack runs without
  them; the ground link in the demo is the simulated switch, not this.
- **Docker at boot:** `systemctl is-enabled docker` must say `enabled`, so the
  stack comes back after a power cycle.

---

## 3. Install step by step

### 3.1 Clone

```bash
git clone https://github.com/Duesi09/Demify---Health-Monitoring-Software-for-Astronauts.git demify
cd demify
```

### 3.2 Create `.env`

```bash
cp .env.spark.example .env
chmod 600 .env
# Required: the stack refuses to start without it. Letters and digits only.
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 24)/" .env
# Recommended: an admin token for the write APIs (drills, readings, the
# ground link switch, Sync now).
sed -i "s/^DEMIFY_ADMIN_TOKEN=.*/DEMIFY_ADMIN_TOKEN=$(openssl rand -hex 24)/" .env
```

The example sets `COMPOSE_FILE=docker-compose.spark.yml`, so every plain
`docker compose ...` command below, run in this folder, uses the onboard
server file. Without that line add `-f docker-compose.spark.yml` to each
command.

`POSTGRES_PASSWORD` is applied when the database is created, on the first
start with an empty volume. Changing it in `.env` later is not enough (see
[Troubleshooting](#9-troubleshooting)).

### 3.3 Choose the model

Set `DEMIFY_LLM_MODEL` in `.env`. The 128 GB are unified memory: the CPU,
the GPU, PostgreSQL, the page cache and DGX OS all share them, so leave
headroom.

| Item | Memory (approx.) | Notes |
|---|---|---|
| `gpt-oss:20b` | ~14 GB | **Default.** Apache-2.0, mixture of experts (21 B parameters, about 3.6 B active per token). Fast answers |
| `gpt-oss:120b` | ~65 GB | Option. Apache-2.0, mixture of experts (117 B parameters, about 5.1 B active per token). Stronger, slower, still fits |
| `nomic-embed-text` | ~0.3 GB | Embeddings, 768 dimensions, Apache-2.0. Keep it: the library column is `vector(768)` |
| KV cache | a few GB | Grows with `DEMIFY_OLLAMA_CONTEXT_LENGTH` (8192) × `DEMIFY_OLLAMA_NUM_PARALLEL` (2) |
| PostgreSQL | ~2–4 GB | `shared_buffers` 2 GB plus work memory (limit `DEMIFY_DB_MEMORY`, 12 GB) |
| app + sync | up to 2.5 GB | Container limits 2 GB and 512 MB |
| DGX OS, page cache, headroom | the rest | Keep at least ~30 GB free, also with `gpt-oss:120b` |

Why mixture-of-experts models suit the Spark: generating a token is limited
by memory bandwidth, because every token reads the model weights it uses. The
Spark has a lot of memory (128 GB) but moderate bandwidth (about 273 GB/s). A
dense 70 B model at 4 bits reads roughly 35 GB per token, which caps it at
well under 10 tokens per second. A mixture-of-experts model keeps all its
experts in memory but reads only the few that are active for each token
(about 2–3 GB for `gpt-oss`), so it answers many times faster while the full
model still fits.

`OLLAMA_KEEP_ALIVE=-1` keeps both models loaded once they have been used, so
the crew never waits for a cold start, and `OLLAMA_MAX_LOADED_MODELS=2` keeps
the language model and the embedding model resident side by side.

Pin the Ollama image you tested: `DEMIFY_OLLAMA_IMAGE=ollama/ollama:<version>`
in `.env`. `gpt-oss` needs a recent Ollama, and the GB10 needs a build with
CUDA support for it; check the Ollama release notes.

### 3.4 Build and start

```bash
docker compose up -d --build     # builds the Demify image natively for arm64
docker compose ps                # wait until db, app and sync are "(healthy)"
```

The model server starts too, still empty. Until the models are pulled, the
onboard assistant shows matching library passages instead of a model answer
("passages only"); everything else works.

On first start the app and the sync service apply the database schema
(under a lock, so they never collide), the app imports any readings from an
earlier JSON store, and the sync service seeds the empty library from the
release copy inside the image.

### 3.5 Pull the models (explicit step)

Nothing downloads a model by itself. When the team has decided on the model:

```bash
docker compose --profile models run --rm model-pull
```

This pulls `DEMIFY_LLM_MODEL` and `DEMIFY_EMBED_MODEL` into the `models`
volume and lists them. The download goes through the model server, over the
default network (and `DEMIFY_HTTPS_PROXY`, if set). To add another model
later, for example to compare:

```bash
docker compose exec model ollama pull gpt-oss:120b
```

Within a minute the sync service notices the embedding model and embeds the
library passages that were waiting (`docker compose logs sync`).

---

## 4. Verify

```bash
docker compose ps
```

All four services `(healthy)`. Then:

```bash
# Health of the app; database "connected".
curl -s http://127.0.0.1:3000/api/health

# The onboard stack as the app sees it.
curl -s http://127.0.0.1:3000/api/onboard/status | jq '{database, model: .model.state, documents: .library.documents, chunks: .library.chunks, pending: .library.pendingEmbeddings, synced: .library.freshness.libraryAgeText}'
```

Expect `database: "connected"`, `model: "ready"` (after `model-pull`;
`missing-models` before it), the library documents, and `pending: 0` once the
embeddings are done.

Ask one question in the app (Onboard assistant, `/assistant`) or with curl:

```bash
curl -s -X POST http://127.0.0.1:3000/api/assistant \
  -H 'Content-Type: application/json' \
  -d '{"question":"Where is the pulse oximeter stowed?"}' \
  | jq '{status, answer, cited: [.citations[] | "[\(.n)] \(.title) › \(.heading)"], freshness: .freshness.libraryAgeText, model: .mode.model}'
```

Then check that the models run on the GPU:

```bash
docker compose exec model ollama ps
```

```
NAME                       ID              SIZE     PROCESSOR    ...
gpt-oss:20b                ...             ...      100% GPU     ...
nomic-embed-text:latest    ...             ...      100% GPU     ...
```

`100% GPU` in the PROCESSOR column is what you want. `CPU` or a CPU/GPU split
means the model server does not use the GPU (see
[Troubleshooting](#9-troubleshooting)). `ollama ps` lists only loaded models:
ask one question first.

The model API is not published. To reach it from the Spark itself (for a
benchmark tool, say), set `DEMIFY_MODEL_BIND=11434` in `.env` and run
`docker compose up -d`; it is then on `127.0.0.1:11434` only.

---

## 5. The library: first ingest and updates

The curated library lives in [`library/`](../library/) (protocols,
references, the medical-kit inventory; rules in
[`library/README.md`](../library/README.md)). It holds no medicines: no drug
names, doses, amounts or schedules. Every passage is project text, not
clinically reviewed, and says so with every citation.

Two copies matter on the Spark:

| Copy | Where | Role |
|---|---|---|
| Release copy | `/app/library` inside the image | Seeds an empty database on first start (also during a blackout). Changes with a rebuilt image |
| Ground library | `./library` on the host, mounted read-only at `/ground/library` | Plays the Earth-side library server. Synced while the ground link is up |

### 5.1 First ingest

Automatic: on its first start the sync service fills the empty library from
the release copy (`trigger startup`), then syncs from the ground library
while the ground link is up. Check:

```bash
docker compose logs sync | grep -i library
```

Manual, for example after a restore or to see what a question retrieves:

```bash
docker compose exec sync node scripts/library-ingest.mjs
docker compose exec sync node scripts/library-ingest.mjs --no-sync --search "What is the cabin CO2 limit?"
docker compose exec sync node scripts/db-migrate.mjs     # schema version and tables
```

`library-ingest` exits with 3 while the ground link is down; add `--force` to
ingest anyway (a local first ingest).

Passages are stored with a SHA-256 of their text; the full-text index works
at once, the vector search as soon as the embedding model has embedded them.

### 5.2 Add or update a document on the ground

1. Edit or add a Markdown file in `./library` on the host (the "ground"),
   following [`library/README.md`](../library/README.md): front matter with
   `id`, `title`, `category`, `source`, `license`, `reviewed`, `updated`;
   restate only facts that already have a named source in the project.
2. Check it: `npx vitest run tests/library.test.ts` (on a development machine).
3. With the ground link up, press **Sync now** on the Library page
   (`/library`), or:

   ```bash
   TOKEN=$(grep '^DEMIFY_ADMIN_TOKEN=' .env | cut -d= -f2-)
   curl -s -X POST http://127.0.0.1:3000/api/sync -H "x-demify-admin: $TOKEN" | jq .library
   ```

   Otherwise the sync service picks the change up at its next scheduled sync.
4. The Library page shows the new version (SHA-256 prefix) and the sync run;
   answers cite the new passage.

A quick demo that adds nothing medical: change the `location` of the pulse
oximeter in `library/inventory/med-kit.json`, press Sync now, ask "Where is
the pulse oximeter stowed?". Undo with `git checkout library/` and sync again.

Deleting a file removes the document from the onboard library at the next
sync. A file whose front matter is broken stops the sync with an error that
names the file; the onboard library keeps its previous version.

---

## 6. Blackout demo

The ground link switch is simulated: it does not cut the network. The app and
the sync service behave as if the link were down. `DEMIFY_OFFLINE=true` is the
hard version: the link stays down whatever the switch says.

1. **Normal mode.** Ask a question on the Onboard assistant page. The answer
   cites its passages ([1], [2] …) and shows "last synced …" and "ground link
   up". The data pages show REAL with the fetch time.
2. **Switch the ground link off** with the switch in the app, or:

   ```bash
   TOKEN=$(grep '^DEMIFY_ADMIN_TOKEN=' .env | cut -d= -f2-)
   curl -s -X POST http://127.0.0.1:3000/api/ground-link \
     -H 'Content-Type: application/json' -H "x-demify-admin: $TOKEN" \
     -d '{"up":false}'
   ```

3. **Blackout.** The data pages show SNAPSHOT with the snapshot date. The
   sync service logs `ground link down (blackout)` and stops syncing. Sync now
   answers `409` with "Ground link is down (blackout): nothing to sync from".
   The assistant keeps answering from the onboard library, says how old it is
   ("last synced 14 hours ago") and marks it stale after
   `DEMIFY_SYNC_MAX_AGE_HOURS`. Alarms and the rule engine are unaffected.
4. Optional: edit a document in `./library` now. It does not reach the
   station until the link is back.
5. **Switch the ground link on** (`{"up":true}`). The data pages fetch live
   data again on their next request (REAL), Sync now pulls the edited document
   at once, and the sync service resumes its schedule (snapshots every
   `DEMIFY_SNAPSHOT_REFRESH_MINUTES`, the library every
   `DEMIFY_SYNC_INTERVAL_HOURS`).

Read the switch with `curl -s http://127.0.0.1:3000/api/ground-link`.

---

## 7. Backups

What matters is the database: crew readings, the library as synced, the
sync history and the switch. The models can be pulled again, and the app
volume holds snapshots (re-seeded from the image) and the JSON spool (replayed
into the database automatically).

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U demify -d demify -Fc \
  > "backups/demify-$(date -u +%Y%m%dT%H%MZ).dump"
```

Run it daily, for example from cron
(`17 3 * * * cd /path/to/demify && docker compose exec -T db pg_dump -U demify -d demify -Fc > backups/demify-$(date -u +\%Y\%m\%d).dump`),
and copy the files off the box: to the second unit or down the ground link.

Restore (stops the writers, replaces the database):

```bash
docker compose stop app sync
docker compose exec -T db psql -U demify -d postgres \
  -c 'DROP DATABASE demify WITH (FORCE)' -c 'CREATE DATABASE demify'
docker compose exec -T db pg_restore -U demify -d demify < backups/demify-YYYYMMDDTHHMMZ.dump
docker compose start app sync
```

Optional, the app volume (snapshots, ground link mirror, spool):

```bash
docker run --rm -v demify-spark_app-data:/data:ro -v "$PWD/backups":/backup \
  pgvector/pgvector:pg17 tar czf /backup/app-data.tgz -C /data .
```

`docker compose down` keeps all volumes. `docker compose down -v` deletes
them: the database, the app data and the downloaded models.

---

## 8. Updating

```bash
docker compose exec -T db pg_dump -U demify -d demify -Fc > backups/before-update.dump
git pull
docker compose up -d --build
docker compose ps
```

New database migrations are applied automatically when the app and the sync
service start (each in its own transaction, recorded in `schema_migrations`).

- **Model server:** set a new `DEMIFY_OLLAMA_IMAGE` tag, then
  `docker compose pull model && docker compose up -d model`. The models in
  the volume stay.
- **Another model:** change `DEMIFY_LLM_MODEL` in `.env`, run `model-pull`,
  then `docker compose up -d` (recreates app and sync with the new setting).
- **PostgreSQL major version:** not in place. Dump, start a new volume with
  the new image, restore.
- **Release copy of the library:** part of the image; rebuilt with
  `--build`. It only seeds an empty database, so the ground library
  (`./library`) is what updates a running station.
- **No registry access at the station:** build and pull on the ground, then
  move the images with `docker save` / `docker load` and the models by copying
  the `models` volume.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `required variable POSTGRES_PASSWORD is missing a value` | `.env` missing or the password empty | [Section 3.2](#32-create-env) |
| `model` does not start: `could not select device driver "nvidia"` | NVIDIA Container Toolkit not configured for Docker | `sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker` |
| `ollama ps` shows `CPU` or a CPU/GPU split | Ollama image without CUDA support for the GB10, or the model does not fit | Use a recent `DEMIFY_OLLAMA_IMAGE`; check the `inference compute` lines in `docker compose logs model`; choose a smaller model or lower `DEMIFY_OLLAMA_CONTEXT_LENGTH` / `DEMIFY_OLLAMA_NUM_PARALLEL` |
| The assistant shows "passages only" | No model answer: `model` unreachable, models not pulled, or the answer failed a safety check | `/api/onboard/status`: `missing-models` → [3.5](#35-pull-the-models-explicit-step); `unreachable` → `docker compose ps model`, `docker compose logs model` |
| `model-pull` fails with a TLS or connection error | Proxy needed, or a TLS-intercepting proxy | Set `DEMIFY_HTTPS_PROXY`, then `docker compose up -d model`. For an intercepting proxy, mount a CA bundle that contains its CA and the public roots over `/etc/ssl/certs/ca-certificates.crt` in the `model` service |
| `pending` embeddings stay above 0 | Embedding model missing or `model` down | `docker compose logs sync`; pull `DEMIFY_EMBED_MODEL`. Full-text search covers the passages meanwhile |
| `sync` is `(unhealthy)` | Its loop stopped touching the heartbeat for 5 minutes | `docker compose logs sync`; `docker compose restart sync` |
| App logs `PostgreSQL connection lost` / `/api/health` says `database: "unreachable"` | `db` restarting or stopped | `docker compose ps db`, `docker compose logs db`. The app keeps working on its JSON spool and replays it when the database is back |
| `password authentication failed for user "demify"` | `POSTGRES_PASSWORD` changed after the database was created | Set it back, or change it in the database too: `docker compose exec db psql -U demify -d demify -c "ALTER USER demify PASSWORD '<new>'"`, then `docker compose up -d` |
| Library sync failed, error names a file | Broken front matter or a reserved `id` | Fix the file ([`library/README.md`](../library/README.md)); the previous version stays in use |
| Sync now answers `409` | Ground link switched off (blackout) or `DEMIFY_OFFLINE=true` | Expected. Switch the link on |
| `could not resize shared memory segment` in the `db` log | A parallel HNSW index build needs more `/dev/shm` | Raise `shm_size` of `db` in the compose file |
| `page verification failed, calculated checksum …` in the `db` log | A data page changed on disk (storage or memory fault) | Stop the writers, restore from the last backup (section 7), check the hardware |
| Port 3000 in use | Another service on the host | Set `DEMIFY_PORT` in `.env` |

Logs: `docker compose logs -f app sync`, `docker compose logs --tail 100 db model`.
Container states and restart counts:
`docker inspect -f '{{.Name}} {{.State.Health.Status}} restarts={{.RestartCount}}' $(docker compose ps -q)`.

---

## 10. Settings reference

Every setting is an environment variable in `.env`; see
[`.env.spark.example`](../.env.spark.example) for the onboard server and
[`.env.example`](../.env.example) for everything else.

| Variable | Default | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | (required) | Password of the `demify` database user; letters and digits |
| `DEMIFY_LLM_MODEL` | `gpt-oss:20b` | Language model name on the model server |
| `DEMIFY_EMBED_MODEL` | `nomic-embed-text` | Embedding model (768 dimensions) |
| `DEMIFY_MODEL_URL` | `http://model:11434/v1` | OpenAI-compatible endpoint; point it at another runtime to swap the model server |
| `DEMIFY_OLLAMA_IMAGE` | `ollama/ollama:latest` | Model server image; pin a tested tag |
| `DEMIFY_OLLAMA_NUM_PARALLEL` | `2` | Parallel requests per model |
| `DEMIFY_OLLAMA_CONTEXT_LENGTH` | `8192` | Context length (tokens) per request |
| `DEMIFY_MODEL_BIND` | unset | Host port on `127.0.0.1` for the model API; unset = not published |
| `DEMIFY_SYNC_INTERVAL_HOURS` | `6` | Scheduled library sync while the ground link is up |
| `DEMIFY_SYNC_MAX_AGE_HOURS` | `24` | Library age after which answers mark it stale |
| `DEMIFY_SYNC_TICK_SECONDS` | `60` | Sync service loop interval |
| `DEMIFY_SNAPSHOT_REFRESH_MINUTES` | `30` | Snapshot refresh while the ground link is up |
| `DEMIFY_ADMIN_TOKEN` | empty | Token for drills, readings, the ground link switch, Sync now |
| `DEMIFY_BIND`, `DEMIFY_PORT` | `127.0.0.1`, `3000` | Where the app port is published |
| `DEMIFY_OFFLINE` | `false` | Hard air-gap: the ground link stays down |
| `DEMIFY_HTTPS_PROXY`, `DEMIFY_HTTP_PROXY`, `DEMIFY_NO_PROXY` | empty | Proxy for live data and model downloads; the container names are always in `NO_PROXY` |
| `DEMIFY_CPUS`, `DEMIFY_MEMORY`, `DEMIFY_DB_MEMORY` | `4.0`, `2G`, `12G` | Container limits |

PostgreSQL settings (`shared_buffers` 2 GB, `effective_cache_size` 8 GB,
`maintenance_work_mem` 1 GB for HNSW builds, `max_connections` 50) are in the
`command` of the `db` service.

---

## 11. Reliability and flight hardware

### What the prototype does

- **Restart policies.** All four services run with `restart: always`. A
  crashed process comes back by itself, and after a power cycle Docker starts
  the whole stack again. `depends_on` only orders `docker compose up`; after a
  reboot Docker starts everything at once, so every service waits for the
  others by itself: the sync service retries the database with backoff, the
  app falls back to its JSON store until PostgreSQL answers, the assistant
  falls back to passages while the model loads.
- **Health checks.** `db` (`pg_isready`), `model` (`ollama list`), `app`
  (`/api/health`) and `sync` (a heartbeat file younger than 5 minutes) report
  their state in `docker compose ps`. Docker restarts a container when it
  exits, not when it turns unhealthy; flight software would pair this with a
  watchdog that restarts or fails over an unhealthy service.
- **PostgreSQL crash recovery.** Every committed change is in the
  write-ahead log (WAL) on disk before the commit returns (`fsync`,
  `full_page_writes` and `synchronous_commit` on, spelled out in the compose
  file). After a crash or power loss PostgreSQL replays the WAL and comes
  back consistent. Tested on this stack by killing the server process: the
  container restarted, the log showed `database system was not properly shut
  down; automatic recovery in progress` and `redo done`, and every committed
  row was there.
- **Page checksums.** The cluster is created with `--data-checksums`.
  PostgreSQL verifies each data page when it reads it and reports a mismatch
  instead of returning silently wrong data. Check with
  `docker compose exec db psql -U demify -d demify -c 'SHOW data_checksums'`
  and `SELECT datname, checksum_failures FROM pg_stat_database`. Checksums
  reveal corruption; backups and a replica repair it.
- **Library integrity.** Every library passage stores the SHA-256 of its
  text, re-checked on read. A passage that fails the check is never shown or
  given to the model; the answer reports it as an integrity failure. Each
  document's version is the SHA-256 of its body.
- **JSON spool.** While PostgreSQL is unreachable, the app reads from and
  writes crew readings to its JSON file on the `app-data` volume, with the
  same reading ids. The next successful database operation replays the spool,
  so nothing is lost or duplicated. The ground link switch is mirrored in a
  file the same way.
- **The model is optional.** Without a model answer the assistant shows the
  matching passages ("passages only"); with no good passage it says the
  library has no answer instead of guessing.

### What flight hardware would need

The DGX Spark is a commercial desktop unit and a prototype stand-in. A flight
unit would need:

- **ECC memory**, with scrubbing, so single-bit errors are corrected instead
  of reaching the data.
- **Liquid or conduction cooling.** There is no natural convection in
  microgravity: warm air does not rise, so fans and heat sinks designed for
  a desk do not cool the same way. Flight computers move heat through cold
  plates or liquid loops into the station's thermal control system.
- **A dedicated power budget**, agreed with the station's power system, with
  the GPU power-capped so the model server cannot exceed it.
- **Radiation-aware design.** Energetic particles flip bits in memory and
  logic. Mitigations: ECC, checksums on stored data (as above), watchdogs,
  redundant storage, and parts screened or hardened for the radiation
  environment.
- **A redundant second unit.** One box is a single point of failure. A
  second unit with a PostgreSQL streaming replica (a hot standby that can take
  over) and its own copy of the models keeps the library and the readings
  available when one unit fails.

Precedent: HPE's Spaceborne Computer (2017) and Spaceborne Computer-2 (2021)
ran commercial off-the-shelf servers on the ISS, protected by software
hardening rather than radiation-hardened parts, and Spaceborne Computer-2
included GPUs for processing on board.
