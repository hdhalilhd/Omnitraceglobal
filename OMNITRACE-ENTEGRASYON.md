# OmniTrace — Veri Entegrasyonu & Çalışma Notları

> Bu dosya **her işlemde güncellenir**. Amaç: bu repodaki canlı veri-alma sistemini (STM32 +
> SIM800L → sanal sunucu → site) bozmadan, **bizim animasyonlu OmniTrace sitemize** entegre etmek.
> Başkası repoya baktığında en güncel durumu buradan okuyabilmeli.

---

## 0) İş akışı kuralları (değişmez)

1. **Başlarken:** repo `git clone` / `git pull` ile güncel sürüm alınır, sonra çalışılır.
2. **Çalışırken:** bu reponun **dosya formatı/düzeni bozulmaz**; mevcut dosyalara ekleme yapılır.
3. **Bizim lokal sitemizin** (`omnitrace/`) animasyonları ve düzeni **bozulmaz** — sadece veri-alma katmanı eklenir.
4. **Bitince:** değişiklikler commit + `git push origin main` (yardımcı: `gitpush.ps1 "mesaj"`).
5. **Sırlar** (`hostinger/secrets.php`, `hostinger/deploy.ps1`, `.env`) `.gitignore`'da — asla pushlanmaz.
6. Her işlem bu dosyanın **Değişiklik Günlüğü** bölümüne yazılır.

---

## 1) Repodaki sistem — uçtan uca mimari

Bu repo (`hdhalilhd/Omnitraceglobal`) iki paralel uygulama barındırır:

### A. Tam yığın (full-stack) sürüm — geliştirme/ölçek için
```
ESP32/STM32 (ham CAN frame) --MQTT--> Mosquitto --> Backend (decode+DB+WS) --> React Dashboard
                                                          |
                                                 PostgreSQL + TimescaleDB
```
- `backend/` — Node + Express + Prisma + Socket.IO + MQTT abonesi; CAN decode **sunucuda** (`src/canmap/`), DB'ye yazar, WebSocket ile ~1 Hz canlı yayın.
- `frontend/` — React + Vite + Tailwind SPA (`src/lib/api.ts` → `VITE_API_BASE`, `src/lib/socket.ts` → WS).
- `firmware/stm32/` + `firmware/arduino/` — cihaz tarafı (CAN oku → gönder).
- `docker-compose*.yml`, `mosquitto/` — altyapı.
- **Not:** Bu yığın Docker/VPS gerektirir; Hostinger paylaşımlı hosting'de çalışmaz.

### B. Hostinger (PHP + MySQL) sürümü — **canlıdaki sade köprü** ⭐
```
STM32 + SIM800L --düz HTTP GET--> index.php?api=ekle --> MySQL (standart)
Tarayıcı       <----- index.php?api=veri (JSON) --------- MySQL
```
- Tamamı Hostinger paylaşımlı hosting'de çalışır (PHP 8 + MySQL, PDO + prepared statement).
- **Tek dosya/tek link:** `hostinger/index.php` hem arayüz hem tüm API'ler (`?api=ekle|veri|arac_*`).
- Eski ayrık dosyalar da çalışır: `veri_al.php` (yaz), `veri_oku.php` (oku), `vm_proxy.php` (VM proxy), `araclar.php`, `panel.php`, `yonetim.php`, `kurulum.php` (kolon ekler).
- `dashboard.html` — zengin, gauge'lı referans panel (bizim entegre edeceğimiz veri-alma mantığı **burada**).

---

## 2) Veri kaynakları — İKİ YOL

| | Yol A — Hostinger MySQL | Yol B — Google Cloud VM ⭐ |
|---|---|---|
| Sunucu | omnitraceglobal.com (Hostinger) | `34.175.200.205` (düz HTTP, port 80) |
| Cihaz nereye yazar | `index.php?api=ekle` / `veri_al.php` | VM'deki MQTT köprüsü → VM MySQL |
| Site nereden okur | `index.php?api=veri` / `veri_oku.php` | `vm_proxy.php` (sunucu-taraflı proxy) |
| Kolonlar | sadece 5 eski kolon* | **tüm zengin parametreler** (batarya, sıcaklık, akım…) |
| DEVICE_ID | 2 (örnek) | **1** |

\* Hostinger `standart` tablosu varsayılan 5 kolon: `KOLTUK_DURUM, SAG_MOTOR_RPM, SOL_MOTOR_RPM, STEERING`.
`kurulum.php` çalıştırılırsa tüm kolonlar eklenir. Zengin canlı veri pratikte **VM (Yol B)**'den gelir.

