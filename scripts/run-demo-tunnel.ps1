param(
  [string]$TargetUrl = "http://127.0.0.1:8080",
  [string]$LogFile = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$cloudflared = Resolve-CloudflaredPath

if (-not $cloudflared) {
  throw "cloudflared bulunamadi. Once cloudflared kur veya local binary hazirla."
}

Write-Host "Starting cloudflared tunnel for $TargetUrl" -ForegroundColor Green
$arguments = @(
  "tunnel",
  "--url",
  $TargetUrl,
  "--no-autoupdate",
  "--loglevel",
  "info"
)

if ($LogFile) {
  $logDirectory = Split-Path $LogFile -Parent
  if ($logDirectory) {
    New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
  }
  $arguments += @("--logfile", $LogFile, "--output", "json")
}

& $cloudflared @arguments
if ($LASTEXITCODE -ne 0) {
  throw "cloudflared tunnel baslatilamadi."
}
