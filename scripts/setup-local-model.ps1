<#
.SYNOPSIS
  Demify: a local language model for the onboard assistant on this Windows
  machine (the pitch laptop). macOS, Linux and Git Bash:
  scripts/setup-local-model.sh. The installer (install.ps1 in the repository
  folder) installs Docker and Ollama first and then runs this.

.DESCRIPTION
  Safe to run again. It never asks for administrator rights and stores no
  secret.
    1. Checks that Ollama is installed and running, and that Docker runs.
    2. Shows the memory it finds and which model suits it (a hint only).
    3. Pulls the model into Ollama (the embedding model too with -WithEmbed).
    4. Sets DEMIFY_MODEL_URL and DEMIFY_LLM_MODEL in .env (creates .env from
       .env.example when it is missing; no other line is changed).
    5. docker compose -f docker-compose.yml up -d --build
    6. Waits until /api/onboard/status reports the model, then asks one test
       question.
  Without a model Demify works as before: the onboard assistant shows the
  matching library passages only. Guide: docs/LOCAL-MODEL.md.

.PARAMETER Model
  Ollama model to use (default gemma3:4b). gemma3:1b for machines with about
  8 GB of memory; gpt-oss:20b with an NVIDIA GPU with 16 GB or more.

.PARAMETER WithEmbed
  Also pull the embedding model (nomic-embed-text, about 0.3 GB). Only the
  onboard database uses it; the pitch setup (no database) searches the
  library by keywords.

.PARAMETER NoTest
  Do not ask the test question at the end.

.PARAMETER TimeoutSeconds
  How long to wait for Demify to report the model (default 240).

.PARAMETER OllamaExe
  Full path of ollama.exe, when it is not on PATH yet (a fresh install).

.PARAMETER DryRun
  Print the commands instead of running them.

.PARAMETER FromInstaller
  Used by install.ps1: no model hint and no closing summary.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1 -Model gemma3:1b
#>
[CmdletBinding()]
param(
  [string]$Model = 'gemma3:4b',
  [switch]$WithEmbed,
  [switch]$NoTest,
  [int]$TimeoutSeconds = 240,
  [string]$OllamaExe = '',
  [switch]$DryRun,
  [switch]$FromInstaller
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$DefaultEmbedModel = 'nomic-embed-text'
$OllamaUrl = 'http://127.0.0.1:11434'
# How the Demify container reaches Ollama on this machine (extra_hosts
# host.docker.internal:host-gateway in docker-compose.yml).
$ContainerModelUrl = 'http://host.docker.internal:11434/v1'
$TestQuestion = 'Where is the pulse oximeter in the medical kit?'
$EnvComment = '# Local language model (scripts/setup-local-model.sh or .ps1, docs/LOCAL-MODEL.md)'

# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

function Write-Step([string]$Text) {
  Write-Host ''
  Write-Host ('==> ' + $Text)
}

function Write-Info([string]$Text) {
  Write-Host ('  ' + $Text)
}

function Write-Note([string]$Text) {
  Write-Host ('Note: ' + $Text) -ForegroundColor Yellow
}

function Stop-Setup([string]$Reason, [string[]]$Lines = @()) {
  Write-Host ''
  Write-Host ('Stopped: ' + $Reason) -ForegroundColor Red
  foreach ($line in $Lines) { Write-Host ('  ' + $line) }
  exit 1
}

# ---------------------------------------------------------------------------
# HTTP on this machine, never through a proxy (Invoke-RestMethod in Windows
# PowerShell 5.1 would use the system proxy).
# ---------------------------------------------------------------------------

function Invoke-Local {
  param(
    [string]$Url,
    [string]$Method = 'GET',
    [string]$Body = '',
    [int]$TimeoutSec = 10
  )
  $request = [System.Net.WebRequest]::Create($Url)
  $request.Method = $Method
  $request.Proxy = $null
  $request.Timeout = $TimeoutSec * 1000
  $request.ReadWriteTimeout = $TimeoutSec * 1000
  if ($Body -ne '') {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Body)
    $request.ContentType = 'application/json'
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Close() }
  }
  $response = $request.GetResponse()
  try {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [System.Text.Encoding]::UTF8)
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
  } finally {
    $response.Close()
  }
}

