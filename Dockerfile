# syntax=docker/dockerfile:1
#
# Demify - astronaut health monitoring
# Multi-stage build producing a small, non-root Next.js "standalone" image.
#
#   docker build -t demify:dev .
#   docker run --rm -p 3000:3000 -v demify-data:/data demify:dev
#
# Behind a TLS-intercepting proxy / private registry, pass the CA bundle as a
# BuildKit secret (never stored in an image layer):
#   docker build --secret id=build_ca,src=/path/to/ca.pem -t demify:dev .
#
# Multi-arch (e.g. ARM flight computers):
#   docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/demify:<tag> --push .
#
# The same image runs the onboard server's sync service and its scripts
# (docker-compose.spark.yml, docs/SPARK.md); on an NVIDIA DGX Spark it builds
# natively for arm64.
#
# See docs/DEPLOYMENT.md for the full guide.

ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
# 1) deps: install exact dependency tree from package-lock.json
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# No apk packages needed: package-lock.json pins the musl builds of the native
# toolchain (@next/swc-*-musl, lightningcss-*-musl, @tailwindcss/oxide-*-musl),
# so the build only needs the npm registry (no Alpine package mirror).
# Optional private npm mirror, e.g. --build-arg NPM_CONFIG_REGISTRY=https://npm.internal/
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=secret,id=build_ca,required=false \
    if grep -qs "BEGIN CERTIFICATE" /run/secrets/build_ca; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; \
    fi \
 && npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# 2) builder: compile the Next.js app (output: "standalone")
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Guarantee the dirs exist even if no snapshots/public assets are checked in,
# so the COPY steps in the runner stage never fail.
RUN --mount=type=secret,id=build_ca,required=false \
    if grep -qs "BEGIN CERTIFICATE" /run/secrets/build_ca; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; \
    fi \
 && mkdir -p public data/snapshots \
 && npx next build \
 # The runtime is musl (Alpine): drop the glibc builds of sharp/libvips that
 # npm also installs (~18 MB). The linuxmusl-* builds stay.
 && rm -rf .next/standalone/node_modules/@img/sharp-linux-* \
           .next/standalone/node_modules/@img/sharp-libvips-linux-*

# ---------------------------------------------------------------------------
# 3) runner: minimal runtime image
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app

ARG NODE_IMAGE
ARG VERSION=0.1.0
ARG VCS_REF=unknown
ARG BUILD_DATE=unknown
LABEL org.opencontainers.image.title="Demify" \
      org.opencontainers.image.description="Health monitoring software for astronauts on space missions (NASA Space Apps Challenge). Next.js standalone server with offline data snapshots." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/Duesi09/Demify---Health-Monitoring-Software-for-Astronauts" \
      org.opencontainers.image.base.name="${NODE_IMAGE}"

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    DEMIFY_DATA_DIR=/data \
    DEMIFY_SNAPSHOT_DIR=/data/snapshots \
    DEMIFY_SNAPSHOT_SEED_DIR=/app/data/snapshots-seed \
    DEMIFY_SEED_LIBRARY_DIR=/app/library \
    NODE_USE_ENV_PROXY=1
# NODE_USE_ENV_PROXY=1 makes Node's built-in fetch honour HTTPS_PROXY /
# HTTP_PROXY / NO_PROXY (it ignores them otherwise). It is a no-op when no
# proxy variables are set. Add a private CA with NODE_EXTRA_CA_CERTS.

# Unprivileged runtime user (fixed UID/GID so bind mounts can be chowned).
RUN addgroup -S -g 1001 nodejs \
 && adduser -S -D -H -u 1001 -G nodejs -h /nonexistent -s /sbin/nologin nextjs \
 && mkdir -p /data/snapshots \
 && chown -R nextjs:nodejs /data

# Standalone server + traced node_modules, then the assets server.js does not
# copy itself (public/ and .next/static). Files are owned by root and therefore
# read-only for the runtime user; only /data is writable.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Offline snapshots of the external APIs, shipped read-only in the image and
# copied into the data volume on first start by the entrypoint.
COPY --from=builder /app/data/snapshots ./data/snapshots-seed
# Onboard server (docker-compose.spark.yml): the plain-Node modules shared by
# the app and the scripts, the curated library (the release copy that seeds
# an empty database, DEMIFY_SEED_LIBRARY_DIR; without a database the app reads
# it directly) and the production scripts run by the sync container and by
# operators. Root-owned like the rest of /app, so read-only for the runtime
# user. Dev-only tools (scripts/dev/**) are kept out by .dockerignore.
COPY --from=builder /app/onboard ./onboard
COPY --from=builder /app/library ./library
COPY --from=builder /app/scripts/library-ingest.mjs /app/scripts/sync-service.mjs /app/scripts/db-migrate.mjs ./scripts/
COPY docker/entrypoint.sh /usr/local/bin/demify-entrypoint
# Strip CR in case the repo was checked out on Windows with CRLF endings
# (otherwise: "/bin/sh^M: not found" at container start).
RUN sed -i 's/\r$//' /usr/local/bin/demify-entrypoint \
 && chmod 0755 /usr/local/bin/demify-entrypoint \
 && rm -f /app/data/demify-db.json \
 && mkdir -p /app/.next/cache \
 && chown nextjs:nodejs /app/.next/cache \
 # The sync service and the scripts run with plain Node outside the Next.js
 # bundle, so "pg" (traced into the standalone node_modules because the app
 # imports it) and every onboard module must resolve here. Fail the build
 # now rather than the sync container at start-up.
 && { test -f node_modules/pg/package.json \
      || { echo "pg is missing from the standalone node_modules" >&2; exit 1; }; } \
 && node --input-type=module \
      -e "for (const f of process.argv.slice(1)) await import('/app/' + f)" onboard/*.mjs \
 && for f in scripts/*.mjs; do node --check "$f" || exit 1; done

USER nextjs:nodejs
VOLUME ["/data"]
EXPOSE 3000

# Probe the local server directly (proxy disabled for the probe).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["env", "-u", "NODE_USE_ENV_PROXY", "node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

ENTRYPOINT ["/usr/local/bin/demify-entrypoint"]
CMD ["node", "server.js"]