### Neden `vm_proxy.php` şart?
Site HTTPS (`https://omnitraceglobal.com`). VM düz HTTP. Tarayıcı HTTPS sayfadan HTTP isteğini
**mixed-content** olarak engeller. `vm_proxy.php` isteği **sunucu tarafında** VM'ye yapıp sonucu
sayfaya döndürür → mixed-content ve CORS sorunu kalkar. VM erişilemezse `{status:"error"}` döner.

```php
// vm_proxy.php — özet
$vm_host = "34.175.200.205"; $path = "/veri_oku.php";
$url = "http://{$vm_host}{$path}?" . http_build_query($_GET);   // device_id, limit aynen iletilir
echo @file_get_contents($url, false, $ctx /* timeout 5s */) ?: '{"status":"error",...}';
```

---

## 3) Veri sözleşmesi (data contract)

### Endpoint
```
GET vm_proxy.php?device_id=1&limit=1        # Hostinger'da (proxy)
GET /veri_oku.php?device_id=1&limit=1       # VM'nin kendi üzerindeyken
```

### Yanıt JSON
```json
{ "status":"success", "count":1,
  "data":[ { "ID":12345, "TIME":"2026-06-21 18:40:02", "DEVICE_ID":1,
             "batarya_soc":82, "motor_sic_sag":46, "gercek_hiz":7.4, ...,
             "seconds_ago":3 } ] }
```
- `data[0]` = **en son kayıt** (ORDER BY ID DESC LIMIT 1).
- `seconds_ago` = kaydın yaşı (saniye). **online** = `seconds_ago < 10`, aksi halde **offline**.

### `standart` tablosu kolonları (beyaz liste — `veri_al.php`)
`batarya_soc, calisma_saati, motor_sic_sag, motor_sic_sol, surucu_sic, motor_akim_sag,
motor_akim_sol, dc_akim, motor_rpm_sag, motor_rpm_sol, gercek_hiz(float), gaz_talep, aci_sensor,
aci_deger, koltuk, hiz_modu, pompa_rpm, pompa_motor_sic, pompa_surucu_sic, lift, tilt, side_shift,
ops, pompa_mod, timer` (+ eski: `KOLTUK_DURUM, SAG_MOTOR_RPM, SOL_MOTOR_RPM, STEERING`).

### Frekans katmanları (STM32 buffer mimarisine birebir)
| Katman | Hız | Anahtarlar |
|---|---|---|
| ⚡ Hızlı | 2 Hz (8sn ort.) | motor_akim_*, dc_akim, motor_rpm_*, gercek_hiz, pompa_rpm, gaz_talep, aci_*, lift |
| ⏱ Orta | 1 Hz | koltuk, hiz_modu |
| 🌡 Yavaş | 1/dk | batarya_soc, motor_sic_*, surucu_sic, pompa_*_sic |
| ⌚ Çok Yavaş | 1/saat | calisma_saati |
| 🧪 Test | sn sayacı | timer (VPS bağlantı testi) |

---

## 4) Çekirdek veri-alma mekanizması (referans: `dashboard.html`)

```js
// Endpoint seçimi: VM'nin kendi üstündeysen direkt, değilsen proxy
const VPS_ENDPOINT = location.hostname === '34.175.200.205' ? '/veri_oku.php' : 'vm_proxy.php';

// 2 saniyede bir poll → son satırı parametre hedeflerine yaz → animasyon yumuşatır
function startReal(deviceId){
  const poll = async () => {
    const r = await fetch(VPS_ENDPOINT+'?device_id='+deviceId+'&limit=1', {cache:'no-store'});
    const row = (await r.json()).data?.[0]; if(!row) return;
    PARAMS.forEach(p => { let v = row[p.key] ?? row[p.key.toUpperCase()];
      if (v!=null && v!=='' && !isNaN(v)) sim[p.key].target = Number(v); });   // hedef = gerçek
  };
  poll(); setInterval(poll, 2000);
}
```
**Kritik fikir:** Gerçek veri animasyonu **bozmaz** — gelen değer sadece "hedef" olur, mevcut
yumuşatma döngüsü (`value += (target-value)*0.08`) değeri oraya akıtır. Sim ile gerçek aynı
boru hattını kullanır; tek fark hedefin nereden geldiği.

---

## 5) Bizim sistemimiz — `omnitrace/` (animasyonlu OmniTrace)

- **Premium, tek-dosya HTML** sürümü; GSAP + Three.js sinematik animasyonlar, açık "TrackLink" teması.
- `index.dev.html` (kaynak) → `index.html` (build) + `index-tek-dosya.html` (gömülü).
- `telemetry.html` — bizim dashboard'umuz (sidebar görünümleri: fleet/vehicles/analytics/alerts/
  drivers/maintenance/settings; gece modu, geofence, vb.). Mobil reflow yapıldı.
