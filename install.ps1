<#
.SYNOPSIS
  Demify installer for Windows (PowerShell 5.1 or later). macOS, Linux and
  Git Bash: install.sh. Guide for everyone: docs/INSTALL.md

.DESCRIPTION
  Safe to run again. It asks before it installs anything.
    1. Docker Desktop: installed, running, with Compose v2 (offers winget).
    2. Ollama: installed and answering on 127.0.0.1:11434 (offers the
       official installer from ollama.com).
    3. The language model for this computer (docs/LOCAL-MODEL.md, section 1):
       NVIDIA DGX Spark (GB10) or an NVIDIA GPU with 16 GB or more:
       gpt-oss:20b; 8.5 GB of memory or less: gemma3:1b; otherwise gemma3:4b.
    4. scripts\setup-local-model.ps1: pulls the model, writes .env, runs
       docker compose up -d --build, waits for Demify, asks a test question.
    5. Opens Demify in the browser.

  Test hooks (dry run only; they never change this computer):
  DEMIFY_INSTALL_FAKE_RAM_GB, DEMIFY_INSTALL_FAKE_GPU_GB,
  DEMIFY_INSTALL_FAKE_GPU_NAME, DEMIFY_INSTALL_FAKE_ARCH, DEMIFY_INSTALL_FAKE_OS,
  DEMIFY_INSTALL_FAKE_DOCKER (missing, stopped, running),
  DEMIFY_INSTALL_FAKE_OLLAMA (missing, stopped, running),
  DEMIFY_INSTALL_FAKE_WINGET (1 or 0).

.PARAMETER Yes
  Answer yes to every question (unattended install).

.PARAMETER Model
  Use this Ollama model instead of the one for this computer.

.PARAMETER NoModel
  Install Demify without a language model (no Ollama).

.PARAMETER ShowModel
  Show the hardware and the model the installer would pick, then stop.

.PARAMETER DryRun
  Print every command instead of running it.

.PARAMETER NoBrowser
  Do not open the browser at the end.

.PARAMETER NoTest
  Do not ask the test question at the end.

.PARAMETER TimeoutSeconds
  How long to wait for Demify to start (default 240).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File install.ps1 -Model gemma3:1b
