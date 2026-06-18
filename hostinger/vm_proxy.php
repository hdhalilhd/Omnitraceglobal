<?php
/*
 * vm_proxy.php — Google VM verilerini Hostinger üzerinden proxyle.
 *
 * Neden gerekli:
 *   Hostinger'daki dashboard.html HTTPS üzerinden çalışır.
 *   Tarayıcı, HTTPS sayfasından düz HTTP (VM) isteğini "mixed content"
 *   olarak engeller. Bu proxy SUNUCU TARAFINDA VM'ye bağlanıp sonucu
 *   dashboard'a iletir — CORS veya mixed-content sorunu kalmaz.
 *
 * Kullanım (dashboard.html içinden):
 *   fetch('vm_proxy.php?device_id=1&limit=1')
 *
 * VM erişilemezse {status:"error"} döner, dashboard bunu gösterir.
 */

header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");

$vm_host = "34.175.200.205";
$path    = "/veri_oku.php";

/* Gelen parametreleri olduğu gibi VM'ye ilet */
$qs = http_build_query($_GET);
$url = "http://{$vm_host}{$path}" . ($qs ? "?{$qs}" : "");

$ctx = stream_context_create([
    'http' => [
        'timeout'        => 5,
        'ignore_errors'  => true,
    ]
]);

$resp = @file_get_contents($url, false, $ctx);

if ($resp === false) {
    http_response_code(503);
    echo json_encode([
        "status"  => "error",
        "message" => "VM'ye ulasilamadi ({$vm_host})"
    ], JSON_UNESCAPED_UNICODE);
} else {
    echo $resp;
}
