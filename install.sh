#!/usr/bin/env bash
# Demify installer for macOS, Linux and Windows (Git Bash).
# Windows PowerShell: install.ps1. Guide for everyone: docs/INSTALL.md
#
#   bash install.sh                     # asks before it installs anything
#   bash install.sh --yes               # answers yes to every question
#   bash install.sh --model gemma3:1b   # choose the model yourself
#   bash install.sh --no-model          # Demify without a language model
#   bash install.sh --show-model        # show the hardware and the model it would pick
#   bash install.sh --dry-run           # print every command, change nothing
#
# Steps (safe to run again; it asks before it installs anything and before
# every sudo):
#   1. Docker: installed, running, with Compose v2 (offers to install it);
#   2. Ollama: installed and answering on 127.0.0.1:11434 (offers to install);
#   3. the language model for this computer (docs/LOCAL-MODEL.md, section 1);
#   4. scripts/setup-local-model.sh: pulls the model, writes .env, runs
#      docker compose up -d --build, waits for Demify, asks a test question;
#   5. opens Demify in the browser.
#
# Test hooks (dry run only; they never change this computer):
#   DEMIFY_INSTALL_FAKE_OS       linux | macos | mingw
#   DEMIFY_INSTALL_FAKE_ARCH     x86_64 | arm64 | aarch64
#   DEMIFY_INSTALL_FAKE_RAM_GB   total memory in GB, e.g. 8 or 7.8
#   DEMIFY_INSTALL_FAKE_GPU_GB   NVIDIA video memory in GB (0 = no NVIDIA GPU)
#   DEMIFY_INSTALL_FAKE_GPU_NAME NVIDIA GPU name, e.g. "NVIDIA GB10"
#   DEMIFY_INSTALL_FAKE_DOCKER   missing | stopped | running | no-compose | no-permission
#   DEMIFY_INSTALL_FAKE_OLLAMA   missing | stopped | running
#   DEMIFY_INSTALL_FAKE_BREW, DEMIFY_INSTALL_FAKE_WINGET   1 | 0

# Started with sh (dash) instead of bash: restart with bash.
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi

set -euo pipefail

INSTALL_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$INSTALL_ROOT/scripts/setup-local-model.sh" ] || [ ! -f "$INSTALL_ROOT/docker-compose.yml" ]; then
  printf 'Stopped: install.sh must stay in the Demify folder (scripts/setup-local-model.sh and\n' >&2
  printf 'docker-compose.yml not found next to it in %s).\n' "$INSTALL_ROOT" >&2
  exit 1
fi
# The .env helpers (env_file_value, set_env_var), ollama_up and the defaults
# come from the model setup script; its main() only runs when it is executed.
# shellcheck source=SCRIPTDIR/scripts/setup-local-model.sh
. "$INSTALL_ROOT/scripts/setup-local-model.sh"

DOCKER_URL="https://www.docker.com/products/docker-desktop/"
DOCKER_LINUX_URL="https://docs.docker.com/engine/install/"
OLLAMA_DOWNLOAD_URL="https://ollama.com/download"
DOCKER_WAIT_S=180
OLLAMA_WAIT_S=60

DRY_RUN=0
ASSUME_YES=0
OS=""
SUDO=""
CHOSEN_MODEL=""
CHOSEN_REASON=""

