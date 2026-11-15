# One-time network setup for the phone (run AFTER the laptop joined the phone hotspot).
# Needs administrator rights: it re-launches itself elevated (click "Yes" in the UAC dialog).
#   powershell -ExecutionPolicy Bypass -File network-setup.ps1
# What it does (both reversible):
#  1. sets the current Wi-Fi network profile to Private
#  2. allows inbound TCP 8443 (gateway) on Private networks only
# It does NOT open 1883 (broker) or 3000 (Demify) to the network.

$port = 8443
$ruleName = 'Demify pulse gateway 8443'
$log = Join-Path $PSScriptRoot 'network-setup.log'

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'Asking for administrator rights: click "Yes" in the Windows dialog...' -ForegroundColor Cyan
  $p = Start-Process powershell -Verb RunAs -Wait -PassThru -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
  if (Test-Path $log) { Get-Content $log }
  exit $p.ExitCode
}

Start-Transcript -Path $log -Force | Out-Null
try {
  $wifi = Get-NetConnectionProfile | Where-Object { $_.InterfaceAlias -match 'WLAN|Wi-Fi|Wireless' } | Select-Object -First 1
  if (-not $wifi) {
    Write-Host 'No Wi-Fi connection found. Connect the laptop to the phone hotspot first.' -ForegroundColor Red
    exit 1
  }
  if ($wifi.NetworkCategory -ne 'Private') {
    Set-NetConnectionProfile -InterfaceAlias $wifi.InterfaceAlias -NetworkCategory Private
  }
  $now = Get-NetConnectionProfile -InterfaceAlias $wifi.InterfaceAlias
  Write-Host "Wi-Fi '$($now.Name)' on $($now.InterfaceAlias): $($now.NetworkCategory)"

  $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Private | Out-Null
  }
  $rule = Get-NetFirewallRule -DisplayName $ruleName
  Write-Host "Firewall rule '$ruleName': enabled=$($rule.Enabled) profile=$($rule.Profile) action=$($rule.Action)"
  $ip = (Get-NetIPAddress -InterfaceAlias $wifi.InterfaceAlias -AddressFamily IPv4).IPAddress
  Write-Host "Laptop address on this network: $ip  (phone link: https://${ip}:$port/?token=...&crew=test)" -ForegroundColor Green
  Write-Host 'To undo later: Remove-NetFirewallRule -DisplayName "Demify pulse gateway 8443"'
} finally {
  Stop-Transcript | Out-Null
}
