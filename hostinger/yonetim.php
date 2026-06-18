<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Araç / Cihaz Yönetimi</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, "Segoe UI", Roboto, sans-serif; background: #eef1f4; color: #1f2937; }
    header { background: #F5A623; color: #fff; padding: 14px 22px; font-size: 20px; font-weight: 800; display:flex; justify-content:space-between; align-items:center; }
    header a { color:#fff; font-size:13px; }
    .wrap { padding: 20px; max-width: 920px; margin: 0 auto; }
    .card { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 18px; }
    h3 { color:#374151; margin-top:0; }
    label { display:block; font-size:13px; color:#6b7280; margin-top:10px; }
    input { width:100%; padding:9px 11px; border:1px solid #d1d5db; border-radius:8px; margin-top:4px; }
    button { background:#F5A623; color:#fff; border:0; border-radius:8px; padding:10px 18px; font-weight:700; cursor:pointer; margin-top:14px; }
    button.del { background:#ef4444; padding:6px 12px; font-size:12px; margin:0; }
    table { width:100%; border-collapse: collapse; }
    th, td { padding:9px 10px; text-align:left; font-size:14px; border-top:1px solid #f1f3f5; }
    thead { background:#f9fafb; color:#6b7280; }
    .msg { padding:10px; border-radius:8px; margin-top:10px; font-size:14px; display:none; }
    .ok { background:#dcfce7; color:#166534; } .err { background:#fee2e2; color:#991b1b; }
    .hint { font-size:12px; color:#9ca3af; }
  </style>
</head>
<body>
  <header>
    <div>Araç / Cihaz Yönetimi</div>
    <a href="panel.php">← Canlı Panel</a>
  </header>

  <div class="wrap">
    <div class="card">
      <h3>Yeni Araç Ekle / Eşleştir</h3>
      <p class="hint">Cihaz ID = STM32 firmware'indeki <b>DEVICE_ID</b> ile aynı olmalı. Aynı Cihaz ID tekrar girilirse araç bilgileri güncellenir.</p>
      <label>Cihaz ID (DEVICE_ID) *</label>
      <input id="device_id" type="number" placeholder="örn. 1" />
      <label>Şase No</label>
      <input id="sase_no" placeholder="örn. 304MB100200" />
      <label>Araç Adı</label>
      <input id="ad" placeholder="örn. Depo Forklift #1" />
      <label>Model</label>
      <input id="model" placeholder="örn. EF-25" />
      <button onclick="kaydet()">Kaydet</button>
      <div id="msg" class="msg"></div>
    </div>

    <div class="card">
      <h3>Kayıtlı Araçlar</h3>
      <table>
        <thead><tr><th>ID</th><th>Cihaz ID</th><th>Şase No</th><th>Ad</th><th>Model</th><th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="6" class="hint">Yükleniyor…</td></tr></tbody>
      </table>
    </div>
  </div>

  <script>
    function show(msg, ok) {
      const el = document.getElementById("msg");
      el.textContent = msg; el.className = "msg " + (ok ? "ok" : "err"); el.style.display = "block";
      setTimeout(() => el.style.display = "none", 3000);
    }

    async function kaydet() {
      const body = {
        device_id: document.getElementById("device_id").value,
        sase_no: document.getElementById("sase_no").value,
        ad: document.getElementById("ad").value,
        model: document.getElementById("model").value,
      };
      if (!body.device_id) { show("Cihaz ID zorunlu", false); return; }
      try {
        const r = await fetch("araclar.php", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await r.json();
        if (j.status === "success") { show("Kaydedildi ✓", true); liste(); }
        else show(j.message || "Hata", false);
      } catch (e) { show("Bağlantı hatası", false); }
    }

    async function sil(id) {
      if (!confirm("Bu aracı silmek istediğinize emin misiniz?")) return;
      await fetch("araclar.php?id=" + id, { method: "DELETE" });
      liste();
    }

    async function liste() {
      try {
        const r = await fetch("araclar.php");
        const j = await r.json();
        const tbody = document.getElementById("rows");
        tbody.innerHTML = (j.data && j.data.length)
          ? j.data.map(a => `<tr><td>${a.id}</td><td><b>${a.device_id}</b></td><td>${a.sase_no||"-"}</td>
              <td>${a.ad||"-"}</td><td>${a.model||"-"}</td>
              <td><button class="del" onclick="sil(${a.id})">Sil</button></td></tr>`).join("")
          : `<tr><td colspan="6" class="hint">Henüz araç yok</td></tr>`;
      } catch (e) {
        document.getElementById("rows").innerHTML = `<tr><td colspan="6" class="err">araclar.php okunamadı</td></tr>`;
      }
    }
    liste();
  </script>
</body>
</html>
