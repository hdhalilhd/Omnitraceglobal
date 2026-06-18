<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Forklift Telemetri — Canlı Panel</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, "Segoe UI", Roboto, sans-serif; background: #eef1f4; color: #1f2937; }
    header { background: #F5A623; color: #fff; padding: 14px 22px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
    header .t { font-size: 20px; font-weight: 800; }
    header .sub { font-size: 12px; font-weight: 400; opacity: .9; }
    header a { color: #fff; font-size: 13px; }
    .bar { background:#fff; padding:12px 22px; display:flex; align-items:center; gap:12px; border-bottom:1px solid #e5e7eb; flex-wrap:wrap; }
    .bar select { padding:8px 12px; border:1px solid #d1d5db; border-radius:8px; font-size:14px; min-width:240px; }
    .wrap { padding: 20px; max-width: 1100px; margin: 0 auto; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 14px; margin-bottom: 22px; }
    .card { background: #fff; border-radius: 14px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card .label { font-size: 13px; color: #6b7280; }
    .card .value { font-size: 30px; font-weight: 700; margin-top: 4px; }
    .card .unit { font-size: 13px; color: #9ca3af; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    th, td { padding: 9px 12px; text-align: left; font-size: 14px; }
    thead { background: #f9fafb; color: #6b7280; }
    tr { border-top: 1px solid #f1f3f5; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
    .live { background: #22c55e; } .stale { background: #9ca3af; }
    .muted { color: #9ca3af; }
  </style>
</head>
<body>
  <header>
    <div><div class="t">FORKLIFT <span style="font-weight:300">Telemetri</span></div>
      <div class="sub"><span id="livedot" class="dot stale"></span><span id="lastupd">bağlanıyor…</span></div></div>
    <a href="yonetim.php">⚙ Araç / Cihaz Yönetimi</a>
  </header>

  <div class="bar">
    <span style="color:#6b7280;font-size:14px;">Araç:</span>
    <select id="aracSec"></select>
    <span id="aracBilgi" class="muted" style="font-size:13px;"></span>
  </div>

  <div class="wrap">
    <div class="cards" id="cards"></div>
    <h3 style="color:#6b7280">Son Kayıtlar</h3>
    <table>
      <thead>
        <tr><th>ID</th><th>Zaman</th><th>Koltuk</th><th>Sağ Motor (rpm)</th><th>Sol Motor (rpm)</th><th>Direksiyon</th></tr>
      </thead>
      <tbody id="rows"><tr><td colspan="6" class="muted">Araç seçin…</td></tr></tbody>
    </table>
  </div>

  <script>
    const seat = (v) => Number(v) === 1 ? "Dolu" : "Boş";
    let araclar = [];

    function card(label, value, unit = "") {
      return `<div class="card"><div class="label">${label}</div>
        <div class="value">${value}</div><div class="unit">${unit}</div></div>`;
    }

    async function loadAraclar() {
      try {
        const r = await fetch("araclar.php", { cache: "no-store" });
        const j = await r.json();
        araclar = j.data || [];
        const sel = document.getElementById("aracSec");
        if (araclar.length === 0) {
          sel.innerHTML = `<option value="">(araç yok)</option>`;
          document.getElementById("aracBilgi").innerHTML =
            'Henüz araç yok — <a href="yonetim.php">Yönetim</a>den ekleyin.';
          return;
        }
        sel.innerHTML = araclar.map(a =>
          `<option value="${a.device_id}">${a.ad || ("Cihaz #" + a.device_id)} (ID:${a.device_id})</option>`).join("");
        sel.onchange = loadVeri;
        loadVeri();
      } catch (e) {
        document.getElementById("aracBilgi").textContent = "araclar.php okunamadı";
      }
    }

    async function loadVeri() {
      const deviceId = document.getElementById("aracSec").value;
      if (!deviceId) return;
      const arac = araclar.find(a => String(a.device_id) === String(deviceId));
      document.getElementById("aracBilgi").textContent =
        arac ? `Şase: ${arac.sase_no || "-"} · Model: ${arac.model || "-"}` : "";
      try {
        const r = await fetch("veri_oku.php?limit=20&device_id=" + deviceId, { cache: "no-store" });
        const j = await r.json();
        if (j.status !== "success") throw new Error();
        render(j.data);
        document.getElementById("livedot").className = "dot live";
        document.getElementById("lastupd").textContent = "son güncelleme: " + new Date().toLocaleTimeString("tr-TR");
      } catch (e) {
        document.getElementById("livedot").className = "dot stale";
        document.getElementById("lastupd").textContent = "bağlantı yok";
      }
    }

    function render(rows) {
      const last = rows[0];
      const cards = document.getElementById("cards");
      cards.innerHTML = last
        ? card("Koltuk Durumu", seat(last.KOLTUK_DURUM)) +
          card("Sağ Motor", last.SAG_MOTOR_RPM, "rpm") +
          card("Sol Motor", last.SOL_MOTOR_RPM, "rpm") +
          card("Direksiyon", last.STEERING)
        : card("Durum", "veri yok", "");
      document.getElementById("rows").innerHTML = rows.length
        ? rows.map(r => `<tr><td>${r.ID}</td><td>${r.TIME}</td><td>${seat(r.KOLTUK_DURUM)}</td>
            <td>${r.SAG_MOTOR_RPM}</td><td>${r.SOL_MOTOR_RPM}</td><td>${r.STEERING}</td></tr>`).join("")
        : `<tr><td colspan="6" class="muted">Bu araçtan henüz veri gelmedi</td></tr>`;
    }

    loadAraclar();
    setInterval(loadVeri, 2000);   // her 2 saniyede bir seçili aracı tazele
  </script>
</body>
</html>