# Runs a native command quietly and returns its exit code. Windows
# PowerShell 5.1 turns redirected stderr into errors, so errors are relaxed
# around the call.
function Invoke-Quiet([string]$Exe, [string[]]$Arguments) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $global:LASTEXITCODE = 1
  try { & $Exe @Arguments *> $null } catch { $global:LASTEXITCODE = 1 } finally { $ErrorActionPreference = $saved }
  return $global:LASTEXITCODE
}

# ---------------------------------------------------------------------------
# Ollama
# ---------------------------------------------------------------------------

function Test-OllamaUp {
  try {
    [void](Invoke-Local -Url ($OllamaUrl + '/api/version') -TimeoutSec 3)
    return $true
  } catch {
    return $false
  }
}

# "gemma3" and "gemma3:latest" are the same model.
function Get-FullName([string]$Name) {
  if ($Name.Contains(':')) { return $Name }
  return ('{0}:latest' -f $Name)
}

function Test-LocalModel([string]$Name) {
  $wanted = Get-FullName $Name
  try {
    $tags = Invoke-Local -Url ($OllamaUrl + '/api/tags') -TimeoutSec 10 | ConvertFrom-Json
    foreach ($m in @($tags.models)) {
      if ($m -and ([string]$m.name) -eq $wanted) { return $true }
    }
  } catch { }
  return $false
}

# The Ollama program: -OllamaExe, else the one on PATH, else empty.
function Get-OllamaCli {
  if ($OllamaExe -ne '' -and (Test-Path -LiteralPath $OllamaExe)) { return $OllamaExe }
  $cmd = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return [string]$cmd.Path }
  return ''
}

function Invoke-Pull([string]$Name) {
  $cli = Get-OllamaCli
  if ($DryRun) {
    $shown = 'ollama'
    if ($cli -ne '') { $shown = $cli }
    Write-Info ('[dry run] ' + $shown + ' pull ' + $Name)
    return
  }
  Write-Info ('ollama pull ' + $Name)
  $ok = $false
  if ($cli -ne '') {
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $cli pull $Name; $ok = ($LASTEXITCODE -eq 0) } catch { $ok = $false } finally { $ErrorActionPreference = $saved }
  } else {
    Write-Info '(Ollama CLI not on PATH: pulling through the Ollama API, no progress shown)'
    try {
      $body = @{ model = $Name; stream = $false } | ConvertTo-Json -Compress
      [void](Invoke-Local -Url ($OllamaUrl + '/api/pull') -Method 'POST' -Body $body -TimeoutSec 7200)
      $ok = $true
    } catch {
      $ok = $false
    }
  }
  if ($ok) { return }
  if (Test-LocalModel $Name) {
    Write-Note ('could not check ' + $Name + ' for updates (no connection?); using the copy already on this machine.')
    return
  }
  Stop-Setup ('could not pull ' + $Name + '.') @('Check the name on https://ollama.com/library and that this machine can reach the Ollama registry.')
}

# ---------------------------------------------------------------------------
# .env (the file docker compose reads in this folder)
# ---------------------------------------------------------------------------

