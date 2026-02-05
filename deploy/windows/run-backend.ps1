$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$backendDir = Join-Path $repoRoot 'backend'
$venvDir = Join-Path $backendDir '.venv'

Set-Location $backendDir

$pythonExe = Join-Path $venvDir 'Scripts\python.exe'
if (-not (Test-Path $pythonExe)) {
  throw "Backend venv not found at $venvDir. Run deploy\\windows\\setup-backend.ps1 first."
}

# Load .env if present (pydantic-settings also loads it, but this helps for child processes)
$envFile = Join-Path $backendDir '.env'
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
    $parts = $_.Split('=', 2)
    if ($parts.Length -eq 2) {
      [System.Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
  }
}

# Sensible defaults for local deployment
if (-not $env:IBOOKS_SERVE_FRONTEND) { $env:IBOOKS_SERVE_FRONTEND = 'true' }
if (-not $env:IBOOKS_FRONTEND_DIST_DIR) { $env:IBOOKS_FRONTEND_DIST_DIR = '../frontend/dist' }
if (-not $env:IBOOKS_CORS_ORIGINS) { $env:IBOOKS_CORS_ORIGINS = 'http://localhost:8000,http://127.0.0.1:8000' }

Write-Host "[iBooks] Starting backend on http://localhost:8000" -ForegroundColor Cyan
& $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
