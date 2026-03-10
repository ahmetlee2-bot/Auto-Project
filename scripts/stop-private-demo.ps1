$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$nodeCommand = Resolve-NodePath
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $nodeCommand) {
  throw "node bulunamadi. Once Node.js 22+ kurulmali."
}

& $nodeCommand (Join-Path $root "scripts\stop-private-demo.mjs")
if ($LASTEXITCODE -ne 0) {
  throw "Private demo stop komutu basarisiz oldu."
}
