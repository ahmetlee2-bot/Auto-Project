param(
  [switch]$Bootstrap
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$backendPath = Join-Path $root "backend"
$venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"
$runtimeTemp = Join-Path $root ".runtime-temp"

New-Item -ItemType Directory -Force -Path $runtimeTemp | Out-Null
$env:TEMP = $runtimeTemp
$env:TMP = $runtimeTemp

if (-not (Test-Path $venvPython)) {
  throw "Backend virtual environment bulunamadi. Once .\scripts\run-backend.ps1 -Bootstrap calistir."
}

& $venvPython --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Backend virtual environment icindeki Python calismiyor."
}

if ($Bootstrap) {
  & $venvPython -m pip install -r (Join-Path $backendPath "requirements.txt") -r (Join-Path $backendPath "requirements-dev.txt")
  if ($LASTEXITCODE -ne 0) {
    throw "Backend test bagimliliklari kurulurken hata olustu."
  }
}

Push-Location $backendPath
try {
  & $venvPython -m pytest
  if ($LASTEXITCODE -ne 0) {
    throw "Backend testleri basarisiz oldu."
  }
}
finally {
  Pop-Location
}
