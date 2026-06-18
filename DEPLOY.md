# Üretim Kurulumu (Tek VPS + Docker) — omnitraceglobal.com

Bu kılavuz, her şeyi (DB + backend + frontend + HTTPS) tek bir sunucuda online yapar.

```
İnternet
  Forklift (SIM800L) ──HTTP POST──> http://omnitraceglobal.com:4000/api/ingest/...
  Kullanıcılar      ──HTTPS──────> https://omnitraceglobal.com   (dashboard)
        VPS (Docker Compose):
          Caddy(443/80) → frontend statik + /api,/socket.io → backend
          backend(4000) → PostgreSQL+TimescaleDB
          Mosquitto (ESP32/MQTT için, opsiyonel)
```

## 1) VPS kirala
- Ubuntu 22.04/24.04, en az 2 vCPU / 2 GB RAM. (Hetzner CX22 ~4€/ay, DigitalOcean 6$/ay, veya TR sağlayıcı.)
- Sunucunun **public IP**'sini not al.

## 2) DNS yönlendirmesi (domain panelinden)
omnitraceglobal.com alan adı panelinde **A kaydı** ekle:
```
@     A    <VPS_IP>
www   A    <VPS_IP>
```
Yayılması birkaç dakika–saat sürebilir.

## 3) Sunucuya Docker kur
```bash
ssh root@<VPS_IP>
curl -fsSL https://get.docker.com | sh
```

## 4) Projeyi sunucuya koy
```bash
# git ile (repoyu bir git sunucusuna koyduysan) veya scp ile kopyala:
git clone <repo-adresin> forklift-telemetri   # ya da: scp -r ./forklift-telemetri root@<VPS_IP>:~
cd forklift-telemetri
```

## 5) Ortam değişkenleri
```bash
cp .env.prod.example .env
nano .env
```
Doldur:
```
DOMAIN=omnitraceglobal.com www.omnitraceglobal.com
POSTGRES_PASSWORD=güçlü-bir-parola
JWT_SECRET=$(openssl rand -hex 32)   # uzun rastgele bir değer yapıştır
INGEST_TOKEN=                        # şimdilik boş (cihaz açık ingest)
```

## 6) Firewall (port aç)
```bash
ufw allow 22 && ufw allow 80 && ufw allow 443 && ufw allow 4000 && ufw enable
```
- 80/443: dashboard (HTTPS) · 4000: SIM800L cihaz ingest (düz HTTP)

## 7) Başlat
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- İlk açılışta backend: şema + Timescale + seed otomatik kurulur.
- Caddy, Let's Encrypt'ten **otomatik HTTPS** sertifikası alır (80/443 açık olmalı).

## 8) Kontrol
- Dashboard: **https://omnitraceglobal.com** → giriş `admin@forklift.local` / `admin123`
- Sağlık: `curl https://omnitraceglobal.com/api/../health` veya `curl http://<VPS_IP>:4000/health`
- Loglar: `docker compose -f docker-compose.prod.yml logs -f backend`

## 9) STM32 cihazını yönlendir
`firmware/stm32/Core/Src/main.c`:
```c
#define DEVICE_SERIAL "STM32-SIM-001"        // DB'deki Device.serial ile aynı
#define BACKEND_HOST  "omnitraceglobal.com"   // veya doğrudan VPS IP
#define BACKEND_PORT  4000
```
Cihaz `http://omnitraceglobal.com:4000/api/ingest/STM32-SIM-001/can` adresine POST'lar.

## Sonrası / güvenlik
- **Admin parolasını değiştir** (şu an seed varsayılanı). İstersen kullanıcı yönetimi ekranı ekleriz.
- **INGEST_TOKEN** ata → `.env`'e yaz, yeniden başlat; STM32 POST'una `x-device-token` başlığını eklerim.
- **Yedek**: `docker compose -f docker-compose.prod.yml exec db pg_dump -U forklift forklift > yedek.sql` (cron'a bağlanabilir).
- Veriler `db_data` Docker volume'unda kalıcıdır (online).

## Güncelleme
```bash
git pull   # veya yeni dosyaları kopyala
docker compose -f docker-compose.prod.yml up -d --build
```
