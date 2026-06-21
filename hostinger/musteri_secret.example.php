<?php
/* ====================================================================
   musteri_secret.example.php — musteri_secret.php için ŞABLON
   --------------------------------------------------------------------
   Bu dosyayı "musteri_secret.php" adıyla kopyalayın, GERÇEK uzun
   rastgele anahtarlar koyun. musteri_secret.php .gitignore'dadır;
   GitHub'a GİTMEZ. Anahtarlar token imzalama + admin yönetimi içindir.

   Üretmek için (herhangi biri):
     php -r "echo bin2hex(random_bytes(32));"
     openssl rand -hex 32
   ==================================================================== */
$TOKEN_SECRET = "DEGISTIR-token-imzalama-icin-64-hex-uzunlugunda-rastgele-anahtar";
$ADMIN_KEY    = "DEGISTIR-musteri-yonetimi-icin-ayri-bir-admin-anahtari";