#>
[CmdletBinding()]
param(
  [switch]$Yes,
  [string]$Model = '',
  [switch]$NoModel,
  [switch]$ShowModel,
  [switch]$DryRun,
  [switch]$NoBrowser,
  [switch]$NoTest,
  [int]$TimeoutSeconds = 240
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

$OllamaUrl = 'http://127.0.0.1:11434'
$DockerUrl = 'https://www.docker.com/products/docker-desktop/'
$OllamaDownloadUrl = 'https://ollama.com/download'
$DockerWaitSeconds = 180
$OllamaWaitSeconds = 60
$Root = $PSScriptRoot
$EnvPath = Join-Path $Root '.env'
$EnvExamplePath = Join-Path $Root '.env.example'
$FakeNames = @('OS', 'ARCH', 'RAM_GB', 'GPU_GB', 'GPU_NAME', 'DOCKER', 'OLLAMA', 'WINGET')

# Results of the hardware check and the model choice.
$script:MemMiB = 0
$script:GpuMiB = 0
$script:GpuText = ''
$script:IsSpark = $false
$script:IsApple = $false
$script:Arch = ''
$script:ChosenModel = ''
$script:ChosenReason = ''
$script:OllamaPath = ''

# ---------------------------------------------------------------------------
# Output, questions, commands
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

function Stop-Install([string]$Reason, [string[]]$Lines = @()) {
  Write-Host ''
  Write-Host ('Stopped: ' + $Reason) -ForegroundColor Red
  foreach ($line in $Lines) { Write-Host ('  ' + $line) }
  exit 1
}

# Value of a test hook DEMIFY_INSTALL_FAKE_<Name> ('' when not set).
function Get-Fake([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable('DEMIFY_INSTALL_FAKE_' + $Name)
  if ($null -eq $value) { return '' }
  return [string]$value
}

function Test-FakeMode {
  foreach ($name in $FakeNames) {
    if ((Get-Fake $name) -ne '') { return $true }
  }
  return $false
}

# Asks a yes/no question; Enter means yes.
function Confirm-Step([string]$Question) {
  if ($Yes) {
    Write-Info ($Question + ' yes (-Yes)')
    return $true
  }
  if ($DryRun) {
    Write-Info ($Question + ' [dry run: answered yes]')
    return $true
  }
  $interactive = [Environment]::UserInteractive
  try { if ([Console]::IsInputRedirected) { $interactive = $false } } catch { }
  if (-not $interactive) {
    Write-Info ($Question + ' No console to ask in; run the installer with -Yes to answer yes.')
    return $false
  }
  $reply = Read-Host ('  ' + $Question + ' [Y/n]')
  if ($null -eq $reply) { $reply = '' }
  $reply = $reply.Trim().ToLowerInvariant()
  return (($reply -eq '') -or ($reply -eq 'y') -or ($reply -eq 'yes') -or ($reply -eq 'j') -or ($reply -eq 'ja'))
}

# Prints the command, then runs the script block (in a dry run it only
# prints it). Returns $true when it worked. The names are unusual on purpose:
# the block sees the variables of the function that calls this one.
function Invoke-Step([string]$StepDisplay, [scriptblock]$StepAction) {
  if ($DryRun) {
    Write-Info ('[dry run] ' + $StepDisplay)
    return $true
  }
  Write-Info ('Running: ' + $StepDisplay)
  $stepSaved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $global:LASTEXITCODE = 0
    & $StepAction | Out-Host
    return ($LASTEXITCODE -eq 0)
  } catch {
    Write-Host ('  ' + $_.Exception.Message)
    return $false
  } finally {
    $ErrorActionPreference = $stepSaved
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

# Runs a native command and returns what it printed ('' on failure).
function Invoke-Capture([string]$Exe, [string[]]$Arguments) {
  $saved = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    return ([string]((& $Exe @Arguments 2> $null) -join "`n"))
  } catch {
    return ''
  } finally {
    $ErrorActionPreference = $saved
  }
}

function Open-Url([string]$Url) {
  if ($DryRun) {
    Write-Info ('[dry run] Start-Process ' + $Url)
    return
  }
  try {
    Start-Process -FilePath $Url -ErrorAction Stop
  } catch {
    Write-Info ('Open ' + $Url + ' in your browser.')
  }
}

# HTTP on this machine, never through a proxy (Invoke-RestMethod in Windows
# PowerShell 5.1 would use the system proxy).
function Invoke-Local([string]$Url, [int]$TimeoutSec = 5) {
  $request = [System.Net.WebRequest]::Create($Url)
  $request.Proxy = $null
  $request.Timeout = $TimeoutSec * 1000
  $response = $request.GetResponse()
  try {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try { return $reader.ReadToEnd() } finally { $reader.Close() }
  } finally {
    $response.Close()
  }
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
    if ((($first -eq '"') -and ($last -eq '"')) -or (($first -eq "'") -and ($last -eq "'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
  }
  return $value
}

# Sets NAME=VALUE in .env (replaces the active NAME= lines or appends one);
# keeps the line endings; UTF-8 without a byte order mark.
function Set-EnvFileValue([string]$Name, [string]$Value) {
  if ($DryRun) {
    Write-Info ('[dry run] set ' + $Name + '=' + $Value + ' in .env')
    return
  }
  $text = ''
  if (Test-Path -LiteralPath $EnvPath) { $text = [System.IO.File]::ReadAllText($EnvPath) }
  $nl = "`n"
  if ($text.Contains("`r`n")) { $nl = "`r`n" }
  $pattern = '(?m)^' + [regex]::Escape($Name) + '=[^\r\n]*'
  if ([regex]::IsMatch($text, $pattern)) {
    $text = [regex]::Replace($text, $pattern, ($Name + '=' + $Value))
  } else {
    if (($text.Length -gt 0) -and (-not $text.EndsWith("`n"))) { $text = $text + $nl }
    $text = $text + $Name + '=' + $Value + $nl
  }
  [System.IO.File]::WriteAllText($EnvPath, $text, (New-Object System.Text.UTF8Encoding($false)))
  Write-Info ($Name + '=' + $Value + ' (in .env)')
}

function Get-Port {
  $port = [string][Environment]::GetEnvironmentVariable('DEMIFY_PORT')
  if ($port -eq '') { $port = Get-EnvFileValue 'DEMIFY_PORT' }
  if ($port -eq '') { $port = '3000' }
  return $port
}

function Get-BindHost {
  $bindHost = [string][Environment]::GetEnvironmentVariable('DEMIFY_BIND')
  if ($bindHost -eq '') { $bindHost = Get-EnvFileValue 'DEMIFY_BIND' }
  return $bindHost
}

# ---------------------------------------------------------------------------
# This computer and the model policy
# ---------------------------------------------------------------------------

function Format-GB([int]$MiB) {
  return ([double]$MiB / 1024).ToString('0.0', [System.Globalization.CultureInfo]::InvariantCulture)
}

function Get-MemoryMiB {
  $fake = Get-Fake 'RAM_GB'
  if ($fake -ne '') { return [int][math]::Floor([double]$fake * 1024) }
  if (Test-FakeMode) { return 0 }
  try {
    $cs = Get-CimInstance -ClassName Win32_ComputerSystem
    return [int][math]::Floor(([double]$cs.TotalPhysicalMemory) / 1MB)
  } catch { }
  try {
    $cs = Get-WmiObject -Class Win32_ComputerSystem
    return [int][math]::Floor(([double]$cs.TotalPhysicalMemory) / 1MB)
  } catch { }
  return 0
}

# Fills $script:MemMiB, GpuMiB, GpuText, IsSpark, IsApple and Arch.
function Read-Hardware {
  $script:MemMiB = Get-MemoryMiB
  $lines = @()
  $fakeGb = Get-Fake 'GPU_GB'
  $fakeName = Get-Fake 'GPU_NAME'
  if (($fakeGb -ne '') -or ($fakeName -ne '')) {
    if ($fakeGb -ne '0') {
      $name = $fakeName
      if ($name -eq '') { $name = 'NVIDIA test GPU' }
      if ($fakeGb -ne '') {
        $lines = @($name + ', ' + [string][int][math]::Floor([double]$fakeGb * 1024))
      } else {
        $lines = @($name + ', [N/A]')
      }
    }
  } elseif (-not (Test-FakeMode)) {
    $smi = Get-Command nvidia-smi -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($smi) {
      # Quoted: an unquoted comma would split the argument into two.
      $text = Invoke-Capture ([string]$smi.Path) @('--query-gpu=name,memory.total', '--format=csv,noheader,nounits')
      $lines = @($text -split "`n")
    }
  }
  $script:GpuMiB = 0
  $script:GpuText = ''
  $script:IsSpark = $false
  foreach ($line in $lines) {
    $text = ([string]$line).Trim()
    if ($text -eq '') { continue }
    $name = $text
    $mib = 0
    $cut = $text.LastIndexOf(',')
    if ($cut -ge 0) {
      $name = $text.Substring(0, $cut).Trim()
      $digits = $text.Substring($cut + 1) -replace '[^0-9]', ''
      if ($digits -ne '') { $mib = [int]$digits }
    }
    if ($mib -gt 0) { $label = $name + ' (' + (Format-GB $mib) + ' GB)' } else { $label = $name + ' (memory shared with the system)' }
    if ($script:GpuText -eq '') { $script:GpuText = $label } else { $script:GpuText = $script:GpuText + '; ' + $label }
    if ($mib -gt $script:GpuMiB) { $script:GpuMiB = $mib }
    if ($name -match 'GB10|DGX Spark') { $script:IsSpark = $true }
  }
  $script:Arch = Get-Fake 'ARCH'
  if ($script:Arch -eq '') { $script:Arch = [string][Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE') }
  # Apple silicon only appears through the test hooks (this is Windows).
  $fakeOs = Get-Fake 'OS'
  $script:IsApple = (($fakeOs -match '^(mac|macos|darwin|osx)$') -and ($script:Arch -match '^(arm64|aarch64)$'))
}

# The shared model policy (docs/LOCAL-MODEL.md section 1; install.sh uses the
# same rules):
#   NVIDIA DGX Spark (GB10), an NVIDIA GPU with 16 GB or more, or Apple silicon
#   with 32 GB or more of unified memory     -> gpt-oss:20b
#   8.5 GB of memory or less                  -> gemma3:1b
#   anything else                             -> gemma3:4b
function Select-Model([int]$Mem, [int]$Gpu, [bool]$Spark, [bool]$Apple) {
  if ($Spark) {
    $script:ChosenModel = 'gpt-oss:20b'
    $script:ChosenReason = 'NVIDIA DGX Spark (GB10): gpt-oss:20b (about 14 GB) runs on its GPU.'
  } elseif ($Gpu -ge 15000) {
    $script:ChosenModel = 'gpt-oss:20b'
    $script:ChosenReason = 'NVIDIA GPU with ' + (Format-GB $Gpu) + ' GB of video memory (16 GB or more): gpt-oss:20b (about 14 GB) fits on it.'
  } elseif ($Apple -and ($Mem -ge 32000)) {
    $script:ChosenModel = 'gpt-oss:20b'
    $script:ChosenReason = 'Apple silicon with ' + (Format-GB $Mem) + ' GB of unified memory (32 GB or more): gpt-oss:20b (about 14 GB) runs on its GPU.'
  } elseif (($Mem -gt 0) -and ($Mem -le 8704)) {
    $script:ChosenModel = 'gemma3:1b'
    $script:ChosenReason = (Format-GB $Mem) + ' GB of memory (8.5 GB or less): gemma3:1b (about 0.8 GB) leaves room for Docker and the browser.'
  } elseif (($Mem -gt 0) -and $Apple) {
    $script:ChosenModel = 'gemma3:4b'
    $script:ChosenReason = 'Apple silicon with ' + (Format-GB $Mem) + ' GB of unified memory (less than 32 GB): gemma3:4b (about 3.3 GB) runs on its GPU.'
  } elseif (($Mem -gt 0) -and ($Gpu -gt 0)) {
    $script:ChosenModel = 'gemma3:4b'
    $script:ChosenReason = (Format-GB $Mem) + ' GB of memory and an NVIDIA GPU with ' + (Format-GB $Gpu) + ' GB (less than 16 GB): gemma3:4b (about 3.3 GB) fits on it.'
  } elseif ($Mem -gt 0) {
    $script:ChosenModel = 'gemma3:4b'
    $script:ChosenReason = (Format-GB $Mem) + ' GB of memory and no NVIDIA GPU with 16 GB or more: gemma3:4b (about 3.3 GB) runs on the processor.'
  } else {
    $script:ChosenModel = 'gemma3:4b'
    $script:ChosenReason = 'memory size unknown: gemma3:4b (about 3.3 GB), the default.'
  }
}

function Show-HardwareAndModel {
  Read-Hardware
  if ($script:IsApple) {
    Write-Info ('System: macOS, ' + $script:Arch + ' (Apple silicon)')
  } else {
    Write-Info ('System: Windows, ' + $script:Arch)
  }
  if ($script:MemMiB -gt 0) { Write-Info ('Memory: ' + (Format-GB $script:MemMiB) + ' GB') } else { Write-Info 'Memory: unknown' }
  if ($script:GpuText -eq '') { Write-Info 'NVIDIA GPU: none' } else { Write-Info ('NVIDIA GPU: ' + $script:GpuText) }
  Select-Model $script:MemMiB $script:GpuMiB $script:IsSpark $script:IsApple
}

# ---------------------------------------------------------------------------
# Step 1: Docker
# ---------------------------------------------------------------------------

function Get-ProgramFiles {
  # The 64-bit folder, also from a 32-bit PowerShell.
  $pf = [Environment]::GetEnvironmentVariable('ProgramW6432')
  if (($null -eq $pf) -or ($pf -eq '')) { $pf = [Environment]::GetEnvironmentVariable('ProgramFiles') }
  if (($null -eq $pf) -or ($pf -eq '')) { $pf = 'C:\Program Files' }
  return $pf
}

function Get-DockerDesktopExe {
  return (Join-Path (Get-ProgramFiles) 'Docker\Docker\Docker Desktop.exe')
}

# Docker Desktop's command-line tools when they are not on PATH yet.
function Add-DockerToPath {
  if (Get-Command docker -CommandType Application -ErrorAction SilentlyContinue) { return }
  $dir = Join-Path (Get-ProgramFiles) 'Docker\Docker\resources\bin'
  if (Test-Path -LiteralPath (Join-Path $dir 'docker.exe')) { $env:Path = $dir + ';' + $env:Path }
}

# missing, stopped, no-compose, windows-containers or running
function Get-DockerState {
  $fake = Get-Fake 'DOCKER'
  if ($fake -ne '') { return $fake }
  if (Test-FakeMode) { return 'running' }
  Add-DockerToPath
  if (-not (Get-Command docker -CommandType Application -ErrorAction SilentlyContinue)) {
    if (Test-Path -LiteralPath (Get-DockerDesktopExe)) { return 'stopped' }
    return 'missing'
  }
  if ((Invoke-Quiet 'docker' @('info')) -ne 0) { return 'stopped' }
  if ((Invoke-Quiet 'docker' @('compose', 'version')) -ne 0) { return 'no-compose' }
  if ((Invoke-Capture 'docker' @('info', '--format', '{{.OSType}}')).Trim() -eq 'windows') { return 'windows-containers' }
  return 'running'
}

function Test-Winget {
  $fake = Get-Fake 'WINGET'
  if ($fake -ne '') { return ($fake -eq '1') }
  if (Test-FakeMode) { return $true }
  return [bool](Get-Command winget -ErrorAction SilentlyContinue)
}

function Install-Docker {
  if (Test-Winget) {
    Write-Info 'Docker Desktop can be installed with winget. Windows asks for administrator'
    Write-Info 'rights, and Docker Desktop usually needs a restart of Windows afterwards.'
    if (Confirm-Step 'Install Docker Desktop now?') {
      $ok = Invoke-Step 'winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements' {
        & winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
      }
      if (-not $ok) {
        Stop-Install 'winget could not install Docker Desktop.' @('Install it from ' + $DockerUrl + ' instead, then run the installer again.')
      }
      if ($DryRun) {
        Write-Info '[dry run] A real run stops here: restart Windows, then run the installer again.'
        return
      }
      Stop-Install 'Docker Desktop is installed and needs a restart.' @(
        '1. Restart Windows.',
        '2. Start Docker Desktop once from the Start menu and accept its terms.',
        '3. Run the installer again after the restart: powershell -ExecutionPolicy Bypass -File install.ps1'
      )
    }
  }
  Open-Url $DockerUrl
  Stop-Install 'Docker Desktop is needed.' @(
    ('Install it from ' + $DockerUrl + ' (with the WSL 2 backend),'),
    'restart Windows if it asks, then run the installer again after the restart.'
  )
}

function Wait-Docker {
  if ($DryRun) {
    Write-Info ('[dry run] wait up to ' + $DockerWaitSeconds + ' s until docker info answers')
    return
  }
  $waited = 0
  while ($waited -lt $DockerWaitSeconds) {
    $state = Get-DockerState
    if (($state -ne 'stopped') -and ($state -ne 'missing')) { return }
    Start-Sleep -Seconds 5
    $waited += 5
    if (($waited % 30) -eq 0) { Write-Info ('Still waiting for Docker (' + $waited + ' s) ...') }
  }
  Stop-Install ('Docker did not start within ' + [int]($DockerWaitSeconds / 60) + ' minutes.') @(
    'Open Docker Desktop yourself. If it shows a window (terms, sign-in, an update), finish that.',
    'Wait until it says that the engine is running, then run the installer again.'
  )
}

function Start-DockerDesktop {
  Write-Info 'Docker Desktop is installed but not running. Starting it (this can take a minute or two).'
  $dockerExe = Get-DockerDesktopExe
  $ok = Invoke-Step ('Start-Process "' + $dockerExe + '"') { Start-Process -FilePath $dockerExe -ErrorAction Stop }
  if (-not $ok) {
    Stop-Install 'could not start Docker Desktop.' @('Start it from the Start menu, wait until the engine runs, then run the installer again.')
  }
  Wait-Docker
}

function Confirm-Docker {
  Write-Step 'Step 1 of 5: Docker'
  $state = Get-DockerState
  if ($state -eq 'missing') {
    Write-Info 'Docker is not installed.'
    Install-Docker
    $state = 'stopped'
    if (-not $DryRun) { $state = Get-DockerState }
  }
  if ($state -eq 'stopped') {
    Start-DockerDesktop
    $state = 'running'
    if (-not $DryRun) { $state = Get-DockerState }
  }
  switch ($state) {
    'running' { Write-Info 'Docker runs, with Compose v2.' }
    'no-compose' {
      Stop-Install 'Docker Compose v2 is missing (docker compose version).' @('Update Docker Desktop; it includes Compose v2.')
    }
    'windows-containers' {
      Stop-Install 'Docker Desktop runs Windows containers; Demify needs Linux containers.' @(
        'Right-click the Docker icon in the taskbar, choose "Switch to Linux containers", then run the installer again.'
      )
    }
    default {
      Stop-Install ('Docker does not run (state: ' + $state + ').') @('Start Docker Desktop, then run the installer again.')
    }
  }
}

# ---------------------------------------------------------------------------
# Step 2: Ollama
# ---------------------------------------------------------------------------

function Test-OllamaUp {
  try {
    [void](Invoke-Local -Url ($OllamaUrl + '/api/version') -TimeoutSec 3)
    return $true
  } catch {
    return $false
  }
}

# The Ollama program: on PATH, or in its default place (a fresh install is
# not on PATH in this window yet). '' when it is not installed.
function Find-Ollama {
  $fake = Get-Fake 'OLLAMA'
  if ($fake -eq 'missing') { return '' }
  if (($fake -ne '') -or (Test-FakeMode)) { return '%LOCALAPPDATA%\Programs\Ollama\ollama.exe' }
  $cmd = Get-Command ollama -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { return [string]$cmd.Path }
  $localAppData = [Environment]::GetEnvironmentVariable('LOCALAPPDATA')
  if (($null -ne $localAppData) -and ($localAppData -ne '')) {
    $default = Join-Path $localAppData 'Programs\Ollama\ollama.exe'
    if (Test-Path -LiteralPath $default) { return $default }
  }
  return ''
}

# missing, stopped or running
function Get-OllamaState {
  $fake = Get-Fake 'OLLAMA'
  if ($fake -ne '') { return $fake }
  if (Test-FakeMode) { return 'running' }
  if (Test-OllamaUp) { return 'running' }
  if ((Find-Ollama) -ne '') { return 'stopped' }
  return 'missing'
}

function Install-Ollama {
  Write-Info 'Ollama for Windows can be installed with its official installer from ollama.com.'
  if (-not (Confirm-Step 'Install Ollama now?')) {
    Stop-Install 'Ollama is needed for the language model.' @(
      ('Install it from ' + $OllamaDownloadUrl + ', then run the installer again.'),
      'Or install Demify without a model: powershell -ExecutionPolicy Bypass -File install.ps1 -NoModel'
    )
  }
  # TLS 1.2 for Windows PowerShell 5.1 on older .NET settings.
  $installCommand = '[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor 3072; irm https://ollama.com/install.ps1 | iex'
  $ok = Invoke-Step ('powershell -NoProfile -ExecutionPolicy Bypass -Command "' + $installCommand + '"') {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command $installCommand
  }
  if (-not $ok) {
    Stop-Install 'the Ollama installer failed (see above).' @('Install Ollama from ' + $OllamaDownloadUrl + ', then run the installer again.')
  }
}

function Start-Ollama([string]$OllamaExe) {
  $appExe = Join-Path (Split-Path -Parent $OllamaExe) 'ollama app.exe'
  if ((-not $DryRun) -and (Test-Path -LiteralPath $appExe)) {
    [void](Invoke-Step ('Start-Process "' + $appExe + '"') { Start-Process -FilePath $appExe -ErrorAction Stop })
  } else {
    [void](Invoke-Step ('Start-Process "' + $OllamaExe + '" -ArgumentList serve -WindowStyle Hidden') {
        Start-Process -FilePath $OllamaExe -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction Stop
      })
  }
}

function Wait-Ollama {
  if ($DryRun) {
    Write-Info ('[dry run] wait up to ' + $OllamaWaitSeconds + ' s until Ollama answers on ' + $OllamaUrl)
    return
  }
  $deadline = (Get-Date).AddSeconds($OllamaWaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-OllamaUp) { return }
    Start-Sleep -Seconds 2
  }
  Stop-Install ('Ollama does not answer on ' + $OllamaUrl + '.') @('Start Ollama from the Start menu, then run the installer again.')
}

function Confirm-Ollama {
  Write-Step 'Step 2 of 5: Ollama (runs the language model on this computer)'
  $state = Get-OllamaState
  $script:OllamaPath = Find-Ollama
  if ($state -eq 'running') {
    Write-Info ('Ollama answers on ' + $OllamaUrl + '.')
    return
  }
  if ($state -eq 'missing') {
    Write-Info 'Ollama is not installed.'
    Install-Ollama
    $script:OllamaPath = Find-Ollama
    if ($DryRun) {
      if ($script:OllamaPath -eq '') { $script:OllamaPath = '%LOCALAPPDATA%\Programs\Ollama\ollama.exe' }
    } else {
      if (Test-OllamaUp) {
        Write-Info ('Ollama answers on ' + $OllamaUrl + '.')
        return
      }
      if ($script:OllamaPath -eq '') {
        Stop-Install 'Ollama was installed, but this window cannot find it yet.' @('Close this window, open a new one and run the installer again.')
      }
    }
  }
  Write-Info 'Ollama is installed but not running. Starting it.'
  Start-Ollama $script:OllamaPath
  Wait-Ollama
  Write-Info ('Ollama answers on ' + $OllamaUrl + '.')
}

# ---------------------------------------------------------------------------
# Step 4 helpers: port and .env
# ---------------------------------------------------------------------------

function Test-PortInUse([int]$Port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(3000)) { return $false }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-DemifyRunning {
  $names = Invoke-Capture 'docker' @('ps', '--filter', 'name=^demify$', '--format', '{{.Names}}')
  return (@($names -split "`n" | Where-Object { $_.Trim() -eq 'demify' }).Count -gt 0)
}

function Confirm-EnvFile {
  if (Test-Path -LiteralPath $EnvPath) { return }
  if ($DryRun) {
    Write-Info '[dry run] copy .env.example .env'
    return
  }
  Copy-Item -LiteralPath $EnvExamplePath -Destination $EnvPath
  Write-Info 'Created .env from .env.example'
}

# When another program uses Demify's port, offer the next free one.
function Confirm-Port {
  if (Test-FakeMode) { return }
  $port = [int](Get-Port)
  if ((Test-DemifyRunning) -or (-not (Test-PortInUse $port))) { return }
  if ([string][Environment]::GetEnvironmentVariable('DEMIFY_PORT') -ne '') {
    Stop-Install ('port ' + $port + ' (DEMIFY_PORT in this window) is used by another program.') @('Choose another one: $env:DEMIFY_PORT = "3001", then run the installer again.')
  }
  for ($p = $port + 1; $p -le $port + 20; $p++) {
    if (-not (Test-PortInUse $p)) {
      Write-Info ('Port ' + $port + ' is used by another program (often a development server).')
      if (Confirm-Step ('Use port ' + $p + ' for Demify instead (sets DEMIFY_PORT=' + $p + ' in .env)?')) {
        Set-EnvFileValue 'DEMIFY_PORT' ([string]$p)
        return
      }
      break
    }
  }
  Stop-Install ('port ' + $port + ' is used by another program.') @(
    'Stop that program, or set another port in .env (for example DEMIFY_PORT=3001),',
    'then run the installer again.'
  )
}

function Get-LocalBase {
  $bindHost = Get-BindHost
  if (($bindHost -eq '') -or ($bindHost -eq '0.0.0.0') -or ($bindHost -eq '::') -or ($bindHost -eq '[::]')) { $bindHost = '127.0.0.1' }
  return ('http://' + $bindHost + ':' + (Get-Port))
}

# Without a model: start Demify and wait for /api/health.
function Start-DemifyWithoutModel {
  $base = Get-LocalBase
  if ((Get-EnvFileValue 'DEMIFY_MODEL_URL') -ne '') {
    Write-Note '.env still sets DEMIFY_MODEL_URL, so Demify keeps using that model. Delete that line in .env to turn the model off.'
  }
  if ($DryRun) {
    Write-Info '[dry run] docker compose -f docker-compose.yml up -d --build'
    Write-Info ('[dry run] wait up to ' + $TimeoutSeconds + ' s until ' + $base + '/api/health answers')
    return
  }
  Write-Info 'Running: docker compose -f docker-compose.yml up -d --build'
  Write-Info '(the first build takes a few minutes; later runs reuse it)'
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
  }
  if ($composeExit -ne 0) {
    Stop-Install 'docker compose could not build or start Demify.' @(
      'Behind a TLS-intercepting proxy the image build needs DEMIFY_BUILD_CA (docs/DEPLOYMENT.md, section 4).',
      'Logs: docker compose -f docker-compose.yml logs demify'
    )
  }
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      [void](Invoke-Local -Url ($base + '/api/health') -TimeoutSec 5)
      Write-Info ('Demify answers on ' + $base)
      return
    } catch { }
    Start-Sleep -Seconds 3
  }
  Stop-Install ('Demify did not answer on ' + $base + ' within ' + $TimeoutSeconds + ' s.') @(
    'Check: docker compose -f docker-compose.yml ps   and   docker compose -f docker-compose.yml logs demify'
  )
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if (($Model -ne '') -and ($Model -notmatch '^[A-Za-z0-9][A-Za-z0-9._:/-]*$')) {
  Write-Host ('Not a model name: ' + $Model) -ForegroundColor Red
  exit 2
}
if (($Model -ne '') -and $NoModel) {
  Write-Host '-Model and -NoModel do not go together.' -ForegroundColor Red
  exit 2
}
if ($TimeoutSeconds -lt 1) {
  Write-Host 'TimeoutSeconds must be 1 or more.' -ForegroundColor Red
  exit 2
}

if ($ShowModel) {
  Write-Host 'Demify installer: the language model for this computer'
  Show-HardwareAndModel
  Write-Info ('Model: ' + $script:ChosenModel)
  Write-Info ('Why:   ' + $script:ChosenReason)
  Write-Info '(-Model <name> chooses another one; docs/LOCAL-MODEL.md section 1)'
  exit 0
}

# PowerShell 7 on macOS or Linux: use install.sh there.
if ((Test-Path variable:global:IsWindows) -and (-not $IsWindows) -and (-not (Test-FakeMode))) {
  Write-Host 'This installer is for Windows. On macOS and Linux run: bash install.sh' -ForegroundColor Red
  exit 2
}
if ((-not (Test-Path -LiteralPath (Join-Path $Root 'docker-compose.yml'))) -or (-not (Test-Path -LiteralPath $EnvExamplePath)) -or
  (-not (Test-Path -LiteralPath (Join-Path $Root 'scripts\setup-local-model.ps1')))) {
  Stop-Install ('install.ps1 must stay in the Demify folder (docker-compose.yml or scripts\setup-local-model.ps1 not found in ' + $Root + ').')
}
if ((Test-FakeMode) -and (-not $DryRun)) {
  Write-Host 'Test settings (DEMIFY_INSTALL_FAKE_*) are set: this is a dry run, nothing is changed.'
  $DryRun = [switch]$true
}

Push-Location -LiteralPath $Root
try {
  Write-Host ('Demify installer (' + $Root + ')')
  if ($DryRun) { Write-Host 'Dry run: every command is printed, none is run.' }
  if ((Get-EnvFileValue 'COMPOSE_FILE') -match 'spark') {
    Stop-Install 'this .env belongs to the DGX Spark onboard server (COMPOSE_FILE=docker-compose.spark.yml).' @(
      'The installer sets up the single-container Demify; the Spark setup is in docs/SPARK.md.'
    )
  }

  Confirm-Docker

  if ($NoModel) {
    Write-Step 'Step 2 of 5: Ollama'
    Write-Info 'Skipped (-NoModel).'
    Write-Step 'Step 3 of 5: Language model'
    Write-Info 'Skipped (-NoModel): the onboard assistant shows the matching library passages only.'
  } else {
    Confirm-Ollama
    Write-Step 'Step 3 of 5: Language model for this computer'
    Show-HardwareAndModel
    $envModel = Get-EnvFileValue 'DEMIFY_LLM_MODEL'
    if ($Model -ne '') {
      Write-Info ('Suggested for this computer: ' + $script:ChosenModel)
      $script:ChosenModel = $Model
      $script:ChosenReason = 'chosen with -Model.'
      Write-Info ('Model: ' + $script:ChosenModel)
      Write-Info ('Why:   ' + $script:ChosenReason)
    } elseif ($envModel -ne '') {
      # A re-run (for example after git pull) keeps the model this computer already uses.
      Write-Info ('Suggested for this computer: ' + $script:ChosenModel)
      $script:ChosenModel = $envModel
      $script:ChosenReason = 'kept from .env.'
      Write-Info ('Model: ' + $script:ChosenModel + ' (from .env; -Model <name> to change)')
    } else {
      Write-Info ('Model: ' + $script:ChosenModel)
      Write-Info ('Why:   ' + $script:ChosenReason)
    }
    if ($script:IsSpark) {
      Write-Info 'This is an NVIDIA DGX Spark. The installer sets up the single-container Demify; the'
      Write-Info 'full onboard server (PostgreSQL, model server, sync) is described in docs/SPARK.md.'
    }
  }

  Write-Step 'Step 4 of 5: Starting Demify'
  Confirm-EnvFile
  Confirm-Port
  if ($NoModel) {
    Start-DemifyWithoutModel
  } else {
    $setupScript = Join-Path $Root 'scripts\setup-local-model.ps1'
    $setupArgs = @{ Model = $script:ChosenModel; FromInstaller = $true; TimeoutSeconds = $TimeoutSeconds }
    $shown = '-Model ' + $script:ChosenModel + ' -FromInstaller -TimeoutSeconds ' + $TimeoutSeconds
    if ($script:OllamaPath -ne '') {
      $setupArgs['OllamaExe'] = $script:OllamaPath
      $shown = $shown + ' -OllamaExe "' + $script:OllamaPath + '"'
    }
    if ($NoTest) {
      $setupArgs['NoTest'] = $true
      $shown = $shown + ' -NoTest'
    }
    if ($DryRun) {
      $setupArgs['DryRun'] = $true
      $shown = $shown + ' -DryRun'
    }
    Write-Info ('Running: scripts\setup-local-model.ps1 ' + $shown)
    $setupExit = 1
    try {
      $global:LASTEXITCODE = 0
      & $setupScript @setupArgs
      $setupExit = $LASTEXITCODE
    } catch {
      Write-Host ('  ' + $_.Exception.Message)
      $setupExit = 1
    }
    if ($setupExit -ne 0) {
      Stop-Install 'the model setup did not finish (see the message above).' @(
        'Fix that, then run the installer again: powershell -ExecutionPolicy Bypass -File install.ps1'
      )
    }
  }

  # 5. Open ------------------------------------------------------------------------
  $openHost = Get-BindHost
  if (($openHost -eq '') -or ($openHost -eq '0.0.0.0') -or ($openHost -eq '::') -or ($openHost -eq '[::]') -or ($openHost -eq '127.0.0.1')) {
    $openHost = 'localhost'
  }
  $url = 'http://' + $openHost + ':' + (Get-Port)
  Write-Step 'Step 5 of 5: Demify is running'
  Write-Info ('Open: ' + $url)
  if (-not $NoModel) { Write-Info ('Onboard assistant: ' + $url + '/assistant (model ' + $script:ChosenModel + ')') }
  if (-not $NoBrowser) { Open-Url $url }
  Write-Host ''
  Write-Info ('To stop Demify:        docker compose down        (in ' + $Root + ')')
  Write-Info 'To start it again:     docker compose up -d'
  Write-Info 'To update:             git pull origin Project-2-Phase-1, then run the installer again: powershell -ExecutionPolicy Bypass -File install.ps1'
  if (-not $NoModel) { Write-Info ('To remove the model:   ollama rm ' + $script:ChosenModel) }
  Write-Info 'Help: docs\INSTALL.md'
} finally {
  Pop-Location
}
exit 0
