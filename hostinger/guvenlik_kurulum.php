<?php
/* ====================================================================
   guvenlik_kurulum.php — Cihaz kimlik güvenliği için migration (TEK SEFER)
   --------------------------------------------------------------------
   Tarayıcıda bir kez açın: https://omnitraceglobal.com/guvenlik_kurulum.php
   - araclar.device_key  : cihaz başına GİZLİ anahtar (HMAC için; hatta hiç çıkmaz)
   - araclar.last_ts     : son kabul edilen timestamp (replay koruması)
   - standart tablosuna tüm zengin telemetri kolonları (yoksa) — HMAC'li veri buraya yazılır
   İdempotent: var olan kolona dokunmaz.
   ==================================================================== */
require __DIR__ . '/secrets.php';
header("Content-Type:text/plain; charset=utf-8");

function colExists($pdo, $t, $c){
  $s = $pdo->prepare("SELECT 1 FROM information_schema.COLUMNS
                      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?");
  $s->execute([$t, $c]); return (bool)$s->fetch();
}
try {
  $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

  /* araclar güvenlik kolonları */
  if (!colExists($pdo, 'araclar', 'device_key')) {
    $pdo->exec("ALTER TABLE araclar ADD COLUMN device_key VARCHAR(64) DEFAULT NULL");
    echo "araclar.device_key eklendi.\n";
  } else echo "araclar.device_key zaten var.\n";
  if (!colExists($pdo, 'araclar', 'last_ts')) {
    $pdo->exec("ALTER TABLE araclar ADD COLUMN last_ts BIGINT NOT NULL DEFAULT 0");
    echo "araclar.last_ts eklendi.\n";
  } else echo "araclar.last_ts zaten var.\n";

  /* standart zengin kolonlar (veri_al.php beyaz listesiyle aynı) */
  $intCols = ['batarya_soc','calisma_saati','motor_sic_sag','motor_sic_sol','surucu_sic',
    'motor_akim_sag','motor_akim_sol','dc_akim','motor_rpm_sag','motor_rpm_sol',
    'gaz_talep','aci_sensor','aci_deger','koltuk','hiz_modu','pompa_rpm','pompa_motor_sic',
    'pompa_surucu_sic','lift','tilt','side_shift','ops','pompa_mod','timer',
    'KOLTUK_DURUM','SAG_MOTOR_RPM','SOL_MOTOR_RPM','STEERING'];
  $added = 0;
  foreach ($intCols as $c) {
    if (!colExists($pdo, 'standart', $c)) { $pdo->exec("ALTER TABLE standart ADD COLUMN `$c` INT DEFAULT NULL"); $added++; }
  }
  if (!colExists($pdo, 'standart', 'gercek_hiz')) { $pdo->exec("ALTER TABLE standart ADD COLUMN `gercek_hiz` DOUBLE DEFAULT NULL"); $added++; }
  echo "standart: $added yeni kolon eklendi (zaten varsa atlandı).\n";

  echo "\nGUVENLIK KURULUMU TAMAM. Bu dosyayi sunucudan silebilirsiniz.";
} catch (PDOException $e) {
  http_response_code(500); echo "HATA: " . $e->getMessage();
}
