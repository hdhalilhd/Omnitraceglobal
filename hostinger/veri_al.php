<?php
/*
 * veri_al.php — Forklift telemetri: cihazdan gelen TÜM parametreleri MySQL'e yazar.
 * ---------------------------------------------------------------------------------
 * Cihaz (STM32 + SIM800L) düz HTTP ile GET/POST eder; bu dosya gelen alanlardan
 * TANIDIĞI olanları `standart` tablosuna PDO + prepared statement ile yazar.
 * Sadece beyaz listedeki alanlar kabul edilir (SQL injection'a kapalı).
 *
 * Önce bir kez kurulum.php'yi açın (kolonları ekler).
 *
 * Örnek (GET, cihazın yaptığı):
 *   /veri_al.php?DEVICE_ID=2&batarya_soc=82&calisma_saati=980&motor_sic_sag=46&...
 * Örnek (POST JSON):
 *   {"DEVICE_ID":2,"batarya_soc":82,"motor_sic_sag":46, ...}
 */
require __DIR__ . '/secrets.php';   // $host, $dbname, $username, $password (git'te yok)
$API_KEY="";   // doldurursanız istek ?api_key= veya X-API-KEY göndermeli

header("Content-Type:application/json; charset=utf-8");
function respond($c,$p){http_response_code($c);echo json_encode($p,JSON_UNESCAPED_UNICODE);exit;}

$method=$_SERVER['REQUEST_METHOD']??'';
if($method!=='GET'&&$method!=='POST') respond(405,["status"=>"error","message"=>"GET veya POST"]);

if($API_KEY!==""){
  $sent=$_SERVER['HTTP_X_API_KEY']??($_GET['api_key']??($_POST['api_key']??''));
  if(!hash_equals($API_KEY,$sent)) respond(401,["status"=>"error","message"=>"Gecersiz API anahtari"]);
}

/* gelen veri: JSON gövde > form > query */
$data=[];
if($method==='POST'){
  $raw=file_get_contents("php://input");
  if($raw&&trim($raw)!==""){ $j=json_decode($raw,true); if(is_array($j))$data=$j; }
  if(!$data)$data=$_POST;
} else $data=$_GET;
if(!$data) respond(400,["status"=>"error","message"=>"Veri yok"]);

/* büyük/küçük harf duyarsız alan bulucu */
function field($d,$names){foreach($names as $n)foreach($d as $k=>$v)if(strcasecmp((string)$k,$n)===0)return $v;return null;}

/* device_id zorunlu */
$dev=field($data,["DEVICE_ID","device_id"]);
if($dev===null||!is_numeric($dev)) respond(400,["status"=>"error","message"=>"DEVICE_ID gerekli"]);

/* BEYAZ LİSTE — panel/STM ile aynı anahtarlar. true=ondalık(float) olabilir */
$WHITE=[
 'batarya_soc'=>0,'calisma_saati'=>0,'motor_sic_sag'=>0,'motor_sic_sol'=>0,'surucu_sic'=>0,
 'motor_akim_sag'=>0,'motor_akim_sol'=>0,'dc_akim'=>0,'motor_rpm_sag'=>0,'motor_rpm_sol'=>0,
 'gercek_hiz'=>1,'gaz_talep'=>0,'aci_sensor'=>0,'aci_deger'=>0,'koltuk'=>0,'hiz_modu'=>0,
 'pompa_rpm'=>0,'pompa_motor_sic'=>0,'pompa_surucu_sic'=>0,'lift'=>0,'tilt'=>0,'side_shift'=>0,'ops'=>0,'pompa_mod'=>0,
 'timer'=>0,    /* saniye sayacı — VPS bağlantı testi */
 // eski 5 kolon da kabul (geri uyumluluk)
 'KOLTUK_DURUM'=>0,'SAG_MOTOR_RPM'=>0,'SOL_MOTOR_RPM'=>0,'STEERING'=>0,
];

$cols=["DEVICE_ID"]; $vals=[":DEVICE_ID"]; $bind=[":DEVICE_ID"=>(int)$dev]; $float=[":DEVICE_ID"=>false];
foreach($WHITE as $key=>$isFloat){
  $v=field($data,[$key]);
  if($v===null||$v==="" ) continue;
  if(!is_numeric($v)) continue;
  $cols[]="`$key`"; $vals[]=":$key"; $bind[":$key"]=$isFloat?(float)$v:(int)$v; $float[":$key"]=$isFloat;
}
if(count($cols)<2) respond(400,["status"=>"error","message"=>"En az bir parametre gonderin"]);

try{
  $pdo=new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4",$username,$password,
    [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>false]);
  $sql="INSERT INTO standart (".implode(",",$cols).") VALUES (".implode(",",$vals).")";
  $st=$pdo->prepare($sql);
  foreach($bind as $k=>$v){ $st->bindValue($k,$v, $float[$k]?PDO::PARAM_STR:PDO::PARAM_INT); }
  $st->execute();
  respond(200,["status"=>"success","message"=>"Veri eklendi","id"=>(int)$pdo->lastInsertId(),"alan"=>count($cols)-1]);
}catch(PDOException $e){
  respond(500,["status"=>"error","message"=>"Veritabani hatasi","detail"=>$e->getMessage()]);
}
