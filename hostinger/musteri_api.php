<?php
/* ====================================================================
   musteri_api.php — Müşteri yetkilendirme + GÜVENLİ veri kapısı
   --------------------------------------------------------------------
   Tüm yetki SUNUCU TARAFINDA zorlanır; tarayıcıdan bypass edilemez.

   Genel:
     ?action=login        POST {kod,sifre}        -> {token, ad, cihazlar[]}
     ?action=cihazlar     (Bearer token)          -> yetkili cihaz listesi
     ?action=veri         (Bearer token) {device_id,limit} -> SADECE yetkili
                          cihazın canlı verisi (VM'den proxy). Yetkisizse 403.
   Yönetim (admin_key ile, token gerekmez):
     ?action=admin_liste            {admin_key}
     ?action=admin_musteri_ekle     {admin_key,kod,sifre,ad}
     ?action=admin_cihaz_ata        {admin_key,kod,device_id,sil?}

   Token: HMAC-SHA256 imzalı, durumsuz (stateless), 12 saat geçerli.
   Yetki her istekte DB'den taze okunur → yetki kaldırılınca anında etkili.
   ==================================================================== */
require __DIR__ . '/secrets.php';          // $host,$dbname,$username,$password
require __DIR__ . '/musteri_secret.php';   // $TOKEN_SECRET, $ADMIN_KEY

header("Content-Type:application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Headers: Authorization, Content-Type");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

