param(
  [switch]$Bootstrap,
  [switch]$SetupOnly
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

if ($Bootstrap -or -not (Test-Path $nodeModulesPath)) {
  Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
  Push-Location $frontendPath
  try {
    & $npmCommand install
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend bagimliliklari kurulurken hata olustu."
    }
  }
  finally {
    Pop-Location
  }
}

if ($SetupOnly) {
  Write-Host "Frontend setup completed." -ForegroundColor Green
  return
}

Write-Host "Starting Next.js frontend on http://localhost:3000" -ForegroundColor Green
Push-Location $frontendPath
try {
  & $npmCommand run dev
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend baslatilamadi."
  }
}
finally {
  Pop-Location
}
