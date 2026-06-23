<?php
/*
 * veri_al.php — GÜVENLİ telemetri ingest (whitelist + HMAC imza + replay koruma)
 * ---------------------------------------------------------------------------------
 * Cihaz (STM32 + SIM800L) HTTP GET ile gönderir. Sıra:
 *   GET /veri_al.php?DEVICE_ID=<id>&ts=<unix>&<alan>=<deger>&...&sig=<hmac_hex>
 *   - sig  = HMAC_SHA256(device_key, "&sig="ten ÖNCEKİ tüm query string)  (hex, küçük harf)
 *   - sig PARAMETRESİ HER ZAMAN SONDA olmalı.
 *
 * Güvenlik kapıları (hepsi sunucu tarafında, atlanamaz):
 *   1) WHITELIST  : DEVICE_ID `araclar`'da yoksa → 403 (kayıtsız cihaz hiç alınmaz)
 *   2) HMAC       : device_key (gizli, hatta HİÇ gönderilmez) ile imza doğrulanır → 401
 *                   id kopyalansa bile anahtar olmadan geçerli imza üretilemez
 *   3) REPLAY     : ts ±300sn pencerede VE son ts'den büyük olmalı → 401
 * Anahtar admin panelinden üretilir; araclar.device_key + firmware'e gömülür.
 */
require __DIR__ . '/secrets.php';   // $host,$dbname,$username,$password

header("Content-Type:application/json; charset=utf-8");
function respond($c, $p){ http_response_code($c); echo json_encode($p, JSON_UNESCAPED_UNICODE); exit; }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET')
  respond(405, ["status" => "error", "message" => "Sadece GET"]);

/* büyük/küçük harf duyarsız alan bulucu (sadece GET) */
function field($names){ foreach ($names as $n) foreach ($_GET as $k => $v) if (strcasecmp((string)$k, $n) === 0) return $v; return null; }

$dev = field(["DEVICE_ID","device_id"]);
if ($dev === null || !is_numeric($dev)) respond(400, ["status" => "error", "message" => "DEVICE_ID gerekli"]);
$dev = (int)$dev;

try {
  $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]);

  /* ── 1) WHITELIST ── */
  $st = $pdo->prepare("SELECT device_key, last_ts FROM araclar WHERE device_id=?");
  $st->execute([$dev]); $reg = $st->fetch();
  if (!$reg)                     respond(403, ["status" => "error", "message" => "Taninmayan cihaz (kayitli degil)"]);
  if (empty($reg['device_key'])) respond(403, ["status" => "error", "message" => "Cihaz anahtari tanimsiz"]);
  $key = $reg['device_key'];

  /* ── 2) HMAC imza ── ("&sig="ten önceki ham query string imzalanır) */
  $qs = $_SERVER['QUERY_STRING'] ?? '';
  if (!preg_match('/^(.*)&sig=([0-9a-fA-F]{32,64})$/', $qs, $mm))
    respond(401, ["status" => "error", "message" => "Imza yok veya sig sonda degil"]);
  $signed = $mm[1]; $sig = strtolower($mm[2]);
  $calc = hash_hmac('sha256', $signed, $key);
  if (!hash_equals($calc, $sig)) respond(401, ["status" => "error", "message" => "Gecersiz imza"]);

  /* ── 3) REPLAY ── (ts imzanın içinde; tahrif edilemez) */
  $ts = (int)(field(["ts"]) ?? 0);
  $now = time();
  if ($ts <= 0 || abs($now - $ts) > 300) respond(401, ["status" => "error", "message" => "Zaman damgasi gecersiz/eski"]);
  if ($ts <= (int)$reg['last_ts'])        respond(401, ["status" => "error", "message" => "Tekrar (replay) reddedildi"]);

  /* ── Beyaz liste alanlar (panel/STM ile aynı) ── */
  $WHITE = [
   'batarya_soc'=>0,'calisma_saati'=>0,'motor_sic_sag'=>0,'motor_sic_sol'=>0,'surucu_sic'=>0,
   'motor_akim_sag'=>0,'motor_akim_sol'=>0,'dc_akim'=>0,'motor_rpm_sag'=>0,'motor_rpm_sol'=>0,
   'gercek_hiz'=>1,'gaz_talep'=>0,'aci_sensor'=>0,'aci_deger'=>0,'koltuk'=>0,'hiz_modu'=>0,
   'pompa_rpm'=>0,'pompa_motor_sic'=>0,'pompa_surucu_sic'=>0,'lift'=>0,'tilt'=>0,'side_shift'=>0,'ops'=>0,'pompa_mod'=>0,
   'timer'=>0,'KOLTUK_DURUM'=>0,'SAG_MOTOR_RPM'=>0,'SOL_MOTOR_RPM'=>0,'STEERING'=>0,
  ];
  $cols = ["DEVICE_ID"]; $vals = [":DEVICE_ID"]; $bind = [":DEVICE_ID" => $dev]; $float = [":DEVICE_ID" => false];
  foreach ($WHITE as $k => $isFloat) {
    $v = field([$k]); if ($v === null || $v === "" || !is_numeric($v)) continue;
    $cols[] = "`$k`"; $vals[] = ":$k"; $bind[":$k"] = $isFloat ? (float)$v : (int)$v; $float[":$k"] = (bool)$isFloat;
  }
  if (count($cols) < 2) respond(400, ["status" => "error", "message" => "En az bir parametre gonderin"]);

  /* ── kaydet + replay sayacını ilerlet ── */
  $pdo->beginTransaction();
  $sql = "INSERT INTO standart (" . implode(",", $cols) . ") VALUES (" . implode(",", $vals) . ")";
  $ins = $pdo->prepare($sql);
  foreach ($bind as $k => $v) $ins->bindValue($k, $v, $float[$k] ? PDO::PARAM_STR : PDO::PARAM_INT);
  $ins->execute();
  $pdo->prepare("UPDATE araclar SET last_ts=? WHERE device_id=?")->execute([$ts, $dev]);
  $pdo->commit();

  respond(200, ["status" => "success", "message" => "Veri eklendi", "id" => (int)$pdo->lastInsertId(), "alan" => count($cols) - 1]);
} catch (PDOException $e) {
  respond(500, ["status" => "error", "message" => "Veritabani hatasi", "detail" => $e->getMessage()]);
}
