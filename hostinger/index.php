<?php
/*
 * index.php — Forklift Telemetri: HER ŞEY TEK DOSYADA / TEK LİNK
 * ------------------------------------------------------------------
 * Tek adres: https://omnitraceglobal.com/   (veya .../index.php)
 *
 * Aynı dosya hem ARAYÜZ'ü (sekmeli panel + araç yönetimi) hem de
 * tüm API işlemlerini (?api=...) sunar:
 *
 *   ?api=ekle        (GET/POST)  -> cihaz verisini `standart`a yazar (veri_al.php yerine)
 *   ?api=veri        (GET)       -> son kayıtlar (device_id, limit) JSON
 *   ?api=arac_liste  (GET)       -> araç/cihaz eşleşmeleri JSON
 *   ?api=arac_ekle   (POST)      -> araç ekle/güncelle (device_id'ye göre)
 *   ?api=arac_sil    (GET/POST)  -> araç sil (id)
 *   (api yoksa)                  -> HTML arayüz döner
 *
 * Tablolar (phpMyAdmin -> SQL):
 *   standart(ID,TIME,DEVICE_ID,KOLTUK_DURUM,SAG_MOTOR_RPM,SOL_MOTOR_RPM,STEERING)
 *   araclar (id,device_id UNIQUE,sase_no,ad,model,created)
 */

// ==================== AYARLAR ====================
require __DIR__ . '/secrets.php';   // $host, $dbname, $username, $password (git'te yok)
$API_KEY  = "";   // doldurursanız cihaz ?api=ekle çağrısında ?api_key= veya X-API-KEY göndermeli
// =================================================

/* ---- Yardımcılar ---- */
function db() {
    global $host, $dbname, $username, $password;
    return new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $username, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}
function out(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}
/* Büyük/küçük harf duyarsız alan bulucu */
function field(array $d, array $names) {
    foreach ($names as $n) foreach ($d as $k => $v)
        if (strcasecmp((string)$k, $n) === 0) return $v;
    return null;
}

$api = $_GET['api'] ?? '';