- **Mevcut veri katmanı:** `telemetry.html` head'inde senkron XHR ile `data.json` okunur
  (`window.__OT_REMOTE`); `http(s)`'te dosyayı çeker, `file://`'de gömülü demoya düşer. Araçlar
  kurulduktan sonra `__OT_REMOTE` ile override edilir. → **Entegrasyonun bağlanacağı doğal nokta burası.**

---

## 6) Entegrasyon planı (yapılacak)

**Hedef:** `omnitrace/telemetry.html`'e, dashboard.html'deki **VM canlı veri** mantığını ekle.
Animasyon/düzen **hiç** değişmeyecek; sadece veri kaynağı zenginleşecek.

1. `vm_proxy.php`'yi bizim deploy setimize ekle (Hostinger köküne gidecek).
2. `telemetry.html`'e opsiyonel **canlı poll katmanı**: `VPS_ENDPOINT` + 2sn `fetch` + `standart`
   kolon → bizim araç modelimiz eşlemesi. Gelen değerler mevcut animasyon hedeflerine yazılır.
3. **Online/offline** rozeti `seconds_ago < 10` ile; veri yoksa sessizce mevcut demo/mock sürer
   (graceful degradation — `file://` ve VM kapalıyken site bozulmaz).
4. DEVICE_ID 1 = gerçek araç (VM). Diğerleri demo olarak kalır.
5. Playwright ile doğrula: animasyonlar akıyor mu, canlı değer bağlanıyor mu, hata var mı.
6. Kontrol → onay → `git push` → canlı.

**Bozulmayacaklar:** boot animasyonu, sinematik forklift, hero, sahne navigasyonu, gece modu,
geofence, mevcut görünümler, mobil reflow, i18n. Eklenen kod tamamen **opsiyonel/additive**.

---

## 7) Değişiklik Günlüğü

| Tarih | İşlem | Dosyalar | Durum |
|---|---|---|---|
| 2026-06-21 | Repo klonlandı, mimari uçtan uca incelendi, bu MD oluşturuldu | `OMNITRACE-ENTEGRASYON.md` | ✅ |
| 2026-06-21 | **VM canlı veri-alma entegrasyonu tamamlandı** (aşağıda detay) | `omnitrace/telemetry.html`, `omnitrace/vm_proxy.php` | ✅ |
| 2026-06-21 | Site repoya eklendi + GitHub push (`91d11b9`) | `omnitrace/*` | ✅ |
| 2026-06-21 | **CANLIYA ALINDI** — FTP ile `index.html` + `telemetry.html` Hostinger `public_html`e yüklendi | canlı | ✅ |
| 2026-06-21 | **Müşteri–Cihaz yetki matrisi (güvenlik) — BACKEND** kuruldu, canlıda test edildi | `hostinger/musteri_*.php` | ✅ |

### Müşteri–Cihaz yetki matrisi (8×8 güvenlik) — Backend (2026-06-21)
**Amaç:** Her müşteri SADECE yetkili device_id'lerini görsün; yetkisiz aracı asla göremesin. Sunucu-taraflı, kurcalanamaz.
**Tablolar** (`musteri_kurulum.php` ile tek seferde): `musteriler`(id,kod,sifre_hash,ad,aktif) · `musteri_cihaz`(musteri_id,device_id = **yetki matrisi**) · `araclar`(device_id UNIQUE = cihaz kütüğü).
**API** (`musteri_api.php`, hepsi PHP+MySQL, secrets.php + musteri_secret.php require eder):
- `?action=login` {kod,sifre} → `password_verify` → **HMAC-SHA256 imzalı durumsuz token** (12s) + yetkili cihaz listesi.
- `?action=veri` (Bearer token) {device_id} → yetki **her istekte DB'den taze** kontrol; device_id ∈ matris değilse **403**; yetkiliyse VM'den (`34.175.200.205`) server-side proxy. ← güvenlik kapısı.
- `?action=cihazlar` → yetkili cihazlar. Yönetim: `admin_liste/admin_musteri_ekle/admin_cihaz_ata` (ayrı `$ADMIN_KEY`) → elle SQL gerekmez.
**Sırlar:** `musteri_secret.php` ($TOKEN_SECRET, $ADMIN_KEY) `.gitignore`'da, GitHub'a gitmez (şablon: `musteri_secret.example.php`).
**Canlı test (curl):** doğru login→token ✅ · yanlış şifre→401 ✅ · yetkili device 1→200+VM ✅ · **yetkisiz device 2→403** ✅ · token yok→401 ✅ · admin ekle/ata/liste ✅ · CUST-002 sadece device 2 görür (izolasyon) ✅.
**Örnek:** `CUST-001`/`Demo#2026`→device 1 · `CUST-002`/`Acme#2026`→device 2.
**Sıradaki:** `telemetry.html` çift-mod giriş — demo şifresi→mevcut mock filo; müşteri kodu→`musteri_api`'den sadece yetkili gerçek cihazlar (demolar gizli).
**Not (ingest):** Gerçek veri VM'de (ingest VM-taraflı, bizde erişim yok). Yetki/filtreleme **görüntüleme katmanında** (musteri_api) zorlandığı için kayıtsız/yetkisiz cihaz verisi hiçbir müşteriye ulaşmaz — "göstermeme" güvence altında. Cihaz-taraflı ret, VM erişimi gelince eklenebilir.

