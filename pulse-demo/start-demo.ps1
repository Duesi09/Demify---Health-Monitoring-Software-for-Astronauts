# Starts the Demify pulse demo: Docker broker, checks Demify, then gateway + bridge.
#   powershell -ExecutionPolicy Bypass -File start-demo.ps1
# Stop: Ctrl+C in this window, then stop-demo.ps1
# Camera pulse estimate for a demo, not a medical measurement.
#
# Robust on a busy laptop: every call that can hang (docker, Windows
# management/WMI-based network cmdlets) runs with a time limit, so this script
# never freezes; it warns and carries on, or stops with a clear message.

# 'Continue': Windows PowerShell 5.1 would treat any stderr line of docker
# (compose writes progress there) as a fatal error under 'Stop'.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot

function Say($text, $color = 'Gray') { Write-Host $text -ForegroundColor $color }
function Ok($text) { Say "  OK    $text" 'Green' }
function Warn($text) { Say "  WARN  $text" 'Yellow' }
function Fail($text) { Say "  FAIL  $text" 'Red' }

# Runs a cmd.exe command line hidden, with a time limit. Returns the exit code, or -1 on timeout.
function Invoke-Limited([string]$commandLine, [int]$seconds) {
  $p = Start-Process -FilePath cmd.exe -ArgumentList '/c', $commandLine -WindowStyle Hidden -PassThru
  $null = $p.Handle # PS 5.1: cache the handle, else ExitCode stays empty
  if (-not $p.WaitForExit($seconds * 1000)) {
    try { & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null } catch {}
    return -1
  }
  return $p.ExitCode
}

# True when something listens on the TCP port (netstat: no WMI involved).
function Test-Listening([int]$port) {
  [bool](netstat -ano -p tcp | Select-String -Pattern ("^\s*TCP\s+\S+:{0}\s+\S+\s+LISTENING" -f $port))
}

# Settings from .env (DEMIFY_URL, CREW_ID, DEMIFY_DIR)
$envFile = Join-Path $PSScriptRoot '.env'
$cfg = @{ DEMIFY_URL = 'http://127.0.0.1:3000'; CREW_ID = 'test'; PORT = '8443'; DEMIFY_DIR = 'C:\Repos\NSAC\Demify---Health-Monitoring-Software-for-Astronauts' }
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)$' -and $matches[2] -ne '') { $cfg[$matches[1]] = $matches[2].Trim() }
  }
}

Say ''
Say '=== Demify pulse demo: start ===' 'Cyan'

# 1. Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Node.js not found. Install Node 24 LTS.'; exit 1 }
Ok "Node $(node -v)"

# 2. Port 8443 free? (early: nothing else is worth starting if the gateway is already running)
if (Test-Listening ([int]$cfg.PORT)) {
  Fail "Port $($cfg.PORT) is already in use: the gateway is probably already running in another window. Run stop-demo.ps1 first."
  exit 1
}

# 3. Docker engine (start Docker Desktop if needed)
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $dockerBin = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
  if (-not (Test-Path $dockerBin)) { $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin' }
  $env:Path = "$env:Path;$dockerBin"
}
function DockerUp { (Invoke-Limited 'docker info --format {{.ServerVersion}} >nul 2>nul' 15) -eq 0 }
if (-not (DockerUp)) {
  $desktop = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\frontend\Docker Desktop.exe'),
    'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($desktop) {
    Warn 'Docker engine not running or not answering: starting Docker Desktop (up to 2 minutes)...'
    Start-Process -FilePath $desktop | Out-Null
    $deadline = (Get-Date).AddSeconds(120)
    while (-not (DockerUp) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 3; Write-Host -NoNewline '.' }
    Write-Host ''
  }
  if (-not (DockerUp)) {
    Fail 'Docker engine is not answering. Open Docker Desktop, wait for "Engine running" (or Troubleshoot > Restart), then run this again.'
    exit 1
  }
}
Ok 'Docker engine running'

# 4. Broker
if (-not (Test-Listening 1883)) {
  $code = Invoke-Limited 'docker compose -f docker-compose.broker.yml up -d >nul 2>nul' 60
  if ($code -ne 0) { Fail "Could not start the Mosquitto container (docker compose up: $(if ($code -eq -1) { 'timed out' } else { "exit $code" }))."; exit 1 }
}
$brokerOk = $false
for ($i = 0; $i -lt 20; $i++) {
  $tcp = New-Object Net.Sockets.TcpClient
  try { $tcp.Connect('127.0.0.1', 1883); $brokerOk = $true } catch { Start-Sleep -Milliseconds 500 } finally { $tcp.Close() }
  if ($brokerOk) { break }
}
if (-not $brokerOk) { Fail 'Broker not reachable on 127.0.0.1:1883 (docker logs demify-mosquitto).'; exit 1 }
Ok 'MQTT broker on 127.0.0.1:1883'

