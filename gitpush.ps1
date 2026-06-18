# ====================================================================
# gitpush.ps1 — OmniTrace: degisiklikleri commit edip GitHub'a pushlar.
#   Repo: github.com/hdhalilhd/Omnitraceglobal
#
# Kullanim:
#   .\gitpush.ps1 "commit mesaji"
#
# Not: Sirlar (secrets.php, deploy.ps1, .env) .gitignore'da oldugu icin
#      asla pushlanmaz. Once .gitignore'u bozma.
# ====================================================================
param([Parameter(Mandatory=$true)][string]$Message)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Degisiklik yok — commit/push atlandi." -ForegroundColor Yellow
    exit 0
}

Write-Host "Commit'lenecek dosyalar:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }

git commit -m $Message
git push origin main
Write-Host "`n✓ Push tamam → https://github.com/hdhalilhd/Omnitraceglobal" -ForegroundColor Green
