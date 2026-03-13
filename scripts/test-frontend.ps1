param(
  [switch]$Bootstrap
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
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend bagimliliklari kurulurken hata olustu."
    }
  }

  & $npmCommand run typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend typecheck basarisiz oldu."
  }
  & $npmCommand run test
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend unit testleri basarisiz oldu."
  }
  & $npmCommand run build
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build basarisiz oldu."
  }
}
finally {
  Pop-Location
}
