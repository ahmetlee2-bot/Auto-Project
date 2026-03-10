param(
  [int]$Port = 8080,
  [string]$FrontendTarget = "http://127.0.0.1:3000",
  [string]$BackendTarget = "http://127.0.0.1:8000",
  [string]$Username = "demo",
  [string]$Password = "autonow-demo"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$nodeCommand = Resolve-NodePath
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $nodeCommand) {
  throw "node bulunamadi. Once Node.js 22+ kurulmali."
}

$env:DEMO_GATEWAY_PORT = $Port.ToString()
$env:DEMO_FRONTEND_TARGET = $FrontendTarget
$env:DEMO_BACKEND_TARGET = $BackendTarget
$env:DEMO_USERNAME = $Username
$env:DEMO_PASSWORD = $Password

Write-Host "Starting AUTONOW demo gateway on http://127.0.0.1:$Port" -ForegroundColor Green
Push-Location $root
try {
  & $nodeCommand (Join-Path $root "scripts\demo-gateway.mjs")
  if ($LASTEXITCODE -ne 0) {
    throw "Demo gateway baslatilamadi."
  }
}
finally {
  Pop-Location
}
