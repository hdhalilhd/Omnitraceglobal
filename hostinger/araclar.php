<?php
/*
 * araclar.php — Araç ve cihaz eşleştirme API'si.
 *   GET    araclar.php                 -> tüm araçları JSON listeler
 *   POST   araclar.php   (JSON body)   -> araç ekler/günceller (device_id'ye göre)
 *          body: {"device_id":1,"sase_no":"304MB100200","ad":"Depo Forklift","model":"EF-25"}
 *   DELETE araclar.php?id=3            -> aracı siler
 *
 * Tablo (yoksa phpMyAdmin -> SQL ile oluşturun):
 *   CREATE TABLE araclar (
 *     id INT AUTO_INCREMENT PRIMARY KEY,
 *     device_id INT NOT NULL UNIQUE,
 *     sase_no VARCHAR(50),
 *     ad VARCHAR(100),
 *     model VARCHAR(50),
 *     created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 *   );
 */

// ==================== AYARLAR (veri_al.php ile AYNI) ====================
require __DIR__ . '/secrets.php';   // $host, $dbname, $username, $password (git'te yok)
// =======================================================================

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

function respond(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'OPTIONS') { respond(200, ["status" => "ok"]); }

try {
    $dsn = "mysql:host=$host;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    if ($method === 'GET') {
        $rows = $pdo->query("SELECT id, device_id, sase_no, ad, model, created FROM araclar ORDER BY id")->fetchAll();
        respond(200, ["status" => "success", "count" => count($rows), "data" => $rows]);
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents("php://input"), true);
        if (!is_array($data)) respond(400, ["status" => "error", "message" => "Geçersiz JSON"]);

        $device_id = $data['device_id'] ?? null;
        if ($device_id === null || !is_numeric($device_id)) {
            respond(400, ["status" => "error", "message" => "device_id zorunlu ve sayısal olmalı"]);
        }
        $sase = (string)($data['sase_no'] ?? '');
        $ad   = (string)($data['ad'] ?? '');
        $model = (string)($data['model'] ?? '');

        // device_id varsa güncelle, yoksa ekle
        $stmt = $pdo->prepare(
            "INSERT INTO araclar (device_id, sase_no, ad, model)
             VALUES (:dev, :sase, :ad, :model)
             ON DUPLICATE KEY UPDATE sase_no = :sase2, ad = :ad2, model = :model2"
        );
        $stmt->bindValue(":dev", (int)$device_id, PDO::PARAM_INT);
        $stmt->bindValue(":sase", $sase);
        $stmt->bindValue(":ad", $ad);
        $stmt->bindValue(":model", $model);
        $stmt->bindValue(":sase2", $sase);
        $stmt->bindValue(":ad2", $ad);
        $stmt->bindValue(":model2", $model);
        $stmt->execute();
        respond(200, ["status" => "success", "message" => "Araç kaydedildi"]);
    }

    if ($method === 'DELETE') {
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if ($id <= 0) respond(400, ["status" => "error", "message" => "id gerekli"]);
        $stmt = $pdo->prepare("DELETE FROM araclar WHERE id = :id");
        $stmt->bindValue(":id", $id, PDO::PARAM_INT);
        $stmt->execute();
        respond(200, ["status" => "success", "message" => "Araç silindi"]);
    }

    respond(405, ["status" => "error", "message" => "Desteklenmeyen metot"]);
} catch (PDOException $e) {
    respond(500, ["status" => "error", "message" => "Veritabanı hatası", "detail" => $e->getMessage()]);
}
