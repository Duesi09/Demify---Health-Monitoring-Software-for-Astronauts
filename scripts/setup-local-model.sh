#!/usr/bin/env bash
# Demify: a local language model for the onboard assistant on this machine
# (the pitch laptop), macOS and Linux. Windows: scripts/setup-local-model.ps1.
#
#   bash scripts/setup-local-model.sh                    # gemma3:4b (default)
#   bash scripts/setup-local-model.sh --model gemma3:1b  # another model
#   npm run model:setup -- --model gemma3:1b             # the same through npm
#
# What it does (safe to run again; it never uses sudo and stores no secret):
#   1. checks that Ollama is installed and running, and that Docker runs;
#   2. shows the memory it finds and which model suits it (a hint only);
#   3. pulls the model into Ollama (the embedding model too with --with-embed);
#   4. sets DEMIFY_MODEL_URL and DEMIFY_LLM_MODEL in .env (creates .env from
#      .env.example when it is missing; no other line is changed);
#   5. docker compose -f docker-compose.yml up -d --build;
#   6. waits until /api/onboard/status reports the model, then asks one test
#      question.
#
# Without a model Demify works as before: the onboard assistant shows the
# matching library passages only. Guide: docs/LOCAL-MODEL.md.

set -euo pipefail

DEFAULT_MODEL="gemma3:4b"
DEFAULT_EMBED_MODEL="nomic-embed-text"
OLLAMA_URL="http://127.0.0.1:11434"
# How the Demify container reaches Ollama on this machine (extra_hosts
# host.docker.internal:host-gateway in docker-compose.yml).
CONTAINER_MODEL_URL="http://host.docker.internal:11434/v1"
TEST_QUESTION="Where is the pulse oximeter in the medical kit?"
ENV_COMMENT="# Local language model (scripts/setup-local-model.sh or .ps1, docs/LOCAL-MODEL.md)"

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-local-model.sh [options]

Sets up a local language model (Ollama) for the Demify onboard assistant and
starts Demify with docker-compose.yml. Safe to run again.

Options:
  --model <name>    Ollama model to use (default gemma3:4b).
                    gemma3:1b for machines with about 8 GB of memory,
                    gpt-oss:20b with an NVIDIA GPU (16 GB or more) or 32 GB+
                    of unified memory.
  --with-embed      Also pull the embedding model (nomic-embed-text, about
                    0.3 GB). Only the onboard database uses it; the pitch
                    setup (no database) searches the library by keywords.
  --no-test         Do not ask the test question at the end.
  --timeout <sec>   How long to wait for Demify to report the model (240).
  -h, --help        Show this help.

Guide: docs/LOCAL-MODEL.md
EOF
}

say() { printf '%s\n' "$*"; }
step() { printf '\n==> %s\n' "$*"; }
warn() { printf 'Note: %s\n' "$*" >&2; }
die() {
  printf '\nStopped: %s\n' "$1" >&2
  shift
  local line
  for line in "$@"; do printf '  %s\n' "$line" >&2; done
  exit 1
}

# --------------------------------------------------------------------------
# .env helpers (the file docker compose reads in this folder)
# --------------------------------------------------------------------------