/* =================== API KATMANI =================== */
if ($api !== '') {
    header("Content-Type: application/json; charset=utf-8");
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, X-API-KEY");
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') exit;

    try {
        $pdo = db();

        switch ($api) {

        /* ---- Cihaz verisi al (veri_al.php yerine) ---- */
        case 'ekle': {
            // API anahtarı (opsiyonel)
            if ($API_KEY !== "") {
                $sent = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['api_key'] ?? ($_POST['api_key'] ?? ''));
                if (!hash_equals($API_KEY, $sent)) out(401, ["status"=>"error","message"=>"Gecersiz API anahtari"]);
            }
            // Veri kaynağı: JSON gövde > form > query
            $data = [];
            $raw = file_get_contents("php://input");
            if ($raw && trim($raw) !== "") {
                $j = json_decode($raw, true);
                if (is_array($j)) $data = $j;
            }
            if (!$data) $data = $_POST ?: $_GET;

            $f = [
                "DEVICE_ID"     => field($data, ["DEVICE_ID","device_id"]),
                "KOLTUK_DURUM"  => field($data, ["KOLTUK_DURUM","koltuk_durum","seat"]),
                "SAG_MOTOR_RPM" => field($data, ["SAG_MOTOR_RPM","sag_motor_rpm"]),
                "SOL_MOTOR_RPM" => field($data, ["SOL_MOTOR_RPM","sol_motor_rpm"]),
                "STEERING"      => field($data, ["STEERING","steering"]),
            ];
            foreach ($f as $name => $v)
                if ($v === null || !is_numeric($v)) out(400, ["status"=>"error","message"=>"Eksik/gecersiz alan: $name"]);

            $st = $pdo->prepare("INSERT INTO standart (DEVICE_ID,KOLTUK_DURUM,SAG_MOTOR_RPM,SOL_MOTOR_RPM,STEERING)
                                 VALUES (:d,:k,:sag,:sol,:s)");
            $st->bindValue(":d",   (int)$f["DEVICE_ID"],     PDO::PARAM_INT);
            $st->bindValue(":k",   (int)$f["KOLTUK_DURUM"],  PDO::PARAM_INT);
            $st->bindValue(":sag", (int)$f["SAG_MOTOR_RPM"], PDO::PARAM_INT);
            $st->bindValue(":sol", (int)$f["SOL_MOTOR_RPM"], PDO::PARAM_INT);
            $st->bindValue(":s",   (int)$f["STEERING"],      PDO::PARAM_INT);
            $st->execute();
            out(200, ["status"=>"success","message"=>"Veri eklendi","id"=>(int)$pdo->lastInsertId()]);
        }

        /* ---- Son telemetri kayıtları ---- */
        case 'veri': {
            $lim = isset($_GET['limit']) ? max(1, min(200, (int)$_GET['limit'])) : 20;
            $cols = "ID,TIME,DEVICE_ID,KOLTUK_DURUM,SAG_MOTOR_RPM,SOL_MOTOR_RPM,STEERING";
            if (isset($_GET['device_id']) && $_GET['device_id'] !== '') {
                $st = $pdo->prepare("SELECT $cols FROM standart WHERE DEVICE_ID=:d ORDER BY ID DESC LIMIT :l");
                $st->bindValue(":d", (int)$_GET['device_id'], PDO::PARAM_INT);
                $st->bindValue(":l", $lim, PDO::PARAM_INT);
            } else {
                $st = $pdo->prepare("SELECT $cols FROM standart ORDER BY ID DESC LIMIT :l");
                $st->bindValue(":l", $lim, PDO::PARAM_INT);
            }
            $st->execute();
            out(200, ["status"=>"success","data"=>$st->fetchAll()]);
        }

        /* ---- Araç/cihaz listesi ---- */
        case 'arac_liste': {
            $rows = $pdo->query("SELECT id,device_id,sase_no,ad,model,created FROM araclar ORDER BY id")->fetchAll();
            out(200, ["status"=>"success","data"=>$rows]);
        }

        /* ---- Araç ekle / güncelle ---- */
        case 'arac_ekle': {
            $data = [];
            $raw = file_get_contents("php://input");
            if ($raw && trim($raw) !== "") { $j = json_decode($raw, true); if (is_array($j)) $data = $j; }
            if (!$data) $data = $_POST;

            $device_id = field($data, ["device_id","DEVICE_ID"]);
            $sase = (string)(field($data, ["sase_no","sase"]) ?? '');
            $ad   = (string)(field($data, ["ad","name"]) ?? '');
            $model= (string)(field($data, ["model"]) ?? '');
            if ($device_id === null || !is_numeric($device_id))
                out(400, ["status"=>"error","message"=>"device_id zorunlu/sayisal olmali"]);

            $st = $pdo->prepare("INSERT INTO araclar (device_id,sase_no,ad,model) VALUES (:d,:s,:a,:m)
                                 ON DUPLICATE KEY UPDATE sase_no=:s, ad=:a, model=:m");
            $st->bindValue(":d", (int)$device_id, PDO::PARAM_INT);
            $st->bindValue(":s", $sase);
            $st->bindValue(":a", $ad);
            $st->bindValue(":m", $model);
            $st->execute();
            out(200, ["status"=>"success","message"=>"Arac kaydedildi"]);
        }

        /* ---- Araç sil ---- */
        case 'arac_sil': {
            $id = $_GET['id'] ?? $_POST['id'] ?? null;
            if ($id === null || !is_numeric($id)) out(400, ["status"=>"error","message"=>"id gerekli"]);
            $st = $pdo->prepare("DELETE FROM araclar WHERE id=:id");
            $st->bindValue(":id", (int)$id, PDO::PARAM_INT);
            $st->execute();
            out(200, ["status"=>"success","message"=>"Arac silindi"]);
        }

        default:
            out(404, ["status"=>"error","message"=>"Bilinmeyen api: $api"]);
        }
    } catch (PDOException $e) {
        out(500, ["status"=>"error","message"=>"Veritabani hatasi","detail"=>$e->getMessage()]);
    }
}
/* =============== API KATMANI SONU =============== */
?>
<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Forklift Telemetri</title>
<style>
  :root{
    --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --line:#2a3343;
    --txt:#e6edf3; --muted:#8b98a9; --accent:#3b82f6; --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:var(--bg);color:var(--txt)}
  header{display:flex;align-items:center;gap:14px;padding:14px 20px;background:var(--panel);border-bottom:1px solid var(--line)}
  header h1{font-size:18px;margin:0;font-weight:600}
  header .dot{width:10px;height:10px;border-radius:50%;background:var(--muted)}
  header .dot.live{background:var(--ok);box-shadow:0 0 8px var(--ok)}
  .tabs{display:flex;gap:6px;margin-left:auto}
  .tab{padding:8px 16px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--muted);cursor:pointer;font-size:14px}
  .tab.active{background:var(--accent);color:#fff;border-color:var(--accent)}
  main{padding:20px;max-width:1100px;margin:0 auto}
  .view{display:none}
  .view.active{display:block}
  .row{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
  select,input{background:var(--panel2);border:1px solid var(--line);color:var(--txt);padding:9px 12px;border-radius:8px;font-size:14px}
  select{min-width:240px}
  button.btn{background:var(--accent);border:none;color:#fff;padding:9px 16px;border-radius:8px;cursor:pointer;font-size:14px}
  button.btn:hover{filter:brightness(1.1)}
  button.btn.danger{background:var(--bad)}
  .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin:18px 0}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
  .card .lbl{color:var(--muted);font-size:13px}
  .card .val{font-size:30px;font-weight:700;margin-top:6px}
  .card .unit{font-size:14px;color:var(--muted);font-weight:400}
  .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:13px;font-weight:600}
  .badge.dolu{background:rgba(34,197,94,.15);color:var(--ok)}
  .badge.bos{background:rgba(139,152,169,.15);color:var(--muted)}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th,td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line)}
  th{color:var(--muted);font-weight:600}
  tr:hover td{background:var(--panel2)}
  .panel-box{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:16px}
  .panel-box h3{margin:0 0 14px;font-size:15px}
  .muted{color:var(--muted)}
  .grid-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;align-items:end}
  .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
  .field input{width:100%}
  .toast{position:fixed;bottom:20px;right:20px;background:var(--panel2);border:1px solid var(--line);padding:12px 16px;border-radius:10px;opacity:0;transition:.3s;pointer-events:none}
  .toast.show{opacity:1}
