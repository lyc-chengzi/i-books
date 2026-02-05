param(
  [string]$TaskName = 'iBooks'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$cmdPath = Join-Path $repoRoot 'deploy\windows\run-ibooks.cmd'

if (-not (Test-Path $cmdPath)) {
  throw "Expected file not found: $cmdPath"
}

# schtasks requires quoting in a very particular way; using cmd wrapper keeps it stable.
$taskRun = "cmd.exe /c `"`"$cmdPath`"`""

Write-Host "[iBooks] Installing Scheduled Task: $TaskName" -ForegroundColor Cyan

# Remove if exists
schtasks /Query /TN $TaskName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  schtasks /Delete /TN $TaskName /F | Out-Null
}

# Create at logon, run with highest privileges for reliable port binding / env.
# /IT makes it run only when user is logged on (good for desktop apps)
$schtasksArgs = @(
  '/Create',
  '/TN', $TaskName,
  '/SC', 'ONLOGON',
  '/RL', 'HIGHEST',
  '/TR', $taskRun,
  '/F'
)

schtasks @schtasksArgs | Out-Null

Write-Host "[iBooks] Installed. You can start it now with:" -ForegroundColor Green
Write-Host "  schtasks /Run /TN $TaskName"
