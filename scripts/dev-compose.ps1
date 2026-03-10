$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$dockerCommand = Resolve-DockerPath

if (-not $dockerCommand) {
  throw "Docker bulunamadi. Native scripts veya Docker Desktop kurulumu gerekli."
}

& $dockerCommand --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker komutu gorunuyor ama calismiyor. Docker Desktop kurulumu veya PATH duzeltmesi gerekli."
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root
try {
  & $dockerCommand compose up --build
}
finally {
  Pop-Location
}