</style>
</head>
<body>
<header>
  <span class="dot" id="liveDot"></span>
  <h1>🚜 Forklift Telemetri</h1>
  <div class="tabs">
    <button class="tab active" data-view="panel">Canlı Panel</button>
    <button class="tab" data-view="yonetim">Araç Yönetimi</button>
  </div>
</header>

<main>
  <!-- ============ CANLI PANEL ============ -->
  <section class="view active" id="view-panel">
    <div class="row">
      <select id="aracSec"><option value="">— Araç seçin —</option></select>
      <span class="muted" id="sonGuncelleme">Veri bekleniyor…</span>
    </div>

    <div class="cards" id="kartlar">
      <div class="card"><div class="lbl">Koltuk Durumu</div><div class="val"><span id="v_koltuk" class="badge bos">—</span></div></div>
      <div class="card"><div class="lbl">Sağ Motor</div><div class="val"><span id="v_sag">—</span> <span class="unit">rpm</span></div></div>
      <div class="card"><div class="lbl">Sol Motor</div><div class="val"><span id="v_sol">—</span> <span class="unit">rpm</span></div></div>
      <div class="card"><div class="lbl">Direksiyon</div><div class="val"><span id="v_steering">—</span></div></div>
    </div>

    <div class="panel-box">
      <h3>Son Kayıtlar</h3>
      <table>
        <thead><tr><th>ID</th><th>Zaman</th><th>Koltuk</th><th>Sağ rpm</th><th>Sol rpm</th><th>Direksiyon</th></tr></thead>
        <tbody id="tablo"><tr><td colspan="6" class="muted">Araç seçin…</td></tr></tbody>
      </table>
    </div>
  </section>

  <!-- ============ ARAÇ YÖNETİMİ ============ -->
  <section class="view" id="view-yonetim">
    <div class="panel-box">
      <h3>Yeni Araç / Cihaz Eşleştir</h3>
      <form id="aracForm" class="grid-form">
        <div class="field"><label>Cihaz ID *</label><input type="number" name="device_id" required placeholder="1"></div>
        <div class="field"><label>Şase No</label><input name="sase_no" placeholder="304MB100104"></div>
        <div class="field"><label>Araç Adı</label><input name="ad" placeholder="Forklift A"></div>
        <div class="field"><label>Model</label><input name="model" placeholder="EFG 320"></div>
        <div class="field"><button type="submit" class="btn">Kaydet</button></div>
      </form>
      <p class="muted" style="margin:10px 0 0;font-size:12px">Cihaz ID, STM32 firmware'deki <b>DEVICE_ID</b> ile aynı olmalı.</p>
    </div>

    <div class="panel-box">
      <h3>Kayıtlı Araçlar</h3>
      <table>
        <thead><tr><th>Cihaz ID</th><th>Şase No</th><th>Ad</th><th>Model</th><th>Eklendi</th><th></th></tr></thead>
        <tbody id="aracTablo"><tr><td colspan="6" class="muted">Yükleniyor…</td></tr></tbody>
      </table>
    </div>
  </section>