# Last value of NAME=... in .env, without quotes or an inline comment.
env_file_value() {
  [ -f .env ] || return 0
  sed -n "s/^[[:space:]]*$1=//p" .env | tail -n 1 | tr -d '\r' |
    sed -e 's/[[:space:]][[:space:]]*#.*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# Sets NAME=VALUE in .env: replaces every active NAME= line, or appends one.
# Comments and all other lines stay exactly as they are.
set_env_var() {
  local name="$1" value="$2" tmp
  if grep -q "^$name=" .env; then
    if [ "$(env_file_value "$name")" = "$value" ] && [ "$(grep -c "^$name=" .env)" -eq 1 ]; then
      say "  $name=$value (unchanged)"
      return 0
    fi
    tmp="$(mktemp ".env.tmp.XXXXXX")"
    awk -v k="$name" -v v="$value" 'index($0, k "=") == 1 { print k "=" v; next } { print }' .env >"$tmp"
    cat "$tmp" >.env # keeps the file's permissions
    rm -f "$tmp"
    say "  $name=$value (updated)"
  else
    if ! grep -qF "$ENV_COMMENT" .env; then
      # Start on a new line even if the file does not end with one.
      if [ -s .env ] && [ "$(tail -c 1 .env | od -An -c | tr -d ' ')" != '\n' ]; then printf '\n' >>.env; fi
      printf '\n%s\n' "$ENV_COMMENT" >>.env
    fi
    printf '%s=%s\n' "$name" "$value" >>.env
    say "  $name=$value (added)"
  fi
}

# --------------------------------------------------------------------------
# Ollama helpers (HTTP API on this machine; the CLI when it is installed)
# --------------------------------------------------------------------------

ollama_up() { curl -fsS --noproxy '*' --max-time 3 "$OLLAMA_URL/api/version" >/dev/null 2>&1; }

# "gemma3" and "gemma3:latest" are the same model.
full_name() { case "$1" in *:*) printf '%s' "$1" ;; *) printf '%s:latest' "$1" ;; esac; }

has_local_model() {
  local wanted
  wanted="$(full_name "$1")"
  curl -fsS --noproxy '*' --max-time 10 "$OLLAMA_URL/api/tags" 2>/dev/null |
    grep -o '"name":"[^"]*"' | sed 's/^"name":"//; s/"$//' | grep -Fx "$wanted" >/dev/null
}

pull_model() {
  local model="$1"
  say "  ollama pull $model"
  if command -v ollama >/dev/null 2>&1; then
    if ollama pull "$model"; then return 0; fi
  else
    say "  (Ollama CLI not on PATH: pulling through the Ollama API, no progress shown)"
    if curl -fsS --noproxy '*' --max-time 7200 -X POST "$OLLAMA_URL/api/pull" \
      -H 'Content-Type: application/json' -d "{\"model\":\"$model\",\"stream\":false}" >/dev/null; then
      return 0
    fi
  fi
  if has_local_model "$model"; then
    warn "could not check $model for updates (no connection?); using the copy already on this machine."
    return 0
  fi
  die "could not pull $model." \
    "Check the name on https://ollama.com/library and that this machine can reach the Ollama registry."
}

# --------------------------------------------------------------------------
# Demify status helpers (no jq needed)
# --------------------------------------------------------------------------

# First "key":"value" string in a JSON text (empty when there is none).
json_str() { printf '%s' "$2" | tr -d '\n' | grep -o "\"$1\":\"[^\"]*\"" | head -n 1 | sed "s/^\"$1\":\"//; s/\"\$//" || true; }

# Does the "available" list in a status JSON contain the model?
status_lists_model() {
  local json="$1" wanted list
  wanted="$(full_name "$2")"
  list="$(printf '%s' "$json" | tr -d '\n' | grep -o '"available":\[[^]]*\]' | head -n 1 || true)"
  printf '%s' "$list" | grep -o '"[^"]*"' | sed 's/^"//; s/"$//' | sed '/^available$/d' |
    while IFS= read -r id; do full_name "$id"; printf '\n'; done | grep -Fx "$wanted" >/dev/null
}

# --------------------------------------------------------------------------
# Machine facts for the model hint
# --------------------------------------------------------------------------

memory_mib() {
  case "$(uname -s)" in
    Darwin) echo $(($(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576)) ;;
    Linux) awk '/^MemTotal:/ { printf "%d\n", $2 / 1024 }' /proc/meminfo 2>/dev/null || echo 0 ;;
    *) echo 0 ;;
  esac
}

# "name, memory MiB" of the first NVIDIA GPU, empty when there is none.
nvidia_gpu() {
  command -v nvidia-smi >/dev/null 2>&1 || return 0
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | head -n 1 || true
}

