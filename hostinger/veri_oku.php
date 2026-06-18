<?php
/*
 * veri_oku.php — `standart` tablosundan son kayıtları JSON döndürür.
 * Panel (dashboard.html) gerçek-veri makinesi (ID2) için bunu çeker.
 *   ?device_id=2&limit=1   -> o cihazın son kaydı (tüm kolonlar)
 *   ?limit=50              -> son 50 kayıt (tüm cihazlar)
 */
require __DIR__ . '/secrets.php';   // $host, $dbname, $username, $password (git'te yok)

header("Content-Type:application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");

$limit=isset($_GET['limit'])?(int)$_GET['limit']:50; $limit=max(1,min(500,$limit));
$dev=(isset($_GET['device_id'])&&$_GET['device_id']!=="")?(int)$_GET['device_id']:null;

try{
  $pdo=new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4",$username,$password,
    [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
  $ago="TIMESTAMPDIFF(SECOND,`TIME`,NOW()) as seconds_ago";
  if($dev===null){
    $st=$pdo->prepare("SELECT *,$ago FROM standart ORDER BY ID DESC LIMIT :l");
  }else{
    $st=$pdo->prepare("SELECT *,$ago FROM standart WHERE DEVICE_ID=:d ORDER BY ID DESC LIMIT :l");
    $st->bindValue(":d",$dev,PDO::PARAM_INT);
  }
  $st->bindValue(":l",$limit,PDO::PARAM_INT);
  $st->execute();
  $rows=$st->fetchAll();
  echo json_encode(["status"=>"success","count"=>count($rows),"data"=>$rows],JSON_UNESCAPED_UNICODE);
}catch(PDOException $e){
  http_response_code(500);
  echo json_encode(["status"=>"error","message"=>"Veritabani hatasi","detail"=>$e->getMessage()],JSON_UNESCAPED_UNICODE);
}