function out($c, $p){ http_response_code($c); echo json_encode($p, JSON_UNESCAPED_UNICODE); exit; }
function b64u($s){ return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function b64ud($s){ return base64_decode(strtr($s, '-_', '+/')); }
function make_token($mid, $ttl, $secret){
  $p = json_encode(['m' => (int)$mid, 'exp' => time() + $ttl]);
  return b64u($p) . '.' . b64u(hash_hmac('sha256', $p, $secret, true));
}
function verify_token($t, $secret){
  $parts = explode('.', (string)$t);
  if (count($parts) !== 2) return null;
  $p = b64ud($parts[0]); $sig = b64ud($parts[1]);
  if (!hash_equals(hash_hmac('sha256', $p, $secret, true), $sig)) return null;
  $d = json_decode($p, true);
  if (!$d || !isset($d['exp']) || $d['exp'] < time()) return null;
  return $d;
}

/* gelen veri: JSON gövde > POST > GET */
$body = [];
$raw = file_get_contents("php://input");
if ($raw && trim($raw) !== '') { $j = json_decode($raw, true); if (is_array($j)) $body = $j; }
function inp($body, $k){ return $body[$k] ?? $_POST[$k] ?? $_GET[$k] ?? null; }

$action = (string)($_GET['action'] ?? $_POST['action'] ?? '');

try {
  $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
     PDO::ATTR_EMULATE_PREPARES => false]);

  /* ───────── YÖNETİM (admin_key) ───────── */
  if (strpos($action, 'admin_') === 0) {
    if (!hash_equals($ADMIN_KEY, (string)inp($body, 'admin_key')))
      out(401, ['status' => 'error', 'message' => 'admin_key gecersiz']);

    if ($action === 'admin_liste') {
      $rows = $pdo->query("SELECT m.kod,m.ad,m.aktif,
                GROUP_CONCAT(mc.device_id ORDER BY mc.device_id) AS devices
              FROM musteriler m LEFT JOIN musteri_cihaz mc ON mc.musteri_id=m.id
              GROUP BY m.id ORDER BY m.kod")->fetchAll();
      out(200, ['status' => 'success', 'musteriler' => $rows]);
    }
    if ($action === 'admin_musteri_ekle') {
      $kod = trim((string)inp($body, 'kod')); $sifre = (string)inp($body, 'sifre'); $ad = (string)inp($body, 'ad');
      if ($kod === '' || strlen($sifre) < 6) out(400, ['status' => 'error', 'message' => 'kod ve >=6 haneli sifre gerekli']);
      $h = password_hash($sifre, PASSWORD_DEFAULT);
      $pdo->prepare("INSERT INTO musteriler (kod,sifre_hash,ad) VALUES (?,?,?)
                     ON DUPLICATE KEY UPDATE sifre_hash=VALUES(sifre_hash), ad=VALUES(ad)")
          ->execute([$kod, $h, $ad]);
      out(200, ['status' => 'success', 'message' => "Musteri kaydedildi: $kod"]);
    }
    if ($action === 'admin_cihaz_ata') {
      $kod = trim((string)inp($body, 'kod')); $dev = (int)inp($body, 'device_id'); $sil = (int)(inp($body, 'sil') ?? 0);
      $ad = trim((string)(inp($body, 'ad') ?? '')); $sase = trim((string)(inp($body, 'sase_no') ?? '')); $model = trim((string)(inp($body, 'model') ?? ''));
      if ($dev <= 0) out(400, ['status' => 'error', 'message' => 'Gecerli device_id gerekli']);
      $st = $pdo->prepare("SELECT id FROM musteriler WHERE kod=?"); $st->execute([$kod]); $m = $st->fetch();
      if (!$m) out(404, ['status' => 'error', 'message' => 'Musteri bulunamadi']);
      if ($ad !== '' || $sase !== '' || $model !== '') {
        $pdo->prepare("INSERT INTO araclar (device_id,ad,sase_no,model) VALUES (?,?,?,?)
                       ON DUPLICATE KEY UPDATE ad=VALUES(ad), sase_no=VALUES(sase_no), model=VALUES(model)")
            ->execute([$dev, $ad, $sase, $model]);
      } else {
        $pdo->prepare("INSERT IGNORE INTO araclar (device_id) VALUES (?)")->execute([$dev]);
      }
      if ($sil) $pdo->prepare("DELETE FROM musteri_cihaz WHERE musteri_id=? AND device_id=?")->execute([$m['id'], $dev]);
      else      $pdo->prepare("INSERT IGNORE INTO musteri_cihaz (musteri_id,device_id) VALUES (?,?)")->execute([$m['id'], $dev]);
      out(200, ['status' => 'success', 'message' => ($sil ? 'Yetki kaldirildi' : 'Yetki verildi') . " ($kod <-> device $dev)"]);
    }
    if ($action === 'admin_cihaz_liste') {
      $rows = $pdo->query("SELECT a.device_id,a.ad,a.sase_no,a.model,
                GROUP_CONCAT(m.kod ORDER BY m.kod) AS musteriler
              FROM araclar a
              LEFT JOIN musteri_cihaz mc ON mc.device_id=a.device_id
              LEFT JOIN musteriler m ON m.id=mc.musteri_id
              GROUP BY a.device_id ORDER BY a.device_id")->fetchAll();
      out(200, ['status' => 'success', 'cihazlar' => $rows]);
    }
    if ($action === 'admin_musteri_sil') {
      $kod = trim((string)inp($body, 'kod'));
      $st = $pdo->prepare("SELECT id FROM musteriler WHERE kod=?"); $st->execute([$kod]); $m = $st->fetch();
      if (!$m) out(404, ['status' => 'error', 'message' => 'Musteri bulunamadi']);
      $pdo->prepare("DELETE FROM musteri_cihaz WHERE musteri_id=?")->execute([$m['id']]);
      $pdo->prepare("DELETE FROM musteriler WHERE id=?")->execute([$m['id']]);
      out(200, ['status' => 'success', 'message' => "Musteri silindi: $kod"]);
    }
    out(400, ['status' => 'error', 'message' => 'Bilinmeyen admin islemi']);
  }

  /* ───────── LOGIN ───────── */
  if ($action === 'login') {
    $kod = trim((string)inp($body, 'kod')); $sifre = (string)inp($body, 'sifre');
    if ($kod === '' || $sifre === '') out(400, ['status' => 'error', 'message' => 'kod ve sifre gerekli']);
    $st = $pdo->prepare("SELECT id,sifre_hash,ad,aktif FROM musteriler WHERE kod=?");
    $st->execute([$kod]); $m = $st->fetch();
    if (!$m || !(int)$m['aktif'] || !password_verify($sifre, $m['sifre_hash']))
      out(401, ['status' => 'error', 'message' => 'Gecersiz kod veya sifre']);
    $tok = make_token($m['id'], 12 * 3600, $TOKEN_SECRET);
    $ds = $pdo->prepare("SELECT a.device_id,a.ad,a.model,a.sase_no
            FROM musteri_cihaz mc JOIN araclar a ON a.device_id=mc.device_id
            WHERE mc.musteri_id=? ORDER BY a.device_id");
    $ds->execute([$m['id']]);
    out(200, ['status' => 'success', 'token' => $tok, 'ad' => $m['ad'], 'cihazlar' => $ds->fetchAll()]);
  }

  /* ───────── token gerektiren işlemler ───────── */
  $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
  $tok = preg_match('/Bearer\s+(.+)/i', $hdr, $mm) ? trim($mm[1]) : (string)(inp($body, 'token') ?? '');
  $claim = verify_token($tok, $TOKEN_SECRET);
  if (!$claim) out(401, ['status' => 'error', 'message' => 'Oturum gecersiz veya suresi dolmus']);
  $mid = (int)$claim['m'];

  $as = $pdo->prepare("SELECT device_id FROM musteri_cihaz WHERE musteri_id=?");
  $as->execute([$mid]);
  $allowed = array_map('intval', array_column($as->fetchAll(), 'device_id'));

  if ($action === 'cihazlar') {
    $st = $pdo->prepare("SELECT a.device_id,a.ad,a.model,a.sase_no
            FROM musteri_cihaz mc JOIN araclar a ON a.device_id=mc.device_id
            WHERE mc.musteri_id=? ORDER BY a.device_id");
    $st->execute([$mid]);
    out(200, ['status' => 'success', 'cihazlar' => $st->fetchAll()]);
  }

  if ($action === 'veri') {
    $dev = (int)(inp($body, 'device_id') ?? 0);
    $lim = (int)(inp($body, 'limit') ?? 1); $lim = max(1, min(50, $lim));
    if (!in_array($dev, $allowed, true))
      out(403, ['status' => 'error', 'message' => 'Bu cihaza yetkiniz yok']);   // ← MATRİS KAPISI
    $url = "http://34.175.200.205/veri_oku.php?device_id=$dev&limit=$lim";
    $ctx = stream_context_create(['http' => ['timeout' => 5, 'ignore_errors' => true]]);
    $resp = @file_get_contents($url, false, $ctx);
    if ($resp === false) out(503, ['status' => 'error', 'message' => 'VM ulasilamadi']);
    echo $resp; exit;   // VM JSON'unu olduğu gibi ilet (zaten yetkili cihaz)
  }

  out(400, ['status' => 'error', 'message' => 'Bilinmeyen islem']);
} catch (PDOException $e) {
  out(500, ['status' => 'error', 'message' => 'Veritabani hatasi', 'detail' => $e->getMessage()]);
}
