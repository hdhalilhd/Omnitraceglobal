# Forklift Telemetri — Docker'SIZ yerel çalıştırma (tek komut)
# Kullanım:  powershell -ExecutionPolicy Bypass -File .\start-local.ps1
#
# Başlatır: yerel PostgreSQL (geçici trust küme) + MQTT broker + backend + simülatör + frontend
# Her biri AYRI pencerede açılır (bu pencereyi kapatınca durmaz).
# Tarayıcı: http://localhost:5173   (admin@forklift.local / admin123)

$root   = $PSScriptRoot
$pgbin  = "C:\Program Files\PostgreSQL\17\bin"
$pgdata = Join-Path $root ".localdb"

function PortOpen($p) {
  (Test-NetConnection localhost -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded
}

# 1) PostgreSQL (initdb ile oluşturulmuş geçici trust küme, port 5432)
if (-not (Test-Path $pgdata)) {
  Write-Host "PostgreSQL kümesi oluşturuluyor (ilk kez)..." -ForegroundColor Yellow
  & "$pgbin\initdb.exe" -D $pgdata -U forklift --auth=trust --locale=C -E UTF8 | Out-Null
}
if (-not (PortOpen 5432)) {
  Write-Host "PostgreSQL başlatılıyor (5432)..." -ForegroundColor Cyan
  & "$pgbin\pg_ctl.exe" start -D $pgdata -o "-p 5432" -l "$pgdata\server.log" | Out-Null
  Start-Sleep -Seconds 3
  # forklift DB yoksa oluştur + şema/seed (ilk kurulum)
  $exists = & "$pgbin\psql.exe" -U forklift -p 5432 -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='forklift'"
  if (-not $exists) {
    Write-Host "İlk kurulum: forklift DB + şema + seed..." -ForegroundColor Yellow
    & "$pgbin\createdb.exe" -U forklift -p 5432 forklift
    Push-Location "$root\backend"
    npm run db:push; npm run db:plainpg; npm run db:seed
    Pop-Location
  }
} else {
  Write-Host "PostgreSQL zaten çalışıyor (5432)" -ForegroundColor Green
}

# 2) Servisleri ayrı pencerelerde başlat
function Run($title, $dir, $cmd) {
  Start-Process pwsh -ArgumentList "-NoExit", "-Command",
    "`$host.UI.RawUI.WindowTitle='$title'; Set-Location '$dir'; $cmd"
}
Run "MQTT Broker" "$root\backend"  "npm run broker"
Start-Sleep -Seconds 2
Run "Backend API" "$root\backend"  "npm run dev"
Start-Sleep -Seconds 2
Run "Simulator"   "$root\backend"  "npm run simulate"
Run "Frontend"    "$root\frontend" "npm run dev"

Write-Host ""
Write-Host "Hazır! Tarayıcı: http://localhost:5173  (admin@forklift.local / admin123)" -ForegroundColor Green
Write-Host "Durdurmak için açılan 4 pencereyi kapatın; PostgreSQL'i durdurmak için: stop-local.ps1" -ForegroundColor DarkGray
