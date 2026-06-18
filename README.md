# Forklift Telemetri

Elektrikli forkliftlerin **yürüyüş (traction)** ve **pompa (pump)** CAN sürücülerinden gelen
PDO verilerini ESP32 + CAN kartı üzerinden toplayıp **canlı izleyen**, **geçmişe dönük raporlayan**
ve **hata kodlarını loglayan** web uygulaması.

```
ESP32 (ham CAN frame) --MQTT--> Mosquitto --> Backend (decode + DB + WebSocket) --> React Dashboard
                                                       |
                                              PostgreSQL + TimescaleDB
```

- **Canlı veri:** MQTT → backend → WebSocket (~1 Hz)
- **Çözümleme sunucuda:** ESP32 ham frame yollar, CAN map sunucuda → PDO map değişince ESP32'yi
  yeniden flaşlamaya gerek yok.
- **Veritabanı:** PostgreSQL + TimescaleDB (OSS, ücretsiz). `telemetry` hypertable +
  continuous aggregate ile hızlı raporlama.

---

## Gereksinimler

- **Docker Desktop** (PostgreSQL/TimescaleDB + Mosquitto için)
- **Node.js 20+** (backend & frontend)
- (Opsiyonel) **PlatformIO** — ESP32 firmware için

---

## Kurulum & Çalıştırma

### 1) Altyapıyı başlat (DB + MQTT broker)
```bash
docker compose up -d
```
- PostgreSQL/TimescaleDB → `localhost:5432`
- Mosquitto → `localhost:1883`
- Adminer (DB arayüzü) → `http://localhost:8080`

### 2) Backend
```bash
cd backend
npm install
cp .env.example .env          # gerekirse düzenleyin (.env hazır geliyor)
npm run db:migrate            # Prisma tabloları (ilk seferde migration oluşturur)
npm run db:timescale          # telemetry hypertable + aggregate'ler
npm run db:seed               # admin + sinyaller + hata kodları + demo araç
npm run dev                   # http://localhost:4000
```
> İlk kurulumda `db:migrate` migration adı sorabilir (örn. `init`). Sonraki kurulumlarda
> `npm run db:setup` (migrate deploy + timescale + seed) tek komutla çalışır.

### 3) Frontend
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173
```
**Giriş:** `admin@forklift.local` / `admin123`

### 4) Donanımsız test — simülatör
Gerçek ESP32 olmadan uçtan uca akışı görmek için (ayrı terminalde):
```bash
cd backend
npm run simulate              # demo araca sahte yürüyüş+pompa+EMCY verisi yayınlar
```
Tarayıcıda **Makineler → 304MB100104** açın; değerlerin canlı aktığını, Yürüyüş/Pompa
rozetlerini, ~20 sn'de bir düşen hata kaydını (Uyarılar) görmelisiniz.

---

## CAN map'i güncelleme (gerçek PDO map gelince)

Tek dosya: [`backend/src/canmap/signals.ts`](backend/src/canmap/signals.ts)

1. `NODE_IDS` (yürüyüş/pompa node ID).
2. `SIGNALS` dizisindeki her sinyal için `cobId, startByte, byteLength, dataType, scale, offset, unit`.
3. EMCY/heartbeat farklıysa ilgili COB-ID eşlemeleri.

Sonra: `cd backend && npm run db:seed` (sinyal tanımlarını DB'ye yansıtır). Decoder, dashboard
ve raporlar otomatik uyum sağlar. Testler: `npm test`.

Hata kodu sözlüğü: [`backend/prisma/seed.ts`](backend/prisma/seed.ts) içindeki `FAULT_CODES`.

---

## Proje yapısı

```
forklift-telemetri/
├─ docker-compose.yml          Postgres+Timescale, Mosquitto, Adminer
├─ mosquitto/config/           broker yapılandırması
├─ backend/                    Node + Express + Prisma + Socket.IO + MQTT
│  ├─ src/canmap/              ★ CAN map (signals.ts) + decoder + test
│  ├─ src/ingest/mqtt.ts       MQTT abone + decode + DB + WS yayın
│  ├─ src/api/                 auth, vehicles, dashboard, reports, errors, signals
│  ├─ src/simulator.ts         sahte frame yayıncısı
│  └─ prisma/                  şema + applyTimescale.ts + seed.ts
├─ frontend/                   React + Vite + Tailwind
│  └─ src/pages/               Login, Home, Machines, MachineDetail, Alerts, Reports
└─ firmware/                   ESP32 (PlatformIO) — CAN oku → MQTT publish
```

---

## Notlar / sonraki adımlar

- **Veritabanı alternatifleri:** Şu an TimescaleDB OSS (ücretsiz, self-host). Yönetilen
  istenirse **Timescale Cloud**'a sancısız geçilir. Bkz. plan dosyası.
- **Grafik kütüphanesi:** Raporlarda `recharts` kullanıldı (kolay entegrasyon). Çok yoğun
  canlı grafiklerde `uPlot`'a geçilebilir.
- **Harita:** Forkliftler kapalı alandaysa GPS opsiyonel; şu an konum metin alanı olarak tutulur.
- **Güvenlik:** Mosquitto geliştirmede anonim. Prod'da kullanıcı/parola + TLS, JWT_SECRET değişimi.
- **Zaman damgası:** ESP32 iskeleti `millis()` kullanır; sahada NTP/RTC ile gerçek zaman önerilir.
