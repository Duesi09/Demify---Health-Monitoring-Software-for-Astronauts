#!/bin/sh
# Demify container entrypoint.
#
# 1. Seeds the writable snapshot directory (normally /data/snapshots on the
#    data volume) with the offline snapshots baked into the image, without
#    overwriting snapshots the app refreshed while online.
# 2. If the snapshot directory cannot be written (read-only mount, wrong
#    owner), falls back to the read-only seed copy so the app still works
#    air-gapped.
# 3. execs the given command (node server.js) so it receives signals directly.
set -eu

SEED_DIR="${DEMIFY_SNAPSHOT_SEED_DIR:-/app/data/snapshots-seed}"
SNAP_DIR="${DEMIFY_SNAPSHOT_DIR:-/data/snapshots}"
DATA_DIR="${DEMIFY_DATA_DIR:-/data}"

log() { echo "[demify-entrypoint] $*"; }

# Real write probe: `test -w` is not reliable on read-only mounts.
writable() {
  mkdir -p "$1" 2>/dev/null || return 1
  probe="$1/.demify-write-test.$$"
  ( : > "$probe" ) 2>/dev/null || return 1
  rm -f "$probe"
}

# --- data dir --------------------------------------------------------------
if ! writable "$DATA_DIR"; then
  log "WARNING: DEMIFY_DATA_DIR=$DATA_DIR is not writable by uid $(id -u)." \
      "Crew readings cannot be saved. Fix volume ownership (chown 1001:1001)."
fi

# --- snapshots -------------------------------------------------------------
if [ "$SNAP_DIR" != "$SEED_DIR" ] && [ -d "$SEED_DIR" ]; then
  if writable "$SNAP_DIR"; then
    copied=0
    for f in "$SEED_DIR"/*; do
      [ -f "$f" ] || continue
      dest="$SNAP_DIR/$(basename "$f")"
      # Keep newer snapshots fetched while online unless a reseed is forced.
      if [ ! -e "$dest" ] || [ "${DEMIFY_RESEED_SNAPSHOTS:-false}" = "true" ]; then
        if cp "$f" "$dest.tmp" 2>/dev/null && mv -f "$dest.tmp" "$dest"; then
          copied=$((copied + 1))
        else
          log "WARNING: could not seed $dest"
        fi
      fi
    done
    log "snapshots: $copied file(s) seeded into $SNAP_DIR"
  elif ls "$SNAP_DIR"/*.json >/dev/null 2>&1; then
    log "WARNING: $SNAP_DIR is read-only; serving the snapshots already" \
        "there (online refresh disabled)."
  else
    log "WARNING: $SNAP_DIR is not writable; serving read-only bundled" \
        "snapshots from $SEED_DIR (online refresh disabled)."
    DEMIFY_SNAPSHOT_DIR="$SEED_DIR"
    export DEMIFY_SNAPSHOT_DIR
  fi
fi

log "mission=${DEMIFY_MISSION:-iss} offline=${DEMIFY_OFFLINE:-false}" \
    "data=$DATA_DIR snapshots=${DEMIFY_SNAPSHOT_DIR:-$SNAP_DIR}"

# --- onboard server (docker-compose.spark.yml) -------------------------------
# Where the database and the model server are: host, port and path only,
# never the user name, password or query string. Silent without them (the
# default setup), so the pitch logs stay as they were.
where() {
  [ -n "$1" ] || { echo "not set"; return 0; }
  rest="${1#*://}"
  rest="${rest##*@}"
  echo "${rest%%\?*}"
}
if [ -n "${DATABASE_URL:-}" ] || [ -n "${DEMIFY_MODEL_URL:-}" ]; then
  log "onboard: database=$(where "${DATABASE_URL:-}")" \
      "model=$(where "${DEMIFY_MODEL_URL:-}")"
fi

exec "$@"
