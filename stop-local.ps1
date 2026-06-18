# Forklift Telemetri — yerel PostgreSQL kümesini durdurur.
# (Broker/backend/simülatör/frontend pencerelerini elle kapatın.)
$pgbin  = "C:\Program Files\PostgreSQL\17\bin"
$pgdata = Join-Path $PSScriptRoot ".localdb"
& "$pgbin\pg_ctl.exe" stop -D $pgdata -m fast
Write-Host "PostgreSQL durduruldu." -ForegroundColor Green
