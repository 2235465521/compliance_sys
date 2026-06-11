# Sync local branches with GitHub after "unrelated histories" (做法 A)
# Run from repo root:  powershell -ExecutionPolicy Bypass -File .\scripts\git-sync-origin.ps1
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "==> fetch origin" -ForegroundColor Cyan
git fetch origin
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> checkout main & pull with --allow-unrelated-histories" -ForegroundColor Cyan
git checkout main
git pull origin main --allow-unrelated-histories --no-edit
if ($LASTEXITCODE -ne 0) {
  Write-Host "Pull failed (merge conflict?). Resolve conflicts, then: git add . && git commit && run this script again from push step." -ForegroundColor Yellow
  exit $LASTEXITCODE
}

Write-Host "==> push main" -ForegroundColor Cyan
git push -u origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> sync develop & push" -ForegroundColor Cyan
git checkout develop
git merge main -m "sync: merge main into develop"
git push -u origin develop
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> sync zpj & push" -ForegroundColor Cyan
git checkout zpj
git merge main -m "sync: merge main into zpj"
git push -u origin zpj
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done. Current branch:" -ForegroundColor Green
git branch --show-current
git status
