# Runs Demify as a production server (Next.js standalone) without changing
# Demify's code or config: everything is set through environment variables.
#   powershell -ExecutionPolicy Bypass -File start-demify-prod.ps1            (builds if needed, port 3000)
#   powershell -ExecutionPolicy Bypass -File start-demify-prod.ps1 -Rebuild   (after pulling new Demify code)
# Stop "npm run dev" first: both want port 3000. Ctrl+C stops this server.
param([switch]$Rebuild, [int]$Port = 3000)

$ErrorActionPreference = 'Continue'
$cfgDir = 'C:\Repos\NSAC\Demify---Health-Monitoring-Software-for-Astronauts'
$envFile = Join-Path $PSScriptRoot '.env'
if (Test-Path $envFile) {
  $line = Get-Content $envFile | Where-Object { $_ -match '^\s*DEMIFY_DIR\s*=\s*(.+)$' } | Select-Object -First 1
  if ($line -and $matches[1].Trim()) { $cfgDir = $matches[1].Trim() }
}
$repo = $cfgDir
$standalone = Join-Path $repo '.next\standalone'

if ($Rebuild -or -not (Test-Path (Join-Path $standalone 'server.js'))) {
  Write-Host "Building Demify (npm run build) in $repo ..." -ForegroundColor Cyan
  Push-Location -LiteralPath $repo
  cmd /c "npm run build"
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) { Write-Host 'Build failed.' -ForegroundColor Red; exit 1 }
}

# The standalone server needs the static assets and public files next to it.
Copy-Item -Recurse -Force (Join-Path $repo '.next\static') (Join-Path $standalone '.next\static')
Copy-Item -Recurse -Force (Join-Path $repo 'public') (Join-Path $standalone 'public')

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) { Write-Host "Port $Port is in use (is 'npm run dev' still running? Stop it first)." -ForegroundColor Red; exit 1 }

$env:PORT = "$Port"
$env:HOSTNAME = '127.0.0.1'
# Same crew data as the dev server (the standalone folder has its own copy otherwise).
$env:DEMIFY_DATA_DIR = Join-Path $repo 'data'
Write-Host "Demify production server on http://localhost:$Port (data: $env:DEMIFY_DATA_DIR). Ctrl+C stops." -ForegroundColor Cyan
Set-Location -LiteralPath $standalone
& node server.js
