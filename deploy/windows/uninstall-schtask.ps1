param(
  [string]$TaskName = 'iBooks'
)

$ErrorActionPreference = 'Stop'

Write-Host "[iBooks] Removing Scheduled Task: $TaskName" -ForegroundColor Cyan

schtasks /Query /TN $TaskName 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "[iBooks] Task not found; nothing to remove." -ForegroundColor Yellow
  exit 0
}

schtasks /Delete /TN $TaskName /F | Out-Null
Write-Host "[iBooks] Removed." -ForegroundColor Green