# 5. Demify (and the right branch)
$branch = (& git -C $cfg.DEMIFY_DIR branch --show-current 2>$null)
if ($branch -and $branch -notin @('presentation', 'OG-Presentation')) {
  Warn "Demify is on branch '$branch', not 'OG-Presentation': the Test Crew (phone) member is missing there. In the Demify folder: git switch OG-Presentation, then restart npm run dev."
}
function DemifyHealth {
  try { return (Invoke-RestMethod -Uri "$($cfg.DEMIFY_URL)/api/health" -TimeoutSec 5 -ErrorAction Stop) } catch { return $null }
}
# Onboard assistant: the local model in Ollama on this laptop (set up once in the Demify folder:
# powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1). Demify started by this
# script gets the model settings; without Ollama the assistant shows library passages only.
$modelEnv = ''
$ollama = $null
try { $ollama = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 -ErrorAction Stop } catch { $ollama = $null }
if ($ollama) {
  $names = @($ollama.models | ForEach-Object { $_.name })
  $llm = @('gemma3:4b', 'gemma3:1b', 'gpt-oss:20b') | Where-Object { $names -contains $_ } | Select-Object -First 1
  if ($llm) {
    $modelEnv = "`$env:DEMIFY_MODEL_URL = 'http://127.0.0.1:11434/v1'; `$env:DEMIFY_LLM_MODEL = '$llm'; "
    Ok "Ollama with model $llm (assistant answers with the local model)"
  } else {
    Warn 'Ollama runs but has no model: in the Demify folder run scripts\setup-local-model.ps1 (assistant shows passages only until then).'
  }
} else {
  Warn 'Ollama not running: the assistant shows library passages only (start Ollama for model answers).'
}

$health = DemifyHealth
if (-not $health) {
  if (Test-Path (Join-Path $cfg.DEMIFY_DIR 'package.json')) {
    Warn "Demify not running: starting it in a new window ($($cfg.DEMIFY_DIR), npm run dev)..."
    $devCmd = "`$host.UI.RawUI.WindowTitle = 'Demify (npm run dev)'; $($modelEnv)Set-Location -LiteralPath '$($cfg.DEMIFY_DIR)'; npm run dev"
    Start-Process powershell -ArgumentList '-NoExit', '-Command', $devCmd
    $deadline = (Get-Date).AddSeconds(90)
    while (-not $health -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 2; $health = DemifyHealth }
  }
  if (-not $health) {
    Fail "Demify not reachable at $($cfg.DEMIFY_URL). Start it: cd '$($cfg.DEMIFY_DIR)'; npm run dev"
    exit 1
  }
}
Ok "Demify at $($cfg.DEMIFY_URL) (status $($health.status))"
try {
  $onboard = Invoke-RestMethod -Uri "$($cfg.DEMIFY_URL)/api/onboard/status" -TimeoutSec 10 -ErrorAction Stop
  $m = $onboard.model
  if ($m.state -eq 'not-configured') {
    Warn 'Assistant: no model configured in this Demify (it was started without the model settings). Stop it and run this script again, or set DEMIFY_MODEL_URL / DEMIFY_LLM_MODEL in the Demify .env.'
  } elseif ($m.state -eq 'unreachable') {
    Warn "Assistant: model server not reachable ($($m.url)). Is Ollama running?"
  } elseif ($m.available -contains $m.llm) {
    Ok "Assistant: model $($m.llm) ready"
  } else {
    Warn "Assistant: model $($m.llm) not in Ollama. In the Demify folder: scripts\setup-local-model.ps1"
  }
} catch { Warn 'Assistant status not readable (older Demify build?).' }
try {
  $live = Invoke-RestMethod -Uri "$($cfg.DEMIFY_URL)/api/vitals/live?crewId=$($cfg.CREW_ID)" -TimeoutSec 15 -ErrorAction Stop
  if ($live.scenario) { Warn "A DRILL is running for $($cfg.CREW_ID): Demify ignores sensor data during drills. End the drill first." }
  else { Ok "No drill running for $($cfg.CREW_ID) (heart rate now $(if ($null -eq $live.hr) { '--' } else { $live.hr }), source $($live.source))" }
} catch { Warn "Could not read the live monitor for '$($cfg.CREW_ID)' (still compiling, or the crew member does not exist on this branch)." }

# 6. Wi-Fi hint (network cmdlets use WMI, which can hang: run with a time limit)
$job = Start-Job -ScriptBlock {
  $wifi = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -match 'WLAN|Wi-Fi|Wireless' -and $_.IPAddress -notlike '169.254*' } | Select-Object -First 1
  if (-not $wifi) { return $null }
  $p = Get-NetConnectionProfile -InterfaceAlias $wifi.InterfaceAlias -ErrorAction SilentlyContinue
  [pscustomobject]@{ Ip = $wifi.IPAddress; Name = $p.Name; Category = "$($p.NetworkCategory)" }
}
if (Wait-Job $job -Timeout 10) {
  $w = Receive-Job $job
  if ($w) {
    Ok "Wi-Fi $($w.Ip) on '$($w.Name)' ($($w.Category))"
    if ($w.Category -and $w.Category -ne 'Private') { Warn 'Network profile is not Private: run network-setup.ps1 (the firewall rule for 8443 only applies to Private networks).' }
  } else {
    Warn 'No Wi-Fi address: connect the laptop to the phone hotspot.'
  }
} else {
  Warn 'Wi-Fi check skipped (Windows network service is slow to answer).'
}
Remove-Job $job -Force -ErrorAction SilentlyContinue

Say ''
Say "Monitor on the laptop: $($cfg.DEMIFY_URL -replace '127.0.0.1','localhost')/crew/$($cfg.CREW_ID)" 'Cyan'
Say 'Starting gateway + bridge. The phone link is printed below (line with >>). Ctrl+C stops.' 'Cyan'
Say ''
$host.UI.RawUI.WindowTitle = 'Demify pulse demo (gateway + bridge)'
& node start.mjs
