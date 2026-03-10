param(
  [switch]$Bootstrap,
  [switch]$SetupOnly,
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$frontendPath = Join-Path $root "frontend"
$npmCommand = Resolve-NpmPath
$nodeCommand = Resolve-NodePath
$npmCachePath = Join-Path $root ".npm-cache"

New-Item -ItemType Directory -Force -Path $npmCachePath | Out-Null
$env:npm_config_cache = $npmCachePath
$env:NEXT_TELEMETRY_DISABLED = "1"

if (-not $npmCommand) {
  throw "npm bulunamadi. Once Node.js 22+ kurulmali."
}

if (-not $nodeCommand) {
  throw "node bulunamadi. Once Node.js 22+ kurulmali."
}

$nodeDirectory = Split-Path $nodeCommand -Parent
$env:Path = "$nodeDirectory;$env:Path"

& $npmCommand --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "npm komutu gorunuyor ama calismiyor. Gercek Node.js kurulumu gerekli."
}

$nodeModulesPath = Join-Path $frontendPath "node_modules"

Push-Location $frontendPath
try {
  if ($Bootstrap -or -not (Test-Path $nodeModulesPath)) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend bagimliliklari kurulurken hata olustu."
    }
  }

  Write-Host "Building production frontend..." -ForegroundColor Cyan
  & $npmCommand run build
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend production build basarisiz oldu."
  }

  if ($SetupOnly) {
    Write-Host "Frontend production setup completed." -ForegroundColor Green
    return
  }

  Write-Host "Starting Next.js frontend on http://$BindHost`:$Port" -ForegroundColor Green
  & $npmCommand run start -- --hostname $BindHost --port $Port
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend production runtime baslatilamadi."
  }
}
finally {
  Pop-Location
}