# Last value of NAME=... in .env, without quotes or an inline comment.
function Get-EnvFileValue([string]$Name) {
  if (-not (Test-Path -LiteralPath $EnvPath)) { return '' }
  $value = ''
  $pattern = '^\s*' + [regex]::Escape($Name) + '=(.*)$'
  foreach ($line in [System.IO.File]::ReadAllLines($EnvPath)) {
    if ($line -match $pattern) { $value = $Matches[1] }
  }
  $value = ($value -replace '\s+#.*$', '').Trim()
  if ($value.Length -ge 2) {
    $first = $value.Substring(0, 1)
    $last = $value.Substring($value.Length - 1, 1)
    if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  return $value
}

# Sets NAME=VALUE in .env: replaces every active NAME= line, or appends one.
# Comments, all other lines and the line endings stay as they are. Written as
# UTF-8 without a byte order mark.
function Set-EnvVar([string]$Name, [string]$Value) {
  if ($DryRun) {
    $now = Get-EnvFileValue $Name
    if ($now -eq '') { $now = 'not set' }
    Write-Info ('[dry run] set ' + $Name + '=' + $Value + ' in .env (now: ' + $now + ')')
    return
  }
  $text = [System.IO.File]::ReadAllText($EnvPath)
  $cr = ''
  if ($text.Contains("`r`n")) { $cr = "`r" }
  $lines = New-Object System.Collections.ArrayList
  foreach ($l in ($text -split "`n")) { [void]$lines.Add($l) }
  $pattern = '^' + [regex]::Escape($Name) + '='
  $found = 0
  $same = 0
  for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = [string]$lines[$i]
    if ($line -match $pattern) {
      $found++
      $end = ''
      if ($line.EndsWith("`r")) { $end = "`r" }
      $new = $Name + '=' + $Value + $end
      if ($line -ceq $new) { $same++ } else { $lines[$i] = $new }
    }
  }
  if ($found -gt 0 -and $found -eq $same) {
    Write-Info ($Name + '=' + $Value + ' (unchanged)')
    return
  }
  $how = 'updated'
  if ($found -eq 0) {
    $how = 'added'
    $add = New-Object System.Collections.ArrayList
    if (-not $text.Contains($EnvComment)) {
      [void]$add.Add($cr)
      [void]$add.Add($EnvComment + $cr)
    }
    [void]$add.Add($Name + '=' + $Value + $cr)
    $last = $lines.Count - 1
    if ($last -ge 0 -and [string]$lines[$last] -eq '') {
      # The file ends with a newline: insert before the empty last element.
      $lines.InsertRange($last, $add)
    } else {
      # No newline at the end: append, then end the file with one.
      $lines.AddRange($add)
      [void]$lines.Add('')
    }
  }
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($EnvPath, ($lines -join "`n"), $utf8)
  Write-Info ($Name + '=' + $Value + ' (' + $how + ')')
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if ($Model -notmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]*$') {
  Write-Host ('Not a model name: ' + $Model) -ForegroundColor Red
  exit 2
}
if ($TimeoutSeconds -lt 1) {
  Write-Host 'TimeoutSeconds must be 1 or more.' -ForegroundColor Red
  exit 2
}

$Root = Split-Path -Parent $PSScriptRoot
$EnvPath = Join-Path $Root '.env'
$EnvExamplePath = Join-Path $Root '.env.example'
if (-not (Test-Path -LiteralPath (Join-Path $Root 'docker-compose.yml')) -or -not (Test-Path -LiteralPath $EnvExamplePath)) {
  Stop-Setup ('run this script from the Demify repository (docker-compose.yml not found in ' + $Root + ').')
}

