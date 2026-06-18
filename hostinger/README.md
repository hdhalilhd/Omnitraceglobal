# Hostinger (PHP + MySQL) — Online Telemetri

Cihaz → İnternet → PHP → MySQL → Web Panel. Tamamı Hostinger paylaşımlı hosting'de çalışır.

```
STM32 + SIM800L --HTTP GET--> index.php?api=ekle --> MySQL (standart)
Tarayıcı / Android <------- index.php (?api=veri) <-- MySQL
Araç-cihaz eşleştirme: index.php (?api=arac_*)  <-->  MySQL (araclar)
```

## ⭐ TEK DOSYA / TEK LİNK — `index.php`
Artık her şey tek dosyada. Tek adres:  **https://omnitraceglobal.com/**

`index.php` hem **arayüzü** (sekmeli: *Canlı Panel* + *Araç Yönetimi*) hem de tüm
**API**'leri sunar. Aynı linke `?api=...` ekleyerek işlemleri yapar:

| İstek | Görev |
|---|---|
| `index.php` (parametresiz) | HTML arayüz (panel + yönetim) |
| `index.php?api=ekle` (GET/POST) | Cihaz verisini `standart`a yazar |
| `index.php?api=veri&device_id=&limit=` (GET) | Son kayıtlar (JSON) |
| `index.php?api=arac_liste` (GET) | Araç listesi (JSON) |
| `index.php?api=arac_ekle` (POST) | Araç ekle/güncelle |
| `index.php?api=arac_sil&id=` | Araç sil |

> Eski 5 dosya (`veri_al.php`, `veri_oku.php`, `araclar.php`, `yonetim.php`, `panel.php`)
> hâlâ çalışır ama artık gerekmez — `index.php` hepsinin yerine geçer. İstersen sadece
> `index.php`'yi yükle.

## 1) MySQL tabloları (phpMyAdmin → SQL)
```sql
-- Telemetri verisi
CREATE TABLE IF NOT EXISTS standart (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  DEVICE_ID INT, KOLTUK_DURUM INT,
  SAG_MOTOR_RPM INT, SOL_MOTOR_RPM INT, STEERING INT
);

-- Araç / cihaz eşleştirme
CREATE TABLE IF NOT EXISTS araclar (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id INT NOT NULL UNIQUE,
  sase_no VARCHAR(50), ad VARCHAR(100), model VARCHAR(50),
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 2) DB bilgileri
`index.php` en üstündeki `$dbname/$username/$password` zaten dolu. (Değişirse burada güncelle.)

## 3) Kullanım akışı
1. **https://omnitraceglobal.com/** → *Araç Yönetimi* sekmesi → Cihaz ID=1, şase/ad/model → Kaydet.
2. Test verisi gönder — tarayıcı adres çubuğuna (`http://`, https değil):
   `http://omnitraceglobal.com/index.php?api=ekle&DEVICE_ID=1&KOLTUK_DURUM=1&SAG_MOTOR_RPM=1450&SOL_MOTOR_RPM=1460&STEERING=512`
   → `{"status":"success",...}` görmelisin.
3. **https://omnitraceglobal.com/** → *Canlı Panel* sekmesi → aracı seç → veriyi **canlı** gör.

## 4) STM32 cihazı (firmware/stm32)
`Core/Src/main.c` üstünde: `DEVICE_ID` (yönetimdeki ile aynı), `SERVER_HOST="omnitraceglobal.com"`,
`SERVER_PORT=80`, `VERI_AL_PATH="/index.php?api=ekle"`. Cihaz `CanApp_Extract` ile CAN'den
koltuk/sağ-sol rpm/direksiyon çıkarıp **GET** ile gönderir (kanıtlanmış ThingSpeak AT akışı).

> ⚠️ DİKKAT (eksikler): (a) `CanApp_Extract` içindeki COB-ID/bayt konumları **TASLAK** —
> gerçek PDO map gelince düzeltilecek. (b) SIM800L **düz HTTP (port 80)** kullanır; ThingSpeak'in
> port 80'de çalıştığı kanıtlandığı için sorun beklenmiyor — yine de `http://...` linkinin
> `https://`'e zorlanmadığını teyit et (zorlarsa `.htaccess` ile çözeriz).
