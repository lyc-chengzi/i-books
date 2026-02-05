$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$frontendDir = Join-Path $repoRoot 'frontend'

Write-Host "[iBooks] Building frontend..." -ForegroundColor Cyan
Set-Location $frontendDir

# Ensure pnpm exists
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  throw "pnpm not found. Install Node.js + enable pnpm (corepack) or install pnpm globally."
}

pnpm install
pnpm build

Write-Host "[iBooks] Frontend build complete: $frontendDir\dist" -ForegroundColor Green