Push-Location -LiteralPath $Root
try {
  # 1. Prerequisites ---------------------------------------------------------
  Write-Step 'Checking Ollama and Docker'
  if ($DryRun) {
    Write-Info ('[dry run] check that Ollama answers on ' + $OllamaUrl + ', docker info, docker compose version')
  } else {
    if (-not (Test-OllamaUp)) {
      if ((Get-OllamaCli) -ne '') {
        Stop-Setup 'Ollama is installed but not running.' @('Start Ollama from the Start menu (or run: ollama serve), then run this script again.')
      }
      Stop-Setup ('Ollama is not installed (nothing answers on ' + $OllamaUrl + ').') @(
        'Install it from https://ollama.com/download, start it, then run this script again.',
        'Or let the installer do it: powershell -ExecutionPolicy Bypass -File install.ps1'
      )
    }
    Write-Info ('Ollama answers on ' + $OllamaUrl)
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
      Stop-Setup 'Docker is not installed.' @('Install Docker Desktop (WSL 2 backend), see docs/INSTALL.md.')
    }
    if ((Invoke-Quiet 'docker' @('info')) -ne 0) {
      Stop-Setup 'Docker is not running.' @('Start Docker Desktop, wait until it says it is running, then run this script again.')
    }
    if ((Invoke-Quiet 'docker' @('compose', 'version')) -ne 0) {
      Stop-Setup 'Docker Compose v2 is needed (docker compose version).'
    }
    Write-Info 'Docker runs'
  }

  if ((Test-Path -LiteralPath $EnvPath) -and ((Get-EnvFileValue 'COMPOSE_FILE') -match 'spark')) {
    Stop-Setup 'this .env belongs to the DGX Spark setup (COMPOSE_FILE=docker-compose.spark.yml).' @('This script sets up the pitch laptop with docker-compose.yml; the Spark runs its own model server (docs/SPARK.md).')
  }

  # 2. Model hint (the installer has already chosen the model) ---------------
  if (-not $FromInstaller) {
    Write-Step 'Choosing the model'
    $memMiB = 0
    try {
      $computer = Get-CimInstance -ClassName Win32_ComputerSystem
      $memMiB = [int][math]::Floor(([double]$computer.TotalPhysicalMemory) / 1MB)
    } catch {
      $memMiB = 0
    }
    $gpu = ''
    $gpuMiB = 0
    if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
      $saved = $ErrorActionPreference
      $ErrorActionPreference = 'Continue'
      try {
        # Quoted: an unquoted comma would split the argument into two.
        $gpu = [string](& nvidia-smi '--query-gpu=name,memory.total' '--format=csv,noheader,nounits' | Select-Object -First 1)
        $gpuMiB = [int](($gpu -split ',')[-1].Trim())
      } catch {
        $gpuMiB = 0
      } finally {
        $ErrorActionPreference = $saved
      }
    }
    if ($memMiB -gt 0) { Write-Info ('Memory: ' + [math]::Round($memMiB / 1024) + ' GB') } else { Write-Info 'Memory: unknown' }
    if ($gpu) { Write-Info ('NVIDIA GPU: ' + $gpu + ' MiB') }
    if ($memMiB -gt 0 -and $memMiB -le 8704) {
      Write-Info 'Hint: about 8 GB of memory or less. gemma3:1b (about 0.8 GB) leaves room for Docker and the browser:'
      Write-Info '      powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1 -Model gemma3:1b'
    } elseif ($gpuMiB -ge 15000) {
      Write-Info ('Hint: NVIDIA GPU with ' + [math]::Round($gpuMiB / 1024) + ' GB. gemma3:4b runs well; gpt-oss:20b (about 14 GB) is an option:')
      Write-Info '      powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1 -Model gpt-oss:20b'
    } else {
      Write-Info 'Hint: gemma3:4b (about 3.3 GB) suits this machine.'
    }
    Write-Info ('Using: ' + $Model)
  }

  # 3. Pull ----------------------------------------------------------------------
  Write-Step 'Pulling the model into Ollama'
  Invoke-Pull $Model
  $embedModel = [string][Environment]::GetEnvironmentVariable('DEMIFY_EMBED_MODEL')
  if ($embedModel -eq '') { $embedModel = Get-EnvFileValue 'DEMIFY_EMBED_MODEL' }
  if ($embedModel -eq '') { $embedModel = $DefaultEmbedModel }
  if ($WithEmbed) {
    Invoke-Pull $embedModel
  }

  # 4. .env --------------------------------------------------------------------
  Write-Step 'Writing the model settings to .env'
  if (-not (Test-Path -LiteralPath $EnvPath)) {
    if ($DryRun) {
      Write-Info '[dry run] copy .env.example .env'
    } else {
      Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvPath
      Write-Info 'Created .env from .env.example'
    }
  }
  Set-EnvVar 'DEMIFY_MODEL_URL' $ContainerModelUrl
  Set-EnvVar 'DEMIFY_LLM_MODEL' $Model

  # 5. Start Demify ----------------------------------------------------------------
  $port = [string][Environment]::GetEnvironmentVariable('DEMIFY_PORT')
  if ($port -eq '') { $port = Get-EnvFileValue 'DEMIFY_PORT' }
  if ($port -eq '') { $port = '3000' }
  $bindHost = [string][Environment]::GetEnvironmentVariable('DEMIFY_BIND')
  if ($bindHost -eq '') { $bindHost = Get-EnvFileValue 'DEMIFY_BIND' }
  if ($bindHost -eq '' -or $bindHost -eq '0.0.0.0' -or $bindHost -eq '::' -or $bindHost -eq '[::]') { $bindHost = '127.0.0.1' }
  $base = 'http://' + $bindHost + ':' + $port
  Write-Step 'Starting Demify (docker compose -f docker-compose.yml up -d --build)'
  if ($DryRun) {
    Write-Info '[dry run] docker compose -f docker-compose.yml up -d --build'
    Write-Info ('[dry run] wait up to ' + $TimeoutSeconds + ' s until ' + $base + '/api/onboard/status reports ' + $Model)
    if (-not $NoTest) { Write-Info ('[dry run] ask the test question: POST ' + $base + '/api/assistant') }
    exit 0
  }
  Write-Info '(the first build takes a few minutes; later runs reuse it)'
  # docker compose prefers variables of this shell over .env: hide them for
  # this call and put them back afterwards.
  $shellValues = @{}
  foreach ($name in @('DEMIFY_MODEL_URL', 'DEMIFY_LLM_MODEL')) {
    $current = [Environment]::GetEnvironmentVariable($name, 'Process')
    if ($current) {
      Write-Note ($name + ' is set in this PowerShell window (' + $current + '); it is ignored for this run. Remove it before you run docker compose yourself.')
      $shellValues[$name] = $current
      [Environment]::SetEnvironmentVariable($name, $null, 'Process')
    }
  }
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $composeExit = 1
  try {
    & docker compose -f docker-compose.yml up -d --build
    $composeExit = $LASTEXITCODE
  } catch {
    $composeExit = 1
  } finally {
    $ErrorActionPreference = $saved
    foreach ($name in $shellValues.Keys) { [Environment]::SetEnvironmentVariable($name, $shellValues[$name], 'Process') }
  }
  if ($composeExit -ne 0) {
    Stop-Setup 'docker compose could not build or start Demify.' @(
      ('Port ' + $port + ' in use by another program? Set DEMIFY_PORT=3001 (or another free port) in .env and run this again.'),
      'Behind a TLS-intercepting proxy the image build needs DEMIFY_BUILD_CA (docs/DEPLOYMENT.md, section 4).',
      'Logs: docker compose -f docker-compose.yml logs demify'
    )
  }

  # 6. Wait for the model ------------------------------------------------------------
  Write-Step ('Waiting for Demify to report the model (' + $base + '/api/onboard/status, up to ' + $TimeoutSeconds + ' s)')
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $state = ''
  $last = '-'
  $ok = 0
  $wanted = Get-FullName $Model
  while ((Get-Date) -lt $deadline) {
    $state = ''
    $available = @()
    try {
      $status = Invoke-Local -Url ($base + '/api/onboard/status') -TimeoutSec 10 | ConvertFrom-Json
      if ($status -and $status.PSObject.Properties['model']) {
        $state = [string]$status.model.state
        $available = @($status.model.available | ForEach-Object { Get-FullName ([string]$_) })
      }
    } catch {
      $state = ''
    }
    if ($state -eq 'ready') {
      $ok = 1
    } elseif ($state -eq 'missing-models' -and ($available -contains $wanted)) {
      # The language model is there; only the embedding model is missing.
      $ok = 2
    }
    if ($ok -ne 0) { break }
    if ($state -ne $last) {
      if ($state -eq '') { Write-Info 'model state: no answer yet' } else { Write-Info ('model state: ' + $state) }
      $last = $state
    }
    Start-Sleep -Seconds 3
  }
  if ($ok -eq 0) {
    switch ($state) {
      '' {
        Stop-Setup ('Demify did not answer on ' + $base + ' within ' + $TimeoutSeconds + ' s.') @('Check: docker compose -f docker-compose.yml ps   and   docker compose -f docker-compose.yml logs demify')
      }
      'not-configured' {
        Stop-Setup 'the Demify container has no DEMIFY_MODEL_URL.' @('Check that .env in ' + $Root + ' has DEMIFY_MODEL_URL=' + $ContainerModelUrl + ' and run this script again.')
      }
      'unreachable' {
        Stop-Setup 'the Demify container cannot reach Ollama at host.docker.internal:11434.' @('Is Ollama still running? Then: docker compose -f docker-compose.yml restart demify')
      }
      default {
        Stop-Setup ('Ollama does not list ' + $Model + ' (state: ' + $state + ').') @('Check with: ollama list')
      }
    }
  }
  if ($ok -eq 2) {
    Write-Info ($Model + ' is ready (the embedding model ' + $embedModel + ' is only needed with the onboard database)')
  } else {
    Write-Info ($Model + ' is ready')
  }

  # 7. Test question ---------------------------------------------------------------
  if (-not $NoTest) {
    Write-Step ('Asking a test question: "' + $TestQuestion + '"')
    Write-Info '(the first answer also loads the model into memory; on a laptop without a GPU this can take a minute)'
    $started = Get-Date
    $answerStatus = ''
    $reason = ''
    try {
      $body = @{ question = $TestQuestion } | ConvertTo-Json -Compress
      $answer = Invoke-Local -Url ($base + '/api/assistant') -Method 'POST' -Body $body -TimeoutSec 200 | ConvertFrom-Json
      if ($answer.PSObject.Properties['status']) { $answerStatus = [string]$answer.status }
      if ($answer.PSObject.Properties['reason']) { $reason = [string]$answer.reason }
    } catch {
      $answerStatus = ''
    }
    $seconds = [int]((Get-Date) - $started).TotalSeconds
    if ($answerStatus -eq '') { $shown = 'no answer' } else { $shown = $answerStatus }
    Write-Info ('status: ' + $shown + ' after ' + $seconds + ' s')
    switch ($answerStatus) {
      'answered' { Write-Info 'The model wrote the answer from the cited library passages.' }
      'passages-only' {
        Write-Info ('The assistant showed the library passages instead of a model answer: ' + $reason)
        Write-Info 'If the model was too slow, set DEMIFY_LLM_TIMEOUT_MS=180000 in .env and run this script again,'
        Write-Info 'or use a smaller model (-Model gemma3:1b).'
      }
      '' { Write-Note ('no answer from POST /api/assistant; open ' + $base + '/assistant and ask there.') }
      default { Write-Info $reason }
    }
  }

  if (-not $FromInstaller) {
    Write-Step 'Done'
    Write-Info ('Open ' + $base + '/assistant and ask a question. The answer names the model and cites its passages.')
    Write-Info 'Switch the model: powershell -ExecutionPolicy Bypass -File scripts\setup-local-model.ps1 -Model <name>'
    Write-Info 'Back to no model: delete the DEMIFY_MODEL_URL line in .env, then docker compose -f docker-compose.yml up -d'
  }
} finally {
  Pop-Location
}
exit 0
