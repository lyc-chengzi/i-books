param(
  [switch]$SkipBuildFrontend
)

$ErrorActionPreference = 'Stop'

Write-Host "[iBooks] Local deployment runner" -ForegroundColor Cyan

if (-not $SkipBuildFrontend) {
  & (Join-Path $PSScriptRoot 'build-frontend.ps1')
}

& (Join-Path $PSScriptRoot 'setup-backend.ps1')
& (Join-Path $PSScriptRoot 'run-backend.ps1')
