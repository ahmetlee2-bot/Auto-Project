$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")

$commands = @(
  @{ Label = "Node.js"; Path = (Resolve-NodePath); Args = @("--version") },
  @{ Label = "npm"; Path = (Resolve-NpmPath); Args = @("--version") },
  @{ Label = "Python"; Path = (Resolve-PythonPath); Args = @("--version") },
  @{ Label = "Docker"; Path = (Resolve-DockerPath); Args = @("--version") },
  @{ Label = "Git"; Path = (Resolve-GitPath); Args = @("--version") },
  @{ Label = "GitHub CLI"; Path = (Resolve-GitHubCliPath); Args = @("--version") },
  @{ Label = "cloudflared"; Path = (Resolve-CloudflaredPath); Args = @("--version") }
)

function Test-CommandWorks {
  param(
    [string]$Path,
    [string[]]$Args
  )

  if (-not $Path) {
    return $false
  }

  if (Test-Path $Path) {
    return $true
  }

  try {
    & $Path @Args *> $null
    return $LASTEXITCODE -eq 0
  }
  catch {
    return $false
  }
}

Write-Host "AUTONOW runtime doctor" -ForegroundColor Cyan
Write-Host ""

$results = @()
foreach ($command in $commands) {
  $works = Test-CommandWorks -Path $command.Path -Args $command.Args
  $results += @{ Label = $command.Label; Works = $works }
  if ($works) {
    Write-Host ("[OK]   {0}" -f $command.Label) -ForegroundColor Green
  }
  else {
    Write-Host ("[MISS] {0}" -f $command.Label) -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Expected project files:" -ForegroundColor Cyan

$requiredFiles = @(
  "frontend\package.json",
  "backend\requirements.txt",
  "backend\app\main.py",
  "docker-compose.yml"
)

$root = Resolve-Path (Join-Path $PSScriptRoot "..")

foreach ($relativePath in $requiredFiles) {
  $fullPath = Join-Path $root $relativePath
  if (Test-Path $fullPath) {
    Write-Host ("[OK]   {0}" -f $relativePath) -ForegroundColor Green
  }
  else {
    Write-Host ("[MISS] {0}" -f $relativePath) -ForegroundColor Red
  }
}

Write-Host ""
Write-Host "Suggested next step:" -ForegroundColor Cyan
$missingCore = $results | Where-Object { -not $_.Works -and $_.Label -in @("Node.js", "npm", "Python") }
$missingDocker = $results | Where-Object { -not $_.Works -and $_.Label -eq "Docker" }

if ($missingCore.Count -gt 0) {
  Write-Host "1. Install missing core runtimes." -ForegroundColor Gray
}
else {
  Write-Host "1. Run .\scripts\run-backend.cmd -Bootstrap" -ForegroundColor Gray
  Write-Host "2. Run .\scripts\run-frontend.cmd -Bootstrap" -ForegroundColor Gray
  Write-Host "3. Run .\scripts\test-backend.cmd" -ForegroundColor Gray
  Write-Host "4. Run .\scripts\test-frontend.cmd" -ForegroundColor Gray
}

if ($missingDocker.Count -gt 0) {
  Write-Host "Docker is optional right now. Install Docker Desktop later if you want compose-based runtime." -ForegroundColor DarkGray
}