usage() {
  cat <<'EOF'
Usage: bash install.sh [options]

Installs Demify on this computer: checks Docker, installs Ollama if it is
missing, picks the language model for this computer, downloads it, starts
Demify and opens it in the browser. Safe to run again. It asks before it
installs anything.

Options:
  -y, --yes          Answer yes to every question (unattended install).
  --model <name>     Use this Ollama model instead of the one for this computer.
  --no-model         Install Demify without a language model (no Ollama).
  --show-model       Show the hardware and the model the installer would pick.
  --dry-run          Print every command instead of running it.
  --no-browser       Do not open the browser at the end.
  --no-test          Do not ask the test question at the end.
  --timeout <sec>    How long to wait for Demify to start (240).
  -h, --help         Show this help.

Guide: docs/INSTALL.md
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
# Running commands, asking questions
# --------------------------------------------------------------------------

# A command line as you would type it (arguments with spaces in quotes).
quote_args() {
  local out="" a
  for a in "$@"; do
    case "$a" in
      *[\$\`\"!]*) a="'$(printf '%s' "$a" | sed "s/'/'\\\\''/g")'" ;;
      *\'*) a="\"$a\"" ;;
      "" | *[!A-Za-z0-9_./:=@%+,-]*) a="'$a'" ;;
    esac
    out="$out${out:+ }$a"
  done
  printf '%s' "$out"
}

# Windows folders as Git Bash sees them.
program_files() { to_posix "${PROGRAMFILES:-${ProgramFiles:-C:\\Program Files}}"; }

# Prints the command, then runs it (in a dry run it only prints it).
run() {
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry run] $(quote_args "$@")"
    return 0
  fi
  say "  Running: $(quote_args "$@")"
  "$@"
}

# The same with sudo, unless this already runs as root. Only called after ask.
run_root() {
  if [ -n "$SUDO" ]; then run sudo "$@"; else run "$@"; fi
}

# ask "Question?": 0 for yes, 1 for no. Enter means yes.
ask() {
  local reply=""
  if [ "$ASSUME_YES" = 1 ]; then
    say "  $1 yes (--yes)"
    return 0
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "  $1 [dry run: answered yes]"
    return 0
  fi
  if [ -t 0 ]; then
    read -r -p "  $1 [Y/n] " reply || reply="n"
  elif { : </dev/tty; } 2>/dev/null; then
    read -r -p "  $1 [Y/n] " reply </dev/tty || reply="n"
  else
    say "  $1 No terminal to ask in; run the installer with --yes to answer yes."
    return 1
  fi
  case "$reply" in
    "" | [Yy] | [Yy][Ee][Ss] | [Jj] | [Jj][Aa]) return 0 ;;
    *) return 1 ;;
  esac
}

open_url() {
  local url="$1"
  case "$OS" in
    windows) run cmd.exe /c start "" "$url" || say "  Open $url in your browser." ;;
    macos) run open "$url" || say "  Open $url in your browser." ;;
    *)
      if command -v xdg-open >/dev/null 2>&1 && { [ -n "${DISPLAY:-}" ] || [ -n "${WAYLAND_DISPLAY:-}" ]; }; then
        if [ "$DRY_RUN" = 1 ]; then
          say "  [dry run] xdg-open $url"
        else
          say "  Running: xdg-open $url"
          xdg-open "$url" >/dev/null 2>&1 &
        fi
      else
        say "  Open $url in your browser."
      fi
      ;;
  esac
}

# --------------------------------------------------------------------------
# This computer
# --------------------------------------------------------------------------

# Any test hook set? (Then nothing on this computer is probed or changed.)
fake_mode() {
  [ -n "${DEMIFY_INSTALL_FAKE_OS:-}${DEMIFY_INSTALL_FAKE_ARCH:-}${DEMIFY_INSTALL_FAKE_RAM_GB:-}${DEMIFY_INSTALL_FAKE_GPU_GB:-}${DEMIFY_INSTALL_FAKE_GPU_NAME:-}" ] ||
    [ -n "${DEMIFY_INSTALL_FAKE_DOCKER:-}${DEMIFY_INSTALL_FAKE_OLLAMA:-}${DEMIFY_INSTALL_FAKE_BREW:-}${DEMIFY_INSTALL_FAKE_WINGET:-}" ]
}

detect_os() {
  local s="${DEMIFY_INSTALL_FAKE_OS:-$(uname -s 2>/dev/null || echo unknown)}"
  case "$s" in
    Darwin | darwin | mac | macos | osx) echo macos ;;
    Linux | linux) echo linux ;;
    MINGW* | MSYS* | CYGWIN* | mingw* | msys* | cygwin* | windows | gitbash) echo windows ;;
    *) echo other ;;
  esac
}

detect_arch() { printf '%s' "${DEMIFY_INSTALL_FAKE_ARCH:-$(uname -m 2>/dev/null || echo unknown)}"; }

# Windows paths (C:\Users\...) as Git Bash paths (/c/Users/...) and back.
to_posix() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -u "$1"; else printf '%s' "$1" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|/\L\1|'; fi
}
to_windows() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi
}
# A text in single quotes for a PowerShell command line.
ps_quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"; }

has_brew() {
  if fake_mode; then [ "${DEMIFY_INSTALL_FAKE_BREW:-1}" = 1 ]; else command -v brew >/dev/null 2>&1; fi
}
has_winget() {
  if fake_mode; then
    [ "${DEMIFY_INSTALL_FAKE_WINGET:-1}" = 1 ]
  else
    powershell.exe -NoProfile -Command 'if (Get-Command winget -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }' >/dev/null 2>&1
  fi
}

# Total memory in MiB (0 when unknown).
memory_total_mib() {
  if [ -n "${DEMIFY_INSTALL_FAKE_RAM_GB:-}" ]; then
    awk -v g="$DEMIFY_INSTALL_FAKE_RAM_GB" 'BEGIN { printf "%d\n", g * 1024 }'
    return 0
  fi
  if fake_mode; then echo 0; return 0; fi
  local mib=0
  case "$OS" in
    macos) mib=$(($(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1048576)) ;;
    *)
      mib="$(awk '/^MemTotal:/ { printf "%d\n", $2 / 1024 }' /proc/meminfo 2>/dev/null || true)"
      if [ -z "$mib" ] || [ "$mib" = 0 ] && [ "$OS" = windows ]; then
        mib="$(powershell.exe -NoProfile -Command '[math]::Floor((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1MB)' 2>/dev/null | tr -dc '0-9' || true)"
      fi
      ;;
  esac
  printf '%s\n' "${mib:-0}"
}

# One line per NVIDIA GPU: "name,memory MiB" (memory can be [N/A] on a GB10).
nvidia_gpus() {
  if [ -n "${DEMIFY_INSTALL_FAKE_GPU_GB:-}${DEMIFY_INSTALL_FAKE_GPU_NAME:-}" ]; then
    if [ "${DEMIFY_INSTALL_FAKE_GPU_GB:-}" = 0 ]; then return 0; fi
    if [ -n "${DEMIFY_INSTALL_FAKE_GPU_GB:-}" ]; then
      printf '%s, %s\n' "${DEMIFY_INSTALL_FAKE_GPU_NAME:-NVIDIA test GPU}" "$(awk -v g="$DEMIFY_INSTALL_FAKE_GPU_GB" 'BEGIN { printf "%d", g * 1024 }')"
    else
      printf '%s, [N/A]\n' "$DEMIFY_INSTALL_FAKE_GPU_NAME"
    fi
    return 0
  fi
  if fake_mode; then return 0; fi
  command -v nvidia-smi >/dev/null 2>&1 || return 0
  nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits 2>/dev/null | tr -d '\r' || true
}

# An NVIDIA DGX Spark (GB10 superchip)?
is_dgx_spark() {
  if printf '%s' "$1" | grep -Eqi 'GB10|DGX Spark'; then return 0; fi
  fake_mode && return 1
  grep -qsi 'DGX Spark' /sys/devices/virtual/dmi/id/product_name && return 0
  grep -qsi 'Spark' /etc/dgx-release && return 0
  return 1
}

is_apple_silicon() {
  [ "$OS" = macos ] || return 1
  case "$(detect_arch)" in arm64 | aarch64) return 0 ;; esac
  fake_mode && return 1
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]
}

gb() { awk -v m="$1" 'BEGIN { printf "%.1f", m / 1024 }'; }

# The shared model policy (docs/LOCAL-MODEL.md section 1; install.ps1 uses the
# same rules):
#   NVIDIA DGX Spark (GB10), an NVIDIA GPU with 16 GB or more, or Apple silicon
#   with 32 GB or more of unified memory     -> gpt-oss:20b
#   8.5 GB of memory or less                  -> gemma3:1b
#   anything else                             -> gemma3:4b
# Arguments: memory MiB, largest NVIDIA GPU memory MiB, spark 0/1, apple 0/1.
choose_model() {
  local mem="$1" gpu="$2" spark="$3" apple="$4"
  if [ "$spark" = 1 ]; then
    CHOSEN_MODEL="gpt-oss:20b"
    CHOSEN_REASON="NVIDIA DGX Spark (GB10): gpt-oss:20b (about 14 GB) runs on its GPU."
  elif [ "$gpu" -ge 15000 ]; then
    CHOSEN_MODEL="gpt-oss:20b"
    CHOSEN_REASON="NVIDIA GPU with $(gb "$gpu") GB of video memory (16 GB or more): gpt-oss:20b (about 14 GB) fits on it."
  elif [ "$apple" = 1 ] && [ "$mem" -ge 32000 ]; then
    CHOSEN_MODEL="gpt-oss:20b"
    CHOSEN_REASON="Apple silicon with $(gb "$mem") GB of unified memory (32 GB or more): gpt-oss:20b (about 14 GB) runs on its GPU."
  elif [ "$mem" -gt 0 ] && [ "$mem" -le 8704 ]; then
    CHOSEN_MODEL="gemma3:1b"
    CHOSEN_REASON="$(gb "$mem") GB of memory (8.5 GB or less): gemma3:1b (about 0.8 GB) leaves room for Docker and the browser."
  elif [ "$mem" -gt 0 ] && [ "$apple" = 1 ]; then
    CHOSEN_MODEL="gemma3:4b"
    CHOSEN_REASON="Apple silicon with $(gb "$mem") GB of unified memory (less than 32 GB): gemma3:4b (about 3.3 GB) runs on its GPU."
  elif [ "$mem" -gt 0 ] && [ "$gpu" -gt 0 ]; then
    CHOSEN_MODEL="gemma3:4b"
    CHOSEN_REASON="$(gb "$mem") GB of memory and an NVIDIA GPU with $(gb "$gpu") GB (less than 16 GB): gemma3:4b (about 3.3 GB) fits on it."
  elif [ "$mem" -gt 0 ]; then
    CHOSEN_MODEL="gemma3:4b"
    CHOSEN_REASON="$(gb "$mem") GB of memory and no NVIDIA GPU with 16 GB or more: gemma3:4b (about 3.3 GB) runs on the processor."
  else
    CHOSEN_MODEL="gemma3:4b"
    CHOSEN_REASON="memory size unknown: gemma3:4b (about 3.3 GB), the default."
  fi
}

# Prints the hardware and sets CHOSEN_MODEL / CHOSEN_REASON.
detect_hardware_and_model() {
  local mem gpus gpu_mib=0 gpu_names="" spark=0 apple=0 line name mib
  mem="$(memory_total_mib)"
  gpus="$(nvidia_gpus)"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    name="${line%,*}"
    mib="$(printf '%s' "${line##*,}" | tr -dc '0-9')"
    mib="${mib:-0}"
    if [ "$mib" -gt 0 ]; then name="$name ($(gb "$mib") GB)"; else name="$name (memory shared with the system)"; fi
    gpu_names="$gpu_names${gpu_names:+; }$name"
    if [ "$mib" -gt "$gpu_mib" ]; then gpu_mib="$mib"; fi
  done <<EOF
$gpus
EOF
  if is_dgx_spark "$gpus"; then spark=1; fi
  if is_apple_silicon; then apple=1; fi
  local system
  case "$OS" in windows) system="Windows (Git Bash)" ;; macos) system="macOS" ;; linux) system="Linux" ;; *) system="$OS" ;; esac
  if [ "$apple" = 1 ]; then say "  System: $system, $(detect_arch) (Apple silicon)"; else say "  System: $system, $(detect_arch)"; fi
  if [ "$mem" -gt 0 ]; then say "  Memory: $(gb "$mem") GB"; else say "  Memory: unknown"; fi
  say "  NVIDIA GPU: ${gpu_names:-none}"
  choose_model "$mem" "$gpu_mib" "$spark" "$apple"
}

# --------------------------------------------------------------------------
# Step 1: Docker
# --------------------------------------------------------------------------

# Docker Desktop's command-line tools when they are not on PATH yet.
add_docker_to_path() {
  command -v docker >/dev/null 2>&1 && return 0
  local dir=""
  case "$OS" in
    windows) dir="$(program_files)/Docker/Docker/resources/bin" ;;
    macos) dir="/Applications/Docker.app/Contents/Resources/bin" ;;
  esac
  if [ -n "$dir" ] && [ -d "$dir" ]; then PATH="$dir:$PATH"; fi
}

docker_desktop_installed() {
  case "$OS" in
    windows) [ -f "$(program_files)/Docker/Docker/Docker Desktop.exe" ] ;;
    macos) [ -d /Applications/Docker.app ] ;;
    *) return 1 ;;
  esac
}

# missing | stopped | no-permission | no-compose | windows-containers | running
docker_state() {
  if [ -n "${DEMIFY_INSTALL_FAKE_DOCKER:-}" ]; then
    printf '%s\n' "$DEMIFY_INSTALL_FAKE_DOCKER"
    return 0
  fi
  if fake_mode; then echo running; return 0; fi
  add_docker_to_path
  if ! command -v docker >/dev/null 2>&1; then
    if docker_desktop_installed; then echo stopped; else echo missing; fi
    return 0
  fi
  local err
  if ! err="$(docker info 2>&1 >/dev/null)"; then
    case "$err" in
      *"permission denied"* | *"Permission denied"*) echo no-permission ;;
      *) echo stopped ;;
    esac
    return 0
  fi
  if ! docker compose version >/dev/null 2>&1; then echo no-compose; return 0; fi
  if [ "$(docker info --format '{{.OSType}}' 2>/dev/null || true)" = windows ]; then echo windows-containers; return 0; fi
  echo running
}

install_docker() {
  case "$OS" in
    windows)
      if has_winget; then
        say "  Docker Desktop can be installed with winget. Windows asks for administrator"
        say "  rights, and Docker Desktop usually needs a restart of Windows afterwards."
        if ask "Install Docker Desktop now?"; then
          run powershell.exe -NoProfile -Command "winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements" ||
            die "winget could not install Docker Desktop." "Install it from $DOCKER_URL instead, then run the installer again."
          if [ "$DRY_RUN" = 1 ]; then
            say "  [dry run] A real run stops here: restart Windows, then run the installer again."
            return 0
          fi
          die "Docker Desktop is installed and needs a restart." \
            "1. Restart Windows." \
            "2. Start Docker Desktop once from the Start menu and accept its terms." \
            "3. Run the installer again after the restart: bash install.sh"
        fi
      fi
      open_url "$DOCKER_URL"
      die "Docker Desktop is needed." \
        "Install it from $DOCKER_URL (Windows, with the WSL 2 backend)," \
        "restart Windows if it asks, then run the installer again after the restart."
      ;;
    macos)
      if has_brew; then
        if ask "Install Docker Desktop with Homebrew (brew install --cask docker-desktop)?"; then
          run brew install --cask docker-desktop || run brew install --cask docker || die "Homebrew could not install Docker Desktop." "Install it from $DOCKER_URL instead, then run the installer again."
          return 0
        fi
      fi
      open_url "$DOCKER_URL"
      die "Docker Desktop is needed." "Install it from $DOCKER_URL, start it once, then run the installer again."
      ;;
    linux)
      say "  Docker Engine can be installed with Docker's convenience script (get.docker.com)."
      say "  Warning: that script is meant for test and development machines. It runs as root"
      say "  (sudo asks for your password), adds Docker's package source and installs the latest"
      say "  Docker Engine. On a managed computer use your distribution's way instead:"
      say "  $DOCKER_LINUX_URL"
      if ask "Run the convenience script now?"; then
        local script="${TMPDIR:-/tmp}/get-docker.sh"
        run curl -fsSL https://get.docker.com -o "$script" || die "could not download get.docker.com." "Install Docker Engine as described on $DOCKER_LINUX_URL"
        run_root sh "$script" || die "the convenience script failed (see above)." "Install Docker Engine as described on $DOCKER_LINUX_URL"
        if [ "$(id -u)" != 0 ] && [ "$DRY_RUN" = 0 ]; then
          say "  To use Docker without sudo, your user joins the group \"docker\" (this gives it"
          say "  full control of Docker; log out and in again afterwards)."
          if ask "Add $(id -un) to the docker group now (sudo usermod -aG docker $(id -un))?"; then
            run_root usermod -aG docker "$(id -un)" || true
          fi
          die "Docker Engine is installed." "Log out and in again (or restart), then run the installer again: bash install.sh"
        fi
        return 0
      fi
      die "Docker is needed." "Install Docker Engine as described on $DOCKER_LINUX_URL, then run the installer again."
      ;;
    *)
      die "Docker is needed." "Install Docker for your system ($DOCKER_URL), then run the installer again."
      ;;
  esac
}

wait_for_docker() {
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry run] wait up to $DOCKER_WAIT_S s until docker info answers"
    return 0
  fi
  local waited=0
  while [ "$waited" -lt "$DOCKER_WAIT_S" ]; do
    case "$(docker_state)" in stopped | missing) ;; *) return 0 ;; esac
    sleep 5
    waited=$((waited + 5))
    if [ $((waited % 30)) = 0 ]; then say "  Still waiting for Docker ($waited s) ..."; fi
  done
  die "Docker did not start within $((DOCKER_WAIT_S / 60)) minutes." \
    "Open Docker Desktop yourself. If it shows a window (terms, sign-in, an update), finish that." \
    "Wait until it says that the engine is running, then run the installer again."
}

start_docker() {
  case "$OS" in
    windows)
      say "  Docker Desktop is installed but not running. Starting it (this can take a minute or two)."
      # shellcheck disable=SC2016 # $env:ProgramFiles is for PowerShell, not for bash
      run powershell.exe -NoProfile -Command 'Start-Process -FilePath (Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe")' ||
        die "could not start Docker Desktop." "Start it from the Start menu, wait until the engine runs, then run the installer again."
      wait_for_docker
      ;;
    macos)
      say "  Docker Desktop is installed but not running. Starting it (this can take a minute or two)."
      say "  The first time, Docker Desktop shows a window: accept its terms there."
      run open -a Docker || die "could not start Docker Desktop." "Open it from Applications, then run the installer again."
      wait_for_docker
      ;;
    *)
      if [ "$DRY_RUN" = 1 ]; then
        say "  [dry run] a real run stops here unless Docker runs: sudo systemctl start docker"
        return 0
      fi
      die "Docker is installed but not running." \
        "Start it, then run the installer again:" \
        "  sudo systemctl start docker              (Docker Engine)" \
        "  systemctl --user start docker-desktop    (Docker Desktop for Linux)" \
        "To start Docker Engine at every boot: sudo systemctl enable docker"
      ;;
  esac
}

ensure_docker() {
  step "Step 1 of 5: Docker"
  local state
  # Here, not only inside docker_state: that runs in a subshell, and the
  # docker commands later need the PATH of this shell.
  add_docker_to_path
  state="$(docker_state)"
  if [ "$state" = missing ]; then
    say "  Docker is not installed."
    install_docker
    add_docker_to_path
    state=stopped
    if [ "$DRY_RUN" = 0 ]; then state="$(docker_state)"; fi
  fi
  if [ "$state" = stopped ]; then
    start_docker
    add_docker_to_path
    state=running
    if [ "$DRY_RUN" = 0 ]; then state="$(docker_state)"; fi
  fi
  case "$state" in
    running) say "  Docker runs, with Compose v2." ;;
    no-permission)
      die "your user may not use Docker yet (permission denied on the Docker socket)." \
        "Add it to the group \"docker\", log out and in again, then run the installer again:" \
        "  sudo usermod -aG docker $(id -un)" ;;
    no-compose)
      die "Docker Compose v2 is missing (docker compose version)." \
        "Docker Desktop includes it. On Linux install the docker-compose-plugin package:" \
        "https://docs.docker.com/compose/install/linux/" ;;
    windows-containers)
      die "Docker Desktop runs Windows containers; Demify needs Linux containers." \
        "Right-click the Docker icon in the taskbar, choose \"Switch to Linux containers\", then run the installer again." ;;
    *) die "Docker does not run (state: $state)." "Start Docker, then run the installer again." ;;
  esac
}

# --------------------------------------------------------------------------
# Step 2: Ollama
# --------------------------------------------------------------------------

# missing | stopped | running
ollama_state() {
  if [ -n "${DEMIFY_INSTALL_FAKE_OLLAMA:-}" ]; then
    printf '%s\n' "$DEMIFY_INSTALL_FAKE_OLLAMA"
    return 0
  fi
  if fake_mode; then echo running; return 0; fi
  if ollama_up; then echo running; elif [ -n "$(find_ollama)" ]; then echo stopped; else echo missing; fi
}

# The Ollama program: on PATH, or in its default place (a fresh install is
# not on PATH in this shell yet). Empty when it is not installed.
find_ollama() {
  case "${DEMIFY_INSTALL_FAKE_OLLAMA:-}" in
    missing) return 0 ;;
    stopped | running) echo ollama; return 0 ;;
  esac
  if fake_mode; then echo ollama; return 0; fi
  local c candidates=()
  if c="$(command -v ollama 2>/dev/null)" && [ -n "$c" ]; then
    printf '%s\n' "$c"
    return 0
  fi
  case "$OS" in
    windows)
      if [ -n "${LOCALAPPDATA:-}" ]; then candidates+=("$(to_posix "$LOCALAPPDATA")/Programs/Ollama/ollama.exe"); fi
      candidates+=("$HOME/AppData/Local/Programs/Ollama/ollama.exe")
      ;;
    macos) candidates+=(/Applications/Ollama.app/Contents/Resources/ollama "$HOME/Applications/Ollama.app/Contents/Resources/ollama" /usr/local/bin/ollama /opt/homebrew/bin/ollama) ;;
    *) candidates+=(/usr/local/bin/ollama /usr/bin/ollama /snap/bin/ollama) ;;
  esac
  for c in ${candidates[@]+"${candidates[@]}"}; do
    if [ -x "$c" ]; then
      printf '%s\n' "$c"
      return 0
    fi
  done
}

install_ollama() {
  case "$OS" in
    windows)
      say "  Ollama for Windows can be installed with its official installer from ollama.com."
      if ask "Install Ollama now?"; then
        run powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; irm https://ollama.com/install.ps1 | iex' ||
          die "the Ollama installer failed (see above)." "Install Ollama from $OLLAMA_DOWNLOAD_URL, then run the installer again."
        return 0
      fi
      ;;
    macos)
      if has_brew; then
        if ask "Install Ollama with Homebrew (brew install ollama)?"; then
          run brew install ollama || die "Homebrew could not install Ollama." "Install it from $OLLAMA_DOWNLOAD_URL, then run the installer again."
          return 0
        fi
      else
        open_url "$OLLAMA_DOWNLOAD_URL"
        die "Ollama is needed for the language model." \
          "Install it from $OLLAMA_DOWNLOAD_URL (the page is open in your browser), open it once," \
          "then run the installer again. Or install Demify without a model: bash install.sh --no-model"
      fi
      ;;
    linux)
      say "  Ollama can be installed with its official script. It asks for your password (sudo)"
      say "  to install into /usr/local and to set up the service \"ollama\"."
      if ask "Install Ollama now (curl -fsSL https://ollama.com/install.sh | sh)?"; then
        run sh -c 'curl -fsSL https://ollama.com/install.sh | sh' ||
          die "the Ollama install script failed (see above)." "Install Ollama as described on $OLLAMA_DOWNLOAD_URL, then run the installer again."
        return 0
      fi
      ;;
    *) ;;
  esac
  die "Ollama is needed for the language model." \
    "Install it from $OLLAMA_DOWNLOAD_URL, then run the installer again." \
    "Or install Demify without a model: bash install.sh --no-model"
}

start_ollama() {
  local bin="$1"
  case "$OS" in
    windows)
      local dir app
      dir="$(dirname "$bin")"
      app="$dir/ollama app.exe"
      if [ -f "$app" ]; then
        run powershell.exe -NoProfile -Command "Start-Process -FilePath $(ps_quote "$(to_windows "$app")")" || true
      else
        run powershell.exe -NoProfile -Command "Start-Process -FilePath $(ps_quote "$(to_windows "$bin")") -ArgumentList serve -WindowStyle Hidden" || true
      fi
      ;;
    macos)
      if [ -d /Applications/Ollama.app ] || [ -d "$HOME/Applications/Ollama.app" ]; then
        run open -a Ollama || true
      elif has_brew && { [ "$DRY_RUN" = 1 ] || brew list --formula ollama >/dev/null 2>&1; }; then
        run brew services start ollama || true
      else
        start_ollama_serve "$bin"
      fi
      ;;
    *)
      if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files ollama.service 2>/dev/null | grep -q '^ollama\.service'; then
        if ask "Start the Ollama service now (sudo systemctl start ollama)?"; then
          run_root systemctl start ollama || true
        else
          die "Ollama is installed but not running." "Start it: sudo systemctl start ollama" "Then run the installer again."
        fi
      else
        start_ollama_serve "$bin"
      fi
      ;;
  esac
}

# "ollama serve" in the background, with its log in ~/.ollama/serve.log.
start_ollama_serve() {
  local bin="$1" log="$HOME/.ollama/serve.log"
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry run] nohup $(quote_args "$bin") serve >$log 2>&1 &"
    return 0
  fi
  mkdir -p "$HOME/.ollama"
  say "  Running: $(quote_args "$bin") serve (in the background, log: $log)"
  nohup "$bin" serve >"$log" 2>&1 &
}

wait_for_ollama() {
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry run] wait up to $OLLAMA_WAIT_S s until Ollama answers on $OLLAMA_URL"
    return 0
  fi
  local waited=0
  while [ "$waited" -lt "$OLLAMA_WAIT_S" ]; do
    if ollama_up; then return 0; fi
    sleep 2
    waited=$((waited + 2))
  done
  case "$OS" in
    linux) die "Ollama does not answer on $OLLAMA_URL." "Start it: sudo systemctl start ollama   (or: ollama serve)" "Then run the installer again." ;;
    *) die "Ollama does not answer on $OLLAMA_URL." "Start Ollama (Start menu or Applications), then run the installer again." ;;
  esac
}

OLLAMA_PATH=""
ensure_ollama() {
  step "Step 2 of 5: Ollama (runs the language model on this computer)"
  local state
  state="$(ollama_state)"
  OLLAMA_PATH="$(find_ollama)"
  if [ "$state" = running ]; then
    say "  Ollama answers on $OLLAMA_URL."
    return 0
  fi
  if [ "$state" = missing ]; then
    say "  Ollama is not installed."
    install_ollama
    OLLAMA_PATH="$(find_ollama)"
    if [ "$DRY_RUN" = 1 ]; then OLLAMA_PATH="${OLLAMA_PATH:-ollama}"; fi
    if [ "$DRY_RUN" = 0 ] && ollama_up; then
      say "  Ollama answers on $OLLAMA_URL."
      return 0
    fi
    [ -n "$OLLAMA_PATH" ] || die "Ollama was installed, but this shell cannot find it yet." \
      "Close this window, open a new one and run the installer again."
  fi
  say "  Ollama is installed but not running. Starting it."
  start_ollama "$OLLAMA_PATH"
  wait_for_ollama
  say "  Ollama answers on $OLLAMA_URL."
}

# --------------------------------------------------------------------------
# Step 4 helpers: port and .env
# --------------------------------------------------------------------------

# Does something answer on 127.0.0.1:PORT? (curl 7 = connection refused)
port_in_use() {
  local code=0
  curl -s -o /dev/null --noproxy '*' --max-time 5 "http://127.0.0.1:$1/" || code=$?
  [ "$code" != 7 ]
}

demify_container_running() {
  docker ps --filter 'name=^demify$' --format '{{.Names}}' 2>/dev/null | grep -qx demify
}

current_port() {
  local p="${DEMIFY_PORT:-$(env_file_value DEMIFY_PORT)}"
  printf '%s' "${p:-3000}"
}

ensure_env_file() {
  if [ ! -f .env ]; then
    run cp .env.example .env
    if [ "$DRY_RUN" = 0 ]; then chmod 600 .env; fi
  fi
}

# When another program uses Demify's port, offer the next free one.
check_port() {
  local port p
  port="$(current_port)"
  if fake_mode || demify_container_running || ! port_in_use "$port"; then return 0; fi
  if [ -n "${DEMIFY_PORT:-}" ]; then
    die "port $port (DEMIFY_PORT in your shell) is used by another program." \
      "Choose another port: DEMIFY_PORT=3001 bash install.sh"
  fi
  for p in $(seq $((port + 1)) $((port + 20))); do
    if ! port_in_use "$p"; then
      say "  Port $port is used by another program (often a development server)."
      if ask "Use port $p for Demify instead (sets DEMIFY_PORT=$p in .env)?"; then
        set_env_var DEMIFY_PORT "$p"
        return 0
      fi
      break
    fi
  done
  die "port $port is used by another program." \
    "Stop that program, or set another port in .env (for example DEMIFY_PORT=3001)," \
    "then run the installer again."
}

# Without a model: start Demify and wait for /api/health.
start_demify_without_model() {
  local port host base
  port="$(current_port)"
  host="${DEMIFY_BIND:-$(env_file_value DEMIFY_BIND)}"
  case "$host" in "" | 0.0.0.0 | "::" | "[::]") host="127.0.0.1" ;; esac
  base="http://$host:$port"
  if [ -n "$(env_file_value DEMIFY_MODEL_URL)" ]; then
    warn ".env still sets DEMIFY_MODEL_URL, so Demify keeps using that model. Delete that line in .env to turn the model off."
  fi
  say "  (the first build takes a few minutes; later runs reuse it)"
  run docker compose -f docker-compose.yml up -d --build ||
    die "docker compose could not build or start Demify." \
      "Behind a TLS-intercepting proxy the image build needs DEMIFY_BUILD_CA (docs/DEPLOYMENT.md, section 4)." \
      "Logs: docker compose -f docker-compose.yml logs demify"
  if [ "$DRY_RUN" = 1 ]; then
    say "  [dry run] wait up to $TIMEOUT s until $base/api/health answers"
    return 0
  fi
  local deadline
  deadline=$(($(date +%s) + TIMEOUT))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS --noproxy '*' --max-time 5 -o /dev/null "$base/api/health" 2>/dev/null; then
      say "  Demify answers on $base"
      return 0
    fi
    sleep 3
  done
  die "Demify did not answer on $base within $TIMEOUT s." \
    "Check: docker compose -f docker-compose.yml ps   and   docker compose -f docker-compose.yml logs demify"
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

TIMEOUT=240

main() {
  local model="" no_model=0 show_model=0 open_browser=1 no_test=0
  while [ $# -gt 0 ]; do
    case "$1" in
      -y | --yes) ASSUME_YES=1; shift ;;
      --model)
        [ $# -ge 2 ] || { usage >&2; exit 2; }
        model="$2"
        shift 2
        ;;
      --model=*) model="${1#--model=}"; shift ;;
      --no-model) no_model=1; shift ;;
      --show-model) show_model=1; shift ;;
      --dry-run) DRY_RUN=1; shift ;;
      --no-browser) open_browser=0; shift ;;
      --no-test) no_test=1; shift ;;
      --timeout)
        [ $# -ge 2 ] || { usage >&2; exit 2; }
        TIMEOUT="$2"
        shift 2
        ;;
      --timeout=*) TIMEOUT="${1#--timeout=}"; shift ;;
      -h | --help) usage; exit 0 ;;
      *)
        printf 'Unknown option: %s\n\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
  done
  if [ -n "$model" ] && ! printf '%s' "$model" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'; then
    printf 'Not a model name: %s\n' "$model" >&2
    exit 2
  fi
  if [ -n "$model" ] && [ "$no_model" = 1 ]; then
    printf -- '--model and --no-model do not go together.\n' >&2
    exit 2
  fi
  if ! printf '%s' "$TIMEOUT" | grep -Eq '^[0-9]+$'; then
    printf 'Not a number of seconds: %s\n' "$TIMEOUT" >&2
    exit 2
  fi

  cd "$INSTALL_ROOT"
  OS="$(detect_os)"
  if [ "$OS" = windows ]; then
    # Git Bash would turn arguments such as /c into paths for Windows programs.
    export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
  fi
  if [ "$OS" = linux ] && { [ "$(id -u 2>/dev/null || echo 1)" != 0 ] || fake_mode; }; then SUDO=sudo; fi

  # 3. (first, so --show-model needs nothing else) -----------------------------
  if [ "$show_model" = 1 ]; then
    say "Demify installer: the language model for this computer"
    detect_hardware_and_model
    say "  Model: $CHOSEN_MODEL"
    say "  Why:   $CHOSEN_REASON"
    say "  (bash install.sh --model <name> chooses another one; docs/LOCAL-MODEL.md section 1)"
    exit 0
  fi

  if fake_mode && [ "$DRY_RUN" = 0 ]; then
    say "Test settings (DEMIFY_INSTALL_FAKE_*) are set: this is a dry run, nothing is changed."
    DRY_RUN=1
  fi
  SETUP_DRY_RUN="$DRY_RUN" # for set_env_var from scripts/setup-local-model.sh

  say "Demify installer ($INSTALL_ROOT)"
  if [ "$DRY_RUN" = 1 ]; then say "Dry run: every command is printed, none is run."; fi
  if [ "$OS" = other ]; then
    die "this installer runs on macOS, Linux and Windows (Git Bash)." "On Windows PowerShell: powershell -ExecutionPolicy Bypass -File install.ps1"
  fi
  if [ "$OS" = linux ] && grep -qsi microsoft /proc/version && ! fake_mode; then
    warn "this is WSL. Ollama for Windows runs on Windows itself; the simplest way is Git Bash or PowerShell on Windows (docs/INSTALL.md). Continuing inside WSL."
  fi
  if [ -f .env ] && grep -Eq '^[[:space:]]*COMPOSE_FILE=.*spark' .env; then
    die "this .env belongs to the DGX Spark onboard server (COMPOSE_FILE=docker-compose.spark.yml)." \
      "The installer sets up the single-container Demify; the Spark setup is in docs/SPARK.md."
  fi
  command -v curl >/dev/null 2>&1 || die "curl is needed (macOS and Git Bash include it; Linux: install the package curl)."

  ensure_docker

  if [ "$no_model" = 1 ]; then
    step "Step 2 of 5: Ollama"
    say "  Skipped (--no-model)."
    step "Step 3 of 5: Language model"
    say "  Skipped (--no-model): the onboard assistant shows the matching library passages only."
  else
    ensure_ollama
    step "Step 3 of 5: Language model for this computer"
    detect_hardware_and_model
    if [ -n "$model" ]; then
      say "  Suggested for this computer: $CHOSEN_MODEL"
      CHOSEN_MODEL="$model"
      CHOSEN_REASON="chosen with --model."
    fi
    say "  Model: $CHOSEN_MODEL"
    say "  Why:   $CHOSEN_REASON"
    if is_dgx_spark "$(nvidia_gpus)"; then
      say "  This is an NVIDIA DGX Spark. The installer sets up the single-container Demify; the"
      say "  full onboard server (PostgreSQL, model server, sync) is described in docs/SPARK.md."
    fi
  fi

  step "Step 4 of 5: Starting Demify"
  ensure_env_file
  check_port
  if [ "$no_model" = 1 ]; then
    start_demify_without_model
  else
    local args=(--model "$CHOSEN_MODEL" --from-installer --timeout "$TIMEOUT")
    if [ -n "$OLLAMA_PATH" ] && [ "$OLLAMA_PATH" != ollama ]; then args+=(--ollama "$OLLAMA_PATH"); fi
    if [ "$no_test" = 1 ]; then args+=(--no-test); fi
    if [ "$DRY_RUN" = 1 ]; then args+=(--dry-run); fi
    say "  Running: bash scripts/setup-local-model.sh $(quote_args "${args[@]}")$([ "$DRY_RUN" = 0 ] || printf ' (prints its commands)')"
    bash scripts/setup-local-model.sh "${args[@]}" ||
      die "the model setup did not finish (see the message above)." "Fix that, then run the installer again: bash install.sh"
  fi

  # 5. Open ------------------------------------------------------------------------
  local port host url
  port="$(current_port)"
  host="${DEMIFY_BIND:-$(env_file_value DEMIFY_BIND)}"
  case "$host" in "" | 0.0.0.0 | "::" | "[::]" | 127.0.0.1) host="localhost" ;; esac
  url="http://$host:$port"
  step "Step 5 of 5: Demify is running"
  say "  Open: $url"
  if [ "$no_model" = 0 ]; then say "  Onboard assistant: $url/assistant (model $CHOSEN_MODEL)"; fi
  if [ "$open_browser" = 1 ]; then open_url "$url"; fi
  say ""
  say "  To stop Demify:        docker compose down        (in $INSTALL_ROOT)"
  say "  To start it again:     docker compose up -d"
  say "  To update:             git pull, then run the installer again: bash install.sh"
  if [ "$no_model" = 0 ]; then
    say "  To remove the model:   ollama rm $CHOSEN_MODEL"
  fi
  say "  Help: docs/INSTALL.md"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
