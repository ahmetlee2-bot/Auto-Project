param(
  [string]$RepoName = "autonow",
  [string]$CommitMessage = "Initial AUTONOW foundation",
  [switch]$Public
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "runtime.ps1")

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$gitPath = Resolve-GitPath
$ghPath = Resolve-GitHubCliPath

if (-not $gitPath) {
  throw "Git bulunamadi."
}

if (-not $ghPath) {
  throw "GitHub CLI bulunamadi."
}

function Invoke-CheckedCommand {
  param(
    [string]$Path,
    [string[]]$Args,
    [string]$ErrorMessage
  )

  & $Path @Args
  if ($LASTEXITCODE -ne 0) {
    throw $ErrorMessage
  }
}

Push-Location $root
try {
  $gitUserName = & $gitPath config --get user.name
  $gitUserEmail = & $gitPath config --get user.email

  if (-not $gitUserName -or -not $gitUserEmail) {
    throw "Git kimligi eksik. Once user.name ve user.email ayarla."
  }

  & $ghPath auth status *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub CLI girisi yok. Once 'gh auth login' calistir."
  }

  if (-not (Test-Path ".git")) {
    Invoke-CheckedCommand -Path $gitPath -Args @("init", "-b", "main") -ErrorMessage "Git repo baslatilamadi."
  }

  Invoke-CheckedCommand -Path $gitPath -Args @("add", ".") -ErrorMessage "Dosyalar stage edilemedi."

  & $gitPath diff --cached --quiet
  if ($LASTEXITCODE -eq 1) {
    Invoke-CheckedCommand -Path $gitPath -Args @("commit", "-m", $CommitMessage) -ErrorMessage "Commit olusturulamadi."
  }

  $visibility = if ($Public) { "--public" } else { "--private" }
  & $gitPath remote get-url origin *> $null
  if ($LASTEXITCODE -ne 0) {
    Invoke-CheckedCommand -Path $ghPath -Args @("repo", "create", $RepoName, $visibility, "--source", ".", "--remote", "origin", "--push") -ErrorMessage "GitHub repo olusturulamadi."
  }
  else {
    Invoke-CheckedCommand -Path $gitPath -Args @("push", "-u", "origin", "main") -ErrorMessage "Origin push basarisiz oldu."
  }

  Write-Host "GitHub publish tamamlandi." -ForegroundColor Green
}
finally {
  Pop-Location
}
