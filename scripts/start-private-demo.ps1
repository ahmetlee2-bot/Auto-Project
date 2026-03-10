param(
  [switch]$Bootstrap
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")
$nodeCommand = Resolve-NodePath
$root = Resolve-Path (Join-Path $PSScriptRoot "..")

if (-not $nodeCommand) {
  throw "node bulunamadi. Once Node.js 22+ kurulmali."
}

$arguments = @((Join-Path $root "scripts\start-private-demo.mjs"))
if ($Bootstrap) {
  $arguments += "--bootstrap"
}

& $nodeCommand @arguments
if ($LASTEXITCODE -ne 0) {
  throw "Private demo launcher basarisiz oldu."
}
