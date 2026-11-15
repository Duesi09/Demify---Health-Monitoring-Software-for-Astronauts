# Stops the Demify pulse demo: gateway + bridge and the Mosquitto container.
#   powershell -ExecutionPolicy Bypass -File stop-demo.ps1
# (Ctrl+C in the start-demo window stops gateway + bridge too.)
# Demify itself and Docker Desktop are left running.
#
# No WMI (it can hang on a busy laptop): processes are found through the PID
# file start.mjs writes and through netstat; docker runs with a time limit.

Set-Location -LiteralPath $PSScriptRoot
Write-Host '=== Demify pulse demo: stop ===' -ForegroundColor Cyan

$port = 8443
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)' } | Select-Object -First 1
  if ($line) { $port = [int]$matches[1] }
}

# 1. Supervisor (start.mjs) with its children, by its PID file.
$stopped = 0
$pidFile = Join-Path $PSScriptRoot '.start.pid'
if (Test-Path $pidFile) {
  $id = (Get-Content $pidFile -Raw).Trim()
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') {
    & taskkill.exe /PID $id /T /F 2>$null | Out-Null
    $stopped++
  }
  Remove-Item $pidFile -ErrorAction SilentlyContinue
}

# 2. Anything still listening on the gateway port, if it is node (e.g. started by hand).
$lines = netstat -ano -p tcp | Select-String -Pattern ("^\s*TCP\s+\S+:{0}\s+\S+\s+LISTENING\s+(\d+)" -f $port)
foreach ($l in $lines) {
  $id = $l.Matches[0].Groups[1].Value
  $proc = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') {
    & taskkill.exe /PID $id /T /F 2>$null | Out-Null
    $stopped++
  }
}
Write-Host "  stopped $stopped gateway/bridge process group(s)"

# 3. Broker container (time-limited: docker can hang when Docker Desktop is stuck).
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  $env:Path = "$env:Path;$(Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin')"
}
$p = Start-Process -FilePath cmd.exe -ArgumentList '/c', 'docker compose -f docker-compose.broker.yml down >nul 2>nul' -WindowStyle Hidden -PassThru
  $null = $p.Handle # PS 5.1: cache the handle, else ExitCode stays empty
if (-not $p.WaitForExit(45000)) {
  & taskkill.exe /PID $p.Id /T /F 2>$null | Out-Null
  Write-Host '  broker: docker did not answer within 45 s (Docker Desktop stuck?); container left as is' -ForegroundColor Yellow
} elseif ($p.ExitCode -eq 0) {
  Write-Host '  broker container removed'
} else {
  Write-Host '  broker: docker not reachable (already stopped?)' -ForegroundColor Yellow
}
Write-Host 'Done. Demify and Docker Desktop are still running.'