</main>

<div class="toast" id="toast"></div>

<script>
const $ = s => document.querySelector(s);
let timer = null, vehicles = [];

/* ---- Sekmeler ---- */
document.querySelectorAll('.tab').forEach(t => t.onclick = () => {
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  $('#view-'+t.dataset.view).classList.add('active');
  if (t.dataset.view === 'yonetim') loadVehicles();
});

function toast(msg){ const e=$('#toast'); e.textContent=msg; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),2200); }

/* ---- Araçları yükle (hem dropdown hem yönetim tablosu) ---- */
async function loadVehicles(){
  const r = await fetch('?api=arac_liste'); const j = await r.json();
  vehicles = j.data || [];
  // dropdown
  const sel = $('#aracSec'); const cur = sel.value;
  sel.innerHTML = '<option value="">— Araç seçin —</option>' +
    vehicles.map(v=>`<option value="${v.device_id}">${v.ad||('Cihaz '+v.device_id)} (${v.sase_no||'—'})</option>`).join('');
  sel.value = cur;
  // yönetim tablosu
  const tb = $('#aracTablo');
  tb.innerHTML = vehicles.length ? vehicles.map(v=>`
    <tr><td>${v.device_id}</td><td>${v.sase_no||'—'}</td><td>${v.ad||'—'}</td><td>${v.model||'—'}</td>
        <td class="muted">${v.created||''}</td>
        <td><button class="btn danger" onclick="silArac(${v.id})">Sil</button></td></tr>`).join('')
    : '<tr><td colspan="6" class="muted">Henüz araç yok.</td></tr>';
}

/* ---- Araç ekle ---- */
$('#aracForm').onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const r = await fetch('?api=arac_ekle', {method:'POST', body:fd});
  const j = await r.json();
  if (j.status==='success'){ toast('Araç kaydedildi'); e.target.reset(); loadVehicles(); }
  else toast(j.message||'Hata');
};
async function silArac(id){
  if(!confirm('Araç silinsin mi?')) return;
  await fetch('?api=arac_sil&id='+id); toast('Silindi'); loadVehicles();
}

/* ---- Canlı panel ---- */
$('#aracSec').onchange = startPoll;
function startPoll(){
  if (timer) clearInterval(timer);
  const dev = $('#aracSec').value;
  if (!dev){ $('#liveDot').classList.remove('live'); return; }
  poll(dev); timer = setInterval(()=>poll(dev), 2000);
}
async function poll(dev){
  try{
    const r = await fetch('?api=veri&device_id='+dev+'&limit=15');
    const j = await r.json(); const rows = j.data || [];
    $('#liveDot').classList.add('live');
    if (!rows.length){ $('#sonGuncelleme').textContent='Bu araçtan veri yok'; return; }
    const son = rows[0];
    const dolu = Number(son.KOLTUK_DURUM)===1;
    $('#v_koltuk').textContent = dolu?'Dolu':'Boş';
    $('#v_koltuk').className = 'badge '+(dolu?'dolu':'bos');
    $('#v_sag').textContent = son.SAG_MOTOR_RPM;
    $('#v_sol').textContent = son.SOL_MOTOR_RPM;
    $('#v_steering').textContent = son.STEERING;
    $('#sonGuncelleme').textContent = 'Son: '+(son.TIME||'')+' (#'+son.ID+')';
    $('#tablo').innerHTML = rows.map(x=>`
      <tr><td>${x.ID}</td><td>${x.TIME||''}</td>
          <td>${Number(x.KOLTUK_DURUM)===1?'Dolu':'Boş'}</td>
          <td>${x.SAG_MOTOR_RPM}</td><td>${x.SOL_MOTOR_RPM}</td><td>${x.STEERING}</td></tr>`).join('');
  }catch(e){ $('#liveDot').classList.remove('live'); }
}

/* başlangıç */
loadVehicles();
</script>
</body>
</html>
