$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$backendDir = Join-Path $repoRoot 'backend'
$venvDir = Join-Path $backendDir '.venv'

Write-Host "[iBooks] Setting up backend venv + deps..." -ForegroundColor Cyan
Set-Location $backendDir

if (-not (Test-Path $venvDir)) {
  python -m venv $venvDir
}

$pythonExe = Join-Path $venvDir 'Scripts\python.exe'
$pipExe = Join-Path $venvDir 'Scripts\pip.exe'

& $pipExe install --upgrade pip
& $pipExe install -r (Join-Path $backendDir 'requirements.txt')

# Optional: run migrations if alembic is configured
Write-Host "[iBooks] Running Alembic migrations..." -ForegroundColor Cyan
& $pythonExe -m alembic upgrade head

Write-Host "[iBooks] Backend setup complete." -ForegroundColor Green
