function Resolve-PythonPath {
  $commonPaths = @(
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python312\python.exe",
    "C:\Users\$env:USERNAME\AppData\Local\Programs\Python\Python313\python.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  $fromPath = Get-Command python -ErrorAction SilentlyContinue
  if ($fromPath) {
    try {
      & $fromPath.Source --version *> $null
      if ($LASTEXITCODE -eq 0) {
        return $fromPath.Source
      }
    }
    catch {
    }
  }

  return $null
}

function Resolve-NodePath {
  $fromPath = Get-Command node -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $commonPaths = @(
    "C:\Program Files\nodejs\node.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Resolve-NpmPath {
  $commonPaths = @(
    "C:\Program Files\nodejs\npm.cmd"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  $fromPath = Get-Command npm -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  return $null
}

function Resolve-DockerPath {
  $fromPath = Get-Command docker -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $commonPaths = @(
    "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Resolve-GitPath {
  $fromPath = Get-Command git -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $commonPaths = @(
    "C:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\bin\git.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Resolve-GitHubCliPath {
  $fromPath = Get-Command gh -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $commonPaths = @(
    "C:\Program Files\GitHub CLI\gh.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}

function Resolve-CloudflaredPath {
  $root = Resolve-Path (Join-Path $PSScriptRoot "..")
  $localPath = Join-Path $root ".demo-runtime\bin\cloudflared.exe"
  if (Test-Path $localPath) {
    return $localPath
  }

  $fromPath = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($fromPath) {
    return $fromPath.Source
  }

  $commonPaths = @(
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe"
  )

  foreach ($path in $commonPaths) {
    if (Test-Path $path) {
      return $path
    }
  }

  return $null
}
