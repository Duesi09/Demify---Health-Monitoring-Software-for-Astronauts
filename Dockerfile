# syntax=docker/dockerfile:1

# The first two stages run on the architecture of the machine that builds, also
# when the image is meant for another one: what they hand on is JavaScript,
# which is the same everywhere, and a build under emulation takes many times longer.
FROM --platform=$BUILDPLATFORM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM --platform=$BUILDPLATFORM node:22-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Next.js packs its image optimiser (sharp) with binaries for the build machine.
# The app serves no optimised images, so it is left out and the server stays
# plain JavaScript. Should another native module ever end up in the server, stop
# here instead of shipping a binary for the wrong architecture.
RUN rm -rf .next/standalone/node_modules/sharp .next/standalone/node_modules/@img \
  && if find .next/standalone -name '*.node' | grep -q .; then \
       echo 'The server contains a native module. Build the deps and build stages for the target platform (remove --platform=$BUILDPLATFORM).' >&2; \
       exit 1; \
     fi

FROM node:22-slim AS run
LABEL org.opencontainers.image.title="Demify" \
      org.opencontainers.image.description="Health monitoring for astronauts on long-duration missions" \
      org.opencontainers.image.source="https://github.com/Duesi09/Demify---Health-Monitoring-Software-for-Astronauts" \
      org.opencontainers.image.licenses="MIT"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 DEMIFY_DATA_DIR=/data
# The application files stay owned by root: the server reads them and never writes them.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The backup tool (docs/data.md); it needs nothing but Node.
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
# Readings entered by the crew are kept here; mount a volume to keep them.
# A directory mounted from the host must be writable for user 1000 (node).
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
# Asks the liveness endpoint with Node itself, so the image needs no curl.
# The quick checks at the start (Docker 25 and later) report a healthy container within seconds.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "server.js"]
