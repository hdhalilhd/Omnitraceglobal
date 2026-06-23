<?php
/* ====================================================================
   musteri_kurulum.php — Müşteri–Cihaz yetki matrisi tabloları (TEK SEFER)
   --------------------------------------------------------------------
   Tarayıcıda bir kez açın: https://omnitraceglobal.com/musteri_kurulum.php
   Oluşturur:
     musteriler     (id, kod[login], sifre_hash, ad, aktif)
     musteri_cihaz  (musteri_id, device_id)  ← 8×8 yetki MATRİSİ
     araclar        (device_id UNIQUE …)      ← cihaz kütüğü (yoksa)
   + örnek müşteri (CUST-001) device 1'e yetkili.
   Güvenlik: secrets.php (DB) burada require edilir; parolalar password_hash ile.
   ==================================================================== */
require __DIR__ . '/secrets.php';   // $host,$dbname,$username,$password (git'te yok)
header("Content-Type:text/plain; charset=utf-8");

try {
  $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

  $pdo->exec("CREATE TABLE IF NOT EXISTS musteriler (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kod VARCHAR(40) NOT NULL UNIQUE,
    sifre_hash VARCHAR(255) NOT NULL,
    ad VARCHAR(120) DEFAULT NULL,
    aktif TINYINT NOT NULL DEFAULT 1,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "musteriler tablosu hazir.\n";

  $pdo->exec("CREATE TABLE IF NOT EXISTS musteri_cihaz (
    musteri_id INT NOT NULL,
    device_id INT NOT NULL,
    UNIQUE KEY uq_md (musteri_id, device_id),
    KEY k_m (musteri_id), KEY k_d (device_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "musteri_cihaz (yetki matrisi) tablosu hazir.\n";

  $pdo->exec("CREATE TABLE IF NOT EXISTS araclar (
    id INT AUTO_INCREMENT PRIMARY KEY,
    device_id INT NOT NULL UNIQUE,
    sase_no VARCHAR(50), ad VARCHAR(100), model VARCHAR(50),
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "araclar (cihaz kutugu) tablosu hazir.\n";

  /* ── Admin Yapılandırma Konsolu tabloları (admin.html) ── */
  $pdo->exec("CREATE TABLE IF NOT EXISTS arac_tipleri (
    cid VARCHAR(24) PRIMARY KEY,
    musteri_kod VARCHAR(40) NOT NULL,
    ad VARCHAR(128) NOT NULL,
    bitrate INT NOT NULL DEFAULT 250,
    can_tipi VARCHAR(10) NOT NULL DEFAULT 'classic',
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY k_kod (musteri_kod)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "arac_tipleri tablosu hazir.\n";

  $pdo->exec("CREATE TABLE IF NOT EXISTS can_parametreleri (
    cid VARCHAR(24) PRIMARY KEY,
    vt_cid VARCHAR(24) NOT NULL,
    node INT NOT NULL, pdo VARCHAR(2) NOT NULL, cob INT NOT NULL,
    byte_i INT NOT NULL, bit_i INT NOT NULL, uzunluk INT NOT NULL,
    tip VARCHAR(8) NOT NULL, endian VARCHAR(8) NOT NULL,
    disp VARCHAR(160) NOT NULL, degisken VARCHAR(64) NOT NULL,
    min_d DOUBLE DEFAULT 0, max_d DOUBLE DEFAULT 0, olcek DOUBLE DEFAULT 1, ofset DOUBLE DEFAULT 0,
    birim VARCHAR(24) DEFAULT '', widget VARCHAR(16) DEFAULT 'gauge', buffer VARCHAR(16) DEFAULT 'slow',
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY k_vt (vt_cid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "can_parametreleri tablosu hazir.\n";

  $pdo->exec("CREATE TABLE IF NOT EXISTS firma_gorunurluk (
    musteri_kod VARCHAR(40) PRIMARY KEY,
    views TEXT, params TEXT,
    updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  echo "firma_gorunurluk tablosu hazir.\n";

  /* örnek müşteri — yoksa oluştur */
  $kod = "CUST-001"; $parola = "Demo#2026";
  $st = $pdo->prepare("SELECT id FROM musteriler WHERE kod=?"); $st->execute([$kod]);
  if (!$st->fetch()) {
    $h = password_hash($parola, PASSWORD_DEFAULT);
    $pdo->prepare("INSERT INTO musteriler (kod,sifre_hash,ad) VALUES (?,?,?)")
        ->execute([$kod, $h, "Ornek Musteri"]);
    $mid = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT IGNORE INTO araclar (device_id,sase_no,ad,model) VALUES (1,'204MB100134','Gercek Forklift','EP02')")->execute();
    $pdo->prepare("INSERT IGNORE INTO musteri_cihaz (musteri_id,device_id) VALUES (?,1)")->execute([$mid]);
    echo "Ornek musteri olusturuldu -> kod: $kod  sifre: $parola  (device 1 yetkili)\n";
  } else {
    echo "Ornek musteri (CUST-001) zaten var.\n";
  }
  echo "\nKURULUM TAMAM. Guvenlik icin bu dosyayi sunucudan SILEBILIRSINIZ.";
} catch (PDOException $e) {
  http_response_code(500);
  echo "HATA: " . $e->getMessage();
}