### Canlıya alma notları (2026-06-21)
- **FTP:** `ftp://92.113.28.98:21`, kullanıcı `u834087667.omnitraceglobal.com` (parola `deploy.ps1`'de, gitignore). FTP kökü **doğrudan `public_html`**.
- **Sadece 2 dosya** yüklendi (mobil-fix + VM entegrasyonu değişen tek dosyalar): `index.html` (183917B), `telemetry.html` (107210B). Alt sayfalar/assets/php backend **değişmedi → dokunulmadı**.
- ⚠️ **Canlı `.htaccess`'e DOKUNULMADI** — kritik: `DirectoryIndex index.html index.php` (animasyonlu ana sayfa önde) + `veri_al.php`'yi HTTPS zorlamasından muaf tutar (SIM800L düz HTTP POST yapabilsin). Bizim CSP'li `.htaccess` ile ezmek cihaz veri girişini + dashboard.html Leaflet'ini kırardı.
- **Canlı doğrulama:** ana sayfa render ✅ · `vm_proxy.php?device_id=1` → VM gerçek veri döndü (ID 9398, batarya_soc 70) ✅ · ama son kayıt 18 Haz (`seconds_ago≈264047`) → telemetry doğru şekilde "VM BAĞLANTISI KOPTU"/offline gösterdi ✅. Cihaz taze veri (≥`seconds_ago<10`) basınca otomatik "CANLI · VM #1" + değer akışı.
- **Sıradaki (cihaz tarafı):** STM32+SIM800L'in `veri_al.php`/VM'ye **düzenli** POST atması; ayrıca veride `lat/lng` var (40.7654, 29.9408) → ileride haritada gerçek konum gösterimi eklenebilir.

### Detay — VM canlı veri entegrasyonu (2026-06-21)
`telemetry.html`'e **3 additive** değişiklik (animasyon/düzen/i18n hiç bozulmadı):
1. **VEH[0] (FLT-0042) → canlı VM cihazı** (`rv.real=true; rv.deviceId=1`).
2. **Simülasyon döngüsüne guard:** `if (v.real && OT_LIVE.everOk) applyLive(v)` — gerçek veri rastgele
   yürüyüşü ezer; mevcut yumuşatma değerleri akıtmaya devam eder.
3. **Canlı poll modülü** (`OT_LIVE/OT_VPS/pollLive/applyLive/liveNum/liveChipUpdate`):
   - `OT_VPS` = VM üstündeyse `veri_oku.php`, değilse `vm_proxy.php` (dashboard.html ile aynı mantık).
   - **Sadece `http(s)`'te** poll (file:// → saf demo, konsol temiz — mevcut `data.json` deseniyle aynı).
   - 2 sn'de bir `fetch(OT_VPS+'?device_id=1&limit=1')` → `data[0]` → **eşleme:**
     `batarya_soc→soc · gercek_hiz→speed · motor_sic_sag→btemp · motor_akim_sag/dc_akim→mamp ·
     dc_akim→amp · lift→lift · aci_deger→steer · calisma_saati→hours`.
   - **Online/offline:** `seconds_ago<10` → chip "CANLI · VM #1" (yeşil); ≥10sn → araç `offline`,
     chip "VM BAĞLANTISI KOPTU". Veri hiç gelmezse (`everOk=false`) site %100 demo — **hiçbir şey değişmez**.
4. `vm_proxy.php` deploy setine eklendi (Hostinger köküne, telemetry.html ile yan yana).

**Doğrulama (Playwright):** (A) http+VM yok → demo, 0 pageerror ✅ · (B) http+sahte canlı VM →
"CANLI · VM #1", FLT-0042 popup canlı Hız **9.3 km/h** + SoC akışı, fault demo korunur ✅ ·
(C) seconds_ago=40 → "VM BAĞLANTISI KOPTU", offline ✅ · file:// QA: statik×6 + telemetry×2dil×7view **TEMİZ** ✅.

**Deploy:** `omnitrace-CANLI.zip` (5 MB) güncellendi. VM IP'si `34.175.200.205`, gerçek araç DEVICE_ID **1**.
