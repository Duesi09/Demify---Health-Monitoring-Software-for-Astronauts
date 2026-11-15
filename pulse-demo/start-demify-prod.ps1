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

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) { Write-Host "Port $Port is in use (is 'npm run dev' still running? Stop it first)." -ForegroundColor Red; exit 1 }

# Rebuild when the code changed since the last build (git pull, branch switch), not only with -Rebuild:
# an old build would run without the newer features (for example the onboard assistant).
$head = (& git -C $repo rev-parse HEAD 2>$null)
$stamp = Join-Path $standalone '.demify-build-head'
$builtHead = ''
if (Test-Path $stamp) { $builtHead = "$(Get-Content -LiteralPath $stamp -Raw)".Trim() }
$stale = $head -and ($builtHead -ne $head)
if ($Rebuild -or $stale -or -not (Test-Path (Join-Path $standalone 'server.js'))) {
  Write-Host "Building Demify (npm run build) in $repo ..." -ForegroundColor Cyan
  Push-Location -LiteralPath $repo
  cmd /c "npm run build"
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) {
    if (-not $Rebuild -and (Test-Path (Join-Path $standalone 'server.js'))) {
      Write-Host 'Build failed: starting the previous build instead (without the newest changes).' -ForegroundColor Yellow
    } else {
      Write-Host 'Build failed.' -ForegroundColor Red; exit 1
    }
  } elseif ($head) { Set-Content -LiteralPath $stamp -Value $head }
}

# The standalone server needs the static assets and public files next to it.
Copy-Item -Recurse -Force (Join-Path $repo '.next\static') (Join-Path $standalone '.next\static')
Copy-Item -Recurse -Force (Join-Path $repo 'public') (Join-Path $standalone 'public')


# Onboard assistant: the local model in Ollama on this laptop (set up once in the Demify folder:
# powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1). Without Ollama the
# assistant shows library passages only; everything else, the phone pulse included, works the same.
function Select-LocalModel($names, $demifyDir) {
  # Ollama lists "gemma3" as "gemma3:latest"; Demify matches names without ":latest".
  $norm = @($names | ForEach-Object { $_ -replace ':latest$', '' })
  $wanted = @()
  $envPath = Join-Path $demifyDir '.env'
  if (Test-Path $envPath) {
    foreach ($line in (Get-Content -LiteralPath $envPath)) {
      if ($line -match '^\s*DEMIFY_LLM_MODEL\s*=\s*(.+)$') { $wanted += ($matches[1].Trim().Trim('"').Trim("'") -replace ':latest$', ''); break }
    }
  }
  $wanted += @('gemma3:4b', 'gemma3', 'gemma3:1b', 'gpt-oss:20b')
  foreach ($w in $wanted) { if ($w -and ($norm -contains $w)) { return $w } }
  return $null
}
$ollama = $null
try { $ollama = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3 -ErrorAction Stop } catch { $ollama = $null }
if ($ollama) {
  $names = @($ollama.models | ForEach-Object { $_.name })
  $llm = $env:DEMIFY_LLM_MODEL
  if (-not $llm) { $llm = Select-LocalModel $names $repo }
  if ($llm) {
    $env:DEMIFY_MODEL_URL = 'http://127.0.0.1:11434/v1'
    $env:DEMIFY_LLM_MODEL = $llm
    Write-Host "Assistant: local model $llm (Ollama)." -ForegroundColor Green
  } else {
    Write-Host 'Ollama runs but has no model: run scripts\setup-local-model.ps1 in the Demify folder.' -ForegroundColor Yellow
  }
} else {
  Write-Host 'Ollama not running: the assistant shows library passages only.' -ForegroundColor Yellow
}

$env:PORT = "$Port"
$env:HOSTNAME = '127.0.0.1'
# Same crew data as the dev server (the standalone folder has its own copy otherwise).
$env:DEMIFY_DATA_DIR = Join-Path $repo 'data'
Write-Host "Demify production server on http://localhost:$Port (data: $env:DEMIFY_DATA_DIR). Ctrl+C stops." -ForegroundColor Cyan
Set-Location -LiteralPath $standalone
& node server.js
