param(
  [switch]$Bootstrap,
  [switch]$SetupOnly,
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8000,
  [string]$FrontendOrigin = "http://127.0.0.1:8080"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendPath = Join-Path $root "backend"
$venvPath = Join-Path $backendPath ".venv"
$pythonCommand = Resolve-PythonPath
$runtimeTemp = Join-Path $root ".runtime-temp"

New-Item -ItemType Directory -Force -Path $runtimeTemp | Out-Null
$env:TEMP = $runtimeTemp
$env:TMP = $runtimeTemp

if (-not $pythonCommand) {
  throw "Python bulunamadi. Once Python 3.12+ kurulmali."
}

& $pythonCommand --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Python komutu gorunuyor ama calismiyor. Windows Store alias degil, gercek Python 3.12+ kurulumu gerekli."
}

if (-not (Test-Path $venvPath)) {
  Write-Host "Creating backend virtual environment..." -ForegroundColor Cyan
  & $pythonCommand -m venv --without-pip $venvPath
  if ($LASTEXITCODE -ne 0) {
    throw "Backend virtual environment olusturulamadi."
  }
}

$venvPython = Join-Path $venvPath "Scripts\python.exe"

& $venvPython -m pip --version *> $null
if ($LASTEXITCODE -ne 0) {
  $pythonHome = Split-Path $pythonCommand -Parent
  $bundledWheel = Get-ChildItem (Join-Path $pythonHome "Lib\ensurepip\_bundled") -Filter "pip-*.whl" -ErrorAction SilentlyContinue | Select-Object -First 1

  if (-not $bundledWheel) {
    throw "Bundled pip wheel bulunamadi. Python kurulumu eksik olabilir."
  }

  Write-Host "Installing pip into backend virtual environment..." -ForegroundColor Cyan
  & $pythonCommand -m pip --python $venvPython install --no-index --no-cache-dir $bundledWheel.FullName
  if ($LASTEXITCODE -ne 0) {
    throw "Backend virtual environment icinde pip hazirlanamadi."
  }
}

if ($Bootstrap) {
  Write-Host "Installing backend production dependencies..." -ForegroundColor Cyan
  & $venvPython -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) {
    throw "pip upgrade basarisiz oldu."
  }
  & $venvPython -m pip install -r (Join-Path $backendPath "requirements.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Backend production bagimliliklari kurulurken hata olustu."
  }
}

if ($SetupOnly) {
  Write-Host "Backend production setup completed." -ForegroundColor Green
  return
}

$env:AUTONOW_FRONTEND_ORIGIN = $FrontendOrigin

Write-Host "Starting FastAPI backend on http://$BindHost`:$Port" -ForegroundColor Green
Push-Location $backendPath
try {
  & $venvPython -m uvicorn app.main:app --host $BindHost --port $Port
  if ($LASTEXITCODE -ne 0) {
    throw "Backend production runtime baslatilamadi."
  }
}
finally {
  Pop-Location
}
