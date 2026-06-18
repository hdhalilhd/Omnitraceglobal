<?php
/*
 * kurulum.php — `standart` tablosunu TÜM telemetri parametreleri için hazırlar.
 * ---------------------------------------------------------------------------
 * Bir kez tarayıcıdan açın:  https://omnitraceglobal.com/kurulum.php
 * Eksik kolonları ekler (var olanlara dokunmaz). Tekrar açmak zarar vermez.
 *
 * Eski 5 kolon (DEVICE_ID, KOLTUK_DURUM, SAG_MOTOR_RPM, SOL_MOTOR_RPM, STEERING)
 * korunur; yanına aşağıdaki yeni parametre kolonları eklenir. STM32 hangi alanı
 * gönderirse o kolon dolar; göndermediği NULL kalır.
 */
require __DIR__ . '/secrets.php';   // $host, $dbname, $username, $password (git'te yok)

header("Content-Type:text/plain; charset=utf-8");

// kolon adı => SQL tipi  (panel/STM ile AYNI anahtarlar)
$cols=[
 'batarya_soc'=>'INT','calisma_saati'=>'INT',
 'motor_sic_sag'=>'INT','motor_sic_sol'=>'INT','surucu_sic'=>'INT',
 'motor_akim_sag'=>'INT','motor_akim_sol'=>'INT','dc_akim'=>'INT',
 'motor_rpm_sag'=>'INT','motor_rpm_sol'=>'INT',
 'gercek_hiz'=>'FLOAT','gaz_talep'=>'INT','aci_sensor'=>'INT','aci_deger'=>'INT',
 'koltuk'=>'TINYINT','hiz_modu'=>'TINYINT',
 'pompa_rpm'=>'INT','pompa_motor_sic'=>'INT','pompa_surucu_sic'=>'INT',
 'lift'=>'INT','tilt'=>'TINYINT','side_shift'=>'TINYINT','ops'=>'TINYINT','pompa_mod'=>'TINYINT',
];
try{
  $pdo=new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4",$username,$password,
    [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);

  // tablo yoksa minimum iskeleti oluştur (eski kurulumlarda zaten var)
  $pdo->exec("CREATE TABLE IF NOT EXISTS standart (
     ID INT AUTO_INCREMENT PRIMARY KEY,
     TIME TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
     DEVICE_ID INT NULL )");

  // mevcut kolonları al
  $have=[];
  foreach($pdo->query("SHOW COLUMNS FROM standart") as $r) $have[strtolower($r['Field'])]=true;

  $added=[]; $skip=[];
  foreach($cols as $name=>$type){
    if(isset($have[strtolower($name)])){ $skip[]=$name; continue; }
    $pdo->exec("ALTER TABLE standart ADD COLUMN `$name` $type NULL");
    $added[]=$name;
  }
  echo "KURULUM TAMAM\n\n";
  echo "Eklenen kolonlar (".count($added)."): ".(implode(", ",$added)?:"yok")."\n\n";
  echo "Zaten vardı (".count($skip)."): ".implode(", ",$skip)."\n";
}catch(PDOException $e){
  http_response_code(500);
  echo "HATA: ".$e->getMessage();
}
