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
    if ($action === 'admin_cihaz_uret') {
      /* Sistem benzersiz + SIRALI OLMAYAN + tahmin edilemez device_id üretir.
         random_int = kriptografik rastgele. STM32'ye bu sayı gömülür. */
      $kod = trim((string)inp($body, 'kod'));
      $ad = trim((string)(inp($body, 'ad') ?? '')); $sase = trim((string)(inp($body, 'sase_no') ?? '')); $model = trim((string)(inp($body, 'model') ?? ''));
      $st = $pdo->prepare("SELECT id FROM musteriler WHERE kod=?"); $st->execute([$kod]); $m = $st->fetch();
      if (!$m) out(404, ['status' => 'error', 'message' => 'Musteri bulunamadi']);
      $dev = 0; $chk = $pdo->prepare("SELECT 1 FROM araclar WHERE device_id=?");
      for ($i = 0; $i < 50; $i++) {
        $cand = random_int(10000000, 999999999);   // 8–9 hane, benzersizlik kontrollü
        $chk->execute([$cand]);
        if (!$chk->fetch()) { $dev = $cand; break; }
      }
      if (!$dev) out(500, ['status' => 'error', 'message' => 'device_id uretilemedi, tekrar deneyin']);
      $dkey = bin2hex(random_bytes(16));   // 32 hane GİZLİ anahtar — HMAC için, hatta hiç çıkmaz
      $pdo->prepare("INSERT INTO araclar (device_id,ad,sase_no,model,device_key) VALUES (?,?,?,?,?)")
          ->execute([$dev, $ad, $sase, $model, $dkey]);
      $pdo->prepare("INSERT IGNORE INTO musteri_cihaz (musteri_id,device_id) VALUES (?,?)")->execute([$m['id'], $dev]);
      out(200, ['status' => 'success', 'device_id' => $dev, 'device_key' => $dkey,
                'message' => "device_id uretildi: $dev ($kod)"]);
    }
    if ($action === 'admin_cihaz_liste') {
      /* device_key admin'e döner (firmware'e gömmek için; admin_key korumalı) */
      $rows = $pdo->query("SELECT a.device_id,a.ad,a.sase_no,a.model,a.device_key,
                GROUP_CONCAT(m.kod ORDER BY m.kod) AS musteriler
              FROM araclar a
              LEFT JOIN musteri_cihaz mc ON mc.device_id=a.device_id
              LEFT JOIN musteriler m ON m.id=mc.musteri_id
              GROUP BY a.device_id ORDER BY a.device_id")->fetchAll();
      out(200, ['status' => 'success', 'cihazlar' => $rows]);
    }
    if ($action === 'admin_cihaz_sil') {
      $dev = (int)inp($body, 'device_id');
      if ($dev <= 0) out(400, ['status' => 'error', 'message' => 'device_id gerekli']);
      $pdo->prepare("DELETE FROM musteri_cihaz WHERE device_id=?")->execute([$dev]);
      $pdo->prepare("DELETE FROM araclar WHERE device_id=?")->execute([$dev]);
      out(200, ['status' => 'success', 'message' => "Cihaz silindi: $dev"]);
    }
    if ($action === 'admin_musteri_sil') {
      $kod = trim((string)inp($body, 'kod'));
      $st = $pdo->prepare("SELECT id FROM musteriler WHERE kod=?"); $st->execute([$kod]); $m = $st->fetch();
      if (!$m) out(404, ['status' => 'error', 'message' => 'Musteri bulunamadi']);
      $pdo->prepare("DELETE FROM musteri_cihaz WHERE musteri_id=?")->execute([$m['id']]);
      $pdo->prepare("DELETE FROM musteriler WHERE id=?")->execute([$m['id']]);
      out(200, ['status' => 'success', 'message' => "Musteri silindi: $kod"]);
    }
    /* ── Admin Yapılandırma Konsolu: tüm cfg'yi oku ── */
    if ($action === 'admin_cfg_yukle') {
      $custs = $pdo->query("SELECT kod AS id, ad AS name FROM musteriler ORDER BY kod")->fetchAll();
      $vts = $pdo->query("SELECT cid AS id, musteri_kod AS custId, ad AS name, bitrate AS rate, can_tipi AS fd FROM arac_tipleri")->fetchAll();
      foreach ($vts as &$v) { $v['rate'] = (int)$v['rate']; } unset($v);
      $params = $pdo->query("SELECT cid AS id, vt_cid AS vtId, node, pdo, cob, byte_i AS `byte`, bit_i AS `bit`, uzunluk AS len,
                  tip AS type, endian, disp, degisken AS `var`, min_d AS `min`, max_d AS `max`, olcek AS scale, ofset AS `off`,
                  birim AS unit, widget, buffer AS buf FROM can_parametreleri")->fetchAll();
      foreach ($params as &$p) {
        foreach (['node','cob','byte','bit','len'] as $k) $p[$k] = (int)$p[$k];
        foreach (['min','max','scale','off'] as $k) $p[$k] = (float)$p[$k];
      } unset($p);
      $vis = new stdClass();
      foreach ($pdo->query("SELECT musteri_kod, views, params FROM firma_gorunurluk")->fetchAll() as $r) {
        $vis->{$r['musteri_kod']} = ['views' => json_decode($r['views'] ?: '[]', true),
                                     'params' => json_decode(($r['params'] === null ? 'null' : $r['params']), true)];
      }
      out(200, ['status' => 'success', 'cfg' => ['customers' => $custs, 'vtypes' => $vts, 'params' => $params, 'visibility' => $vis]]);
    }
    /* ── Admin Yapılandırma Konsolu: tüm cfg'yi yaz (tam değiştir) ── */
    if ($action === 'admin_cfg_kaydet') {
      $cfg = inp($body, 'cfg');
      if (!is_array($cfg)) out(400, ['status' => 'error', 'message' => 'cfg (JSON) gerekli']);
      $pdo->beginTransaction();
      /* müşteriler → musteriler (upsert; silme YOK — silme admin_musteri_sil ile) */
      foreach (($cfg['customers'] ?? []) as $c) {
        $kod = trim((string)($c['id'] ?? '')); if ($kod === '') continue;
        $ad = (string)($c['name'] ?? ''); $pass = (string)($c['pass'] ?? '');
        if ($pass !== '') {
          $pdo->prepare("INSERT INTO musteriler (kod,sifre_hash,ad) VALUES (?,?,?)
                         ON DUPLICATE KEY UPDATE ad=VALUES(ad), sifre_hash=VALUES(sifre_hash)")
              ->execute([$kod, password_hash($pass, PASSWORD_DEFAULT), $ad]);
        } else {
          $pdo->prepare("INSERT INTO musteriler (kod,sifre_hash,ad) VALUES (?,?,?)
                         ON DUPLICATE KEY UPDATE ad=VALUES(ad)")
              ->execute([$kod, password_hash(bin2hex(random_bytes(8)), PASSWORD_DEFAULT), $ad]);
        }
      }
      /* araç tipleri + parametreler → tam değiştir (admin tüm seti tutar) */
      $pdo->exec("DELETE FROM arac_tipleri");
      $iv = $pdo->prepare("INSERT INTO arac_tipleri (cid,musteri_kod,ad,bitrate,can_tipi) VALUES (?,?,?,?,?)");
      foreach (($cfg['vtypes'] ?? []) as $v)
        $iv->execute([$v['id'], $v['custId'] ?? '', $v['name'] ?? '', (int)($v['rate'] ?? 250), $v['fd'] ?? 'classic']);
      $pdo->exec("DELETE FROM can_parametreleri");
      $ip = $pdo->prepare("INSERT INTO can_parametreleri
        (cid,vt_cid,node,pdo,cob,byte_i,bit_i,uzunluk,tip,endian,disp,degisken,min_d,max_d,olcek,ofset,birim,widget,buffer)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)");
      foreach (($cfg['params'] ?? []) as $p)
        $ip->execute([$p['id'], $p['vtId'] ?? '', (int)$p['node'], (string)$p['pdo'], (int)$p['cob'],
          (int)$p['byte'], (int)$p['bit'], (int)$p['len'], (string)$p['type'], (string)$p['endian'],
          (string)$p['disp'], (string)$p['var'], (float)$p['min'], (float)$p['max'], (float)$p['scale'],
          (float)$p['off'], (string)($p['unit'] ?? ''), (string)$p['widget'], (string)$p['buf']]);
      /* görünürlük → tam değiştir */
      $pdo->exec("DELETE FROM firma_gorunurluk");
      $ig = $pdo->prepare("INSERT INTO firma_gorunurluk (musteri_kod,views,params) VALUES (?,?,?)");
      foreach (($cfg['visibility'] ?? []) as $kod => $vv)
        $ig->execute([$kod, json_encode($vv['views'] ?? [], JSON_UNESCAPED_UNICODE),
                      json_encode($vv['params'] ?? null, JSON_UNESCAPED_UNICODE)]);
      $pdo->commit();
      out(200, ['status' => 'success', 'message' => 'Yapilandirma sunucuya kaydedildi',
                'sayim' => ['firma' => count($cfg['customers'] ?? []), 'arac_tipi' => count($cfg['vtypes'] ?? []), 'parametre' => count($cfg['params'] ?? [])]]);
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