apple_silicon() { [ "$(uname -s)" = Darwin ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; }

model_hint() {
  local mem_mib="$1" gpu="$2" gpu_mib=0
  if [ -n "$gpu" ]; then gpu_mib="$(printf '%s' "${gpu##*,}" | tr -dc '0-9')"; gpu_mib="${gpu_mib:-0}"; fi
  if [ "$mem_mib" -gt 0 ] && [ "$mem_mib" -lt 8704 ]; then
    say "  Hint: about 8 GB of memory or less. gemma3:1b (about 0.8 GB) leaves room for Docker and the browser:"
    say "        bash scripts/setup-local-model.sh --model gemma3:1b"
  elif [ "$gpu_mib" -ge 15000 ]; then
    say "  Hint: NVIDIA GPU with $(((gpu_mib + 512) / 1024)) GB. gemma3:4b runs well; gpt-oss:20b (about 14 GB) is an option:"
    say "        bash scripts/setup-local-model.sh --model gpt-oss:20b"
  elif apple_silicon && [ "$mem_mib" -ge 32000 ]; then
    say "  Hint: $(((mem_mib + 512) / 1024)) GB of unified memory. gemma3:4b runs well; gpt-oss:20b (about 14 GB) is an option:"
    say "        bash scripts/setup-local-model.sh --model gpt-oss:20b"
  else
    say "  Hint: gemma3:4b (about 3.3 GB) suits this machine."
  fi
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

main() {
  local model="" pull_embed=0 ask_test=1 timeout=240
  while [ $# -gt 0 ]; do
    case "$1" in
      --model)
        [ $# -ge 2 ] || { usage >&2; exit 2; }
        model="$2"
        shift 2
        ;;
      --model=*)
        model="${1#--model=}"
        shift
        ;;
      --with-embed) pull_embed=1; shift ;;
      --no-test) ask_test=0; shift ;;
      --timeout)
        [ $# -ge 2 ] || { usage >&2; exit 2; }
        timeout="$2"
        shift 2
        ;;
      --timeout=*)
        timeout="${1#--timeout=}"
        shift
        ;;
      -h | --help) usage; exit 0 ;;
      *)
        printf 'Unknown option: %s\n\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done
  model="${model:-$DEFAULT_MODEL}"
  if ! printf '%s' "$model" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'; then
    printf 'Not a model name: %s\n' "$model" >&2
    exit 2
  fi
  if ! printf '%s' "$timeout" | grep -Eq '^[0-9]+$'; then
    printf 'Not a number of seconds: %s\n' "$timeout" >&2
    exit 2
  fi

  local root
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$root"
  [ -f docker-compose.yml ] && [ -f .env.example ] ||
    die "run this script from the Demify repository (docker-compose.yml not found in $root)."

  local os
  os="$(uname -s)"

  # 1. Prerequisites ---------------------------------------------------------
  step "Checking Ollama and Docker"
  command -v curl >/dev/null 2>&1 || die "curl is needed."
  if ! ollama_up; then
    if command -v ollama >/dev/null 2>&1; then
      case "$os" in
        Darwin) die "Ollama is installed but not running." "Open the Ollama app (or run: ollama serve), then run this script again." ;;
        *) die "Ollama is installed but not running." "Start it with: sudo systemctl start ollama   (or run: ollama serve)" "Then run this script again." ;;
      esac
    fi
    die "Ollama is not installed (nothing answers on $OLLAMA_URL)." \
      "Install it from https://ollama.com/download, start it, then run this script again."
  fi
  say "  Ollama answers on $OLLAMA_URL"
  command -v docker >/dev/null 2>&1 || die "Docker is not installed." "Install Docker Desktop (macOS) or Docker Engine (Linux), see README.md."
  docker info >/dev/null 2>&1 || die "Docker is not running." "Start Docker Desktop (or the docker service), then run this script again."
  docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is needed (docker compose version)."
  say "  Docker runs"

  if [ -f .env ] && grep -Eq '^[[:space:]]*COMPOSE_FILE=.*spark' .env; then
    die "this .env belongs to the DGX Spark setup (COMPOSE_FILE=docker-compose.spark.yml)." \
      "This script sets up the pitch laptop with docker-compose.yml; the Spark runs its own model server (docs/SPARK.md)."
  fi

  # On Docker Engine for Linux the container reaches this machine through the
  # Docker bridge, and Ollama listens on 127.0.0.1 unless told otherwise.
  # Docker Desktop forwards host.docker.internal to 127.0.0.1 by itself.
  local docker_os
  docker_os="$(docker info --format '{{.OperatingSystem}}' 2>/dev/null || true)"
  if [ "$os" = Linux ] && case "$docker_os" in *"Docker Desktop"*) false ;; *) true ;; esac; then
    local gw
    gw="$(docker network inspect bridge --format '{{range .IPAM.Config}}{{.Gateway}}{{end}}' 2>/dev/null || true)"
    gw="${gw:-172.17.0.1}"
    if ! curl -fsS --noproxy '*' --max-time 3 "http://$gw:11434/api/version" >/dev/null 2>&1; then
      die "Ollama listens on 127.0.0.1 only, so the Demify container cannot reach it (Docker bridge $gw)." \
        "Let Ollama listen on all interfaces, then run this script again:" \
        "" \
        "  sudo systemctl edit ollama.service" \
        "    (add these two lines in the editor, save and close)" \
        "    [Service]" \
        "    Environment=\"OLLAMA_HOST=0.0.0.0\"" \
        "  sudo systemctl daemon-reload" \
        "  sudo systemctl restart ollama" \
        "" \
        "If you start Ollama by hand instead: OLLAMA_HOST=0.0.0.0 ollama serve" \
        "Port 11434 is then open to your network as well; on a shared network block it" \
        "in your firewall for everything but Docker (docs/LOCAL-MODEL.md)."
    fi
    say "  Ollama is reachable from Docker (bridge $gw)"
  fi

  # 2. Model hint --------------------------------------------------------------
  step "Choosing the model"
  local mem gpu
  mem="$(memory_mib)"
  gpu="$(nvidia_gpu)"
  if [ "$mem" -gt 0 ]; then say "  Memory: $(((mem + 512) / 1024)) GB$(apple_silicon && printf ' (unified, Apple silicon)')"; else say "  Memory: unknown"; fi
  if [ -n "$gpu" ]; then say "  NVIDIA GPU: $gpu MiB"; fi
  model_hint "$mem" "$gpu"
  say "  Using: $model"

  # 3. Pull ----------------------------------------------------------------------
  step "Pulling the model into Ollama"
  pull_model "$model"
  local embed_model
  embed_model="${DEMIFY_EMBED_MODEL:-$(env_file_value DEMIFY_EMBED_MODEL)}"
  embed_model="${embed_model:-$DEFAULT_EMBED_MODEL}"
  if [ "$pull_embed" = 1 ]; then
    pull_model "$embed_model"
  fi

  # 4. .env --------------------------------------------------------------------
  step "Writing the model settings to .env"
  if [ ! -f .env ]; then
    cp .env.example .env
    chmod 600 .env
    say "  Created .env from .env.example"
  fi
  set_env_var DEMIFY_MODEL_URL "$CONTAINER_MODEL_URL"
  set_env_var DEMIFY_LLM_MODEL "$model"
  local var
  for var in DEMIFY_MODEL_URL DEMIFY_LLM_MODEL; do
    if [ -n "${!var:-}" ]; then
      warn "$var is set in your shell (${!var}). docker compose prefers it over .env; this script ignores it, but unset it in your shell before you run docker compose yourself."
    fi
  done

  # 5. Start Demify ----------------------------------------------------------------
  step "Starting Demify (docker compose -f docker-compose.yml up -d --build)"
  if ! env -u DEMIFY_MODEL_URL -u DEMIFY_LLM_MODEL docker compose -f docker-compose.yml up -d --build; then
    die "docker compose could not build or start Demify." \
      "Behind a TLS-intercepting proxy the image build needs DEMIFY_BUILD_CA (docs/DEPLOYMENT.md, section 4)." \
      "Logs: docker compose -f docker-compose.yml logs demify"
  fi

  # 6. Wait for the model ------------------------------------------------------------
  local port host base
  port="${DEMIFY_PORT:-$(env_file_value DEMIFY_PORT)}"
  port="${port:-3000}"
  host="${DEMIFY_BIND:-$(env_file_value DEMIFY_BIND)}"
  case "$host" in "" | 0.0.0.0 | "::" | "[::]") host="127.0.0.1" ;; esac
  base="http://$host:$port"
  step "Waiting for Demify to report the model ($base/api/onboard/status, up to $timeout s)"
  local deadline body="" state="" last="" ok=0
  deadline=$(($(date +%s) + timeout))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    body="$(curl -fsS --noproxy '*' --max-time 10 "$base/api/onboard/status" 2>/dev/null || true)"
    state="$(json_str state "$body")"
    if [ "$state" = ready ]; then
      ok=1
    elif [ "$state" = missing-models ] && status_lists_model "$body" "$model"; then
      ok=2 # the language model is there; only the embedding model is missing
    fi
    [ "$ok" = 0 ] || break
    if [ "${state:-no answer}" != "$last" ]; then
      say "  model state: ${state:-no answer yet}"
      last="${state:-no answer}"
    fi
    sleep 3
  done
  if [ "$ok" = 0 ]; then
    case "$state" in
      "") die "Demify did not answer on $base within $timeout s." \
        "Check: docker compose -f docker-compose.yml ps   and   docker compose -f docker-compose.yml logs demify" ;;
      not-configured) die "the Demify container has no DEMIFY_MODEL_URL." \
        "Check that .env in $root has DEMIFY_MODEL_URL=$CONTAINER_MODEL_URL and run this script again." ;;
      unreachable)
        if [ "$os" = Linux ]; then
          die "the Demify container cannot reach Ollama at host.docker.internal:11434." \
            "Ollama must listen on more than 127.0.0.1 (see above or docs/LOCAL-MODEL.md)." \
            "With ufw active, allow the Docker networks: sudo ufw allow from 172.16.0.0/12 to any port 11434 proto tcp"
        fi
        die "the Demify container cannot reach Ollama at host.docker.internal:11434." \
          "Is Ollama still running? Then: docker compose -f docker-compose.yml restart demify" ;;
      *) die "Ollama does not list $model (state: $state)." "Check with: ollama list" ;;
    esac
  fi
  if [ "$ok" = 2 ]; then
    say "  $model is ready (the embedding model $embed_model is only needed with the onboard database)"
  else
    say "  $model is ready"
  fi

  # 7. Test question ---------------------------------------------------------------
  if [ "$ask_test" = 1 ]; then
    step "Asking a test question: \"$TEST_QUESTION\""
    say "  (the first answer also loads the model into memory; on a laptop without a GPU this can take a minute)"
    local t0 answer status reason
    t0="$(date +%s)"
    answer="$(curl -sS --noproxy '*' --max-time 200 -X POST "$base/api/assistant" \
      -H 'Content-Type: application/json' -d "{\"question\":\"$TEST_QUESTION\"}" 2>/dev/null || true)"
    status="$(json_str status "$answer")"
    reason="$(json_str reason "$answer")"
    say "  status: ${status:-no answer} after $(($(date +%s) - t0)) s"
    case "$status" in
      answered) say "  The model wrote the answer from the cited library passages." ;;
      passages-only)
        say "  The assistant showed the library passages instead of a model answer: ${reason:-no reason given}"
        say "  If the model was too slow, set DEMIFY_LLM_TIMEOUT_MS=180000 in .env and run this script again,"
        say "  or use a smaller model (--model gemma3:1b)." ;;
      "") warn "no answer from POST /api/assistant; open $base/assistant and ask there." ;;
      *) say "  ${reason:-}" ;;
    esac
  fi

  step "Done"
  say "  Open $base/assistant and ask a question. The answer names the model and cites its passages."
  say "  Switch the model: bash scripts/setup-local-model.sh --model <name>"
  say "  Back to no model: delete the DEMIFY_MODEL_URL line in .env, then docker compose -f docker-compose.yml up -d"
}

# Run main only when executed, not when sourced (tests source the helpers).
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
