/* ============================================================
 *  main.c — OmniTrace Forklift Telemetri  ·  Tam Buffer Sürümü
 * ============================================================
 *  Görev mimarisi (polling scheduler, HAL_GetTick tabanlı):
 *
 *   T_FAST  = 500ms  →  motor_akim_*, dc_akim, motor_rpm_*, gercek_hiz,
 *                        pompa_rpm, gaz_talep, aci_sensor, aci_deger, lift
 *                        Ring buffer'a toplanır, gönderimde ortalama alınır.
 *
 *   T_1S    = 1s     →  koltuk, hiz_modu  (son değer)
 *
 *   T_1MIN  = 60s    →  batarya_soc, motor_sic_sag/sol, surucu_sic,
 *                        pompa_motor_sic, pompa_surucu_sic  (son değer)
 *
 *   T_1HR   = 3600s  →  calisma_saati  (son değer)
 *
 *   T_SEND  = 8s     →  Buffer + son değerleri tek HTTP GET ile VM'ye yolla.
 *                        SIM800L TCP cycle ~5-8sn aldığından 500ms'de
 *                        bireysel TCP açmak imkânsız; batch+8sn standart çözüm.
 *
 *  MOCK DEĞERLER: CAN bağlantısı gelmeden önce gerçekçi benzetimler
 *  kullanılır. Gerçek değer için "TODO: CAN" yorumlu satırları değiştirin.
 *
 *  HEDEF SUNUCU:
 *    VM TEST  → SERVER_HOST = "34.175.200.205"
 *    Hostinger → SERVER_HOST = "omnitraceglobal.com"
 *
 *  DONANIM: STM32G431RBTx  USART1=SIM800L(115200)  USART2=PC(115200)
 *           FDCAN1: PA11(RX) / PA12(TX) @ 250kbps    LED: PA5
 * ============================================================ */

#include "main.h"
#include <stdio.h>
#include <string.h>
#include <stdarg.h>

/* ── Peripheral handle'ları ────────────────────────────────── */
UART_HandleTypeDef huart1;   /* SIM800L  */
UART_HandleTypeDef huart2;   /* PC log   */

/* ── ISR cevap tamponu ─────────────────────────────────────── */
static uint8_t  rx_byte;
static char     big_buf[2048];
static uint16_t big_idx = 0;

/* ================================================================
 *  KONFİGÜRASYON — değiştirmen gereken tek bölüm
 * ================================================================ */
/* VM TEST için  "34.175.200.205"
 * Hostinger için "omnitraceglobal.com"  */
#define SERVER_HOST   "34.175.200.205"
#define SERVER_PORT   80
#define DEVICE_ID     1

/* Görev aralıkları [ms] */
#define T_FAST    500u       /* 2 Hz  */
#define T_1S      1000u      /* 1 Hz  */
#define T_1MIN    60000u     /* 1/dk  */
#define T_1HR     3600000u   /* 1/sa  */
#define T_SEND    8000u      /* toplu gönderim  */

/* ================================================================
 *  BUFFER YAPISI  (hızlı sinyaller: 2Hz x 8sn = maks 16 örnek)
 * ================================================================ */
#define FBUF_SIZE  16

typedef struct {
    int32_t  v[FBUF_SIZE];  /* örnek dizisi  */
    uint8_t  n;             /* dolu eleman sayısı  */
} FastBuf;

/* 2 Hz kanalları — her biri tek bir FastBuf */
static FastBuf fb_motor_akim_sag;   /* Motor akım Sağ  [A]     */
static FastBuf fb_motor_akim_sol;   /* Motor akım Sol  [A]     */
static FastBuf fb_dc_akim;          /* DC hat akımı    [A]     */
static FastBuf fb_motor_rpm_sag;    /* Motor devir Sağ [rpm]   */
static FastBuf fb_motor_rpm_sol;    /* Motor devir Sol [rpm]   */
static FastBuf fb_gercek_hiz;       /* Araç hızı       [km/h]  */
static FastBuf fb_pompa_rpm;        /* Pompa devri     [rpm]   */
static FastBuf fb_gaz_talep;        /* Gaz talebi      [%]     */
static FastBuf fb_aci_sensor;       /* Açı sensörü     [ham]   */
static FastBuf fb_aci_deger;        /* Açı değeri      [°]     */
static FastBuf fb_lift;             /* Lift konumu     [%]     */

/* 1 Hz kanalları — son değer yeterli */
static int32_t val_koltuk    = 0;   /* 0=Boş 1=Dolu */
static int32_t val_hiz_modu  = 0;   /* 0=Yavaş 1=Hızlı */

/* 1/dk kanalları */
static int32_t val_batarya_soc      = 85;
static int32_t val_motor_sic_sag    = 30;
static int32_t val_motor_sic_sol    = 30;
static int32_t val_surucu_sic       = 28;
static int32_t val_pompa_motor_sic  = 29;
static int32_t val_pompa_surucu_sic = 27;

/* 1/sa kanalı */
static uint32_t val_calisma_saati = 0;

/* ================================================================
 *  YARDIMCI FONKSİYONLAR
 * ================================================================ */

/* PC/Hercules'e biçimlendirilmiş log yaz */
static void logpc(const char *fmt, ...)
{
    char tmp[256];
    va_list a;
    va_start(a, fmt); vsnprintf(tmp, sizeof(tmp), fmt, a); va_end(a);
    HAL_UART_Transmit(&huart2, (uint8_t *)tmp, strlen(tmp), 500);
}

/* Modem cevap tamponunu sıfırla */
static void mbuf_clear(void)
{ memset(big_buf, 0, sizeof(big_buf)); big_idx = 0; }

/* 'tok' big_buf'ta görünene ya da timeout dolana kadar bekle */
static uint8_t mbuf_wait(const char *tok, uint32_t ms)
{
    uint32_t t0 = HAL_GetTick();
    while ((HAL_GetTick() - t0) < ms) {
        if (strstr(big_buf, tok)) return 1;
        HAL_Delay(5);
    }
    return 0;
}

/* Modeme AT komutu gönder + ekrana yaz */
static void mat(const char *cmd)
{
    logpc("  >> %s\r\n", cmd);
    HAL_UART_Transmit(&huart1, (uint8_t *)cmd, strlen(cmd), 1000);
    HAL_UART_Transmit(&huart1, (uint8_t *)"\r\n", 2, 100);
}

/* Birikmiş modem cevabını ekrana dök */
static void mdump(void)
{ if (big_idx > 0) logpc("  << [%.*s]\r\n", (int)big_idx, big_buf); }

/* ── Buffer yardımcıları ──────────────────────────────────── */

/* FastBuf'a yeni örnek ekle; buffer doluysa en eskiyi at (ring) */
static void fb_push(FastBuf *b, int32_t val)
{
    if (b->n < FBUF_SIZE) {
        b->v[b->n++] = val;
    } else {
        memmove(&b->v[0], &b->v[1], (FBUF_SIZE - 1) * sizeof(int32_t));
        b->v[FBUF_SIZE - 1] = val;
    }
}

/* Buffer ortalamasını döndür; boşsa 0 */
static int32_t fb_avg(const FastBuf *b)
{
    if (b->n == 0) return 0;
    int32_t s = 0;
    for (uint8_t i = 0; i < b->n; i++) s += b->v[i];
    return s / (int32_t)b->n;
}

/* Bir buffer'ı sıfırla (gönderim sonrası) */
static void fb_clear(FastBuf *b) { b->n = 0; }

/* Tüm hızlı kanalları temizle */
static void fb_clear_all(void)
{
    fb_clear(&fb_motor_akim_sag); fb_clear(&fb_motor_akim_sol); fb_clear(&fb_dc_akim);
    fb_clear(&fb_motor_rpm_sag);  fb_clear(&fb_motor_rpm_sol);  fb_clear(&fb_gercek_hiz);
    fb_clear(&fb_pompa_rpm);      fb_clear(&fb_gaz_talep);
    fb_clear(&fb_aci_sensor);     fb_clear(&fb_aci_deger);      fb_clear(&fb_lift);
}

/* ================================================================
 *  GPRS BAŞLATMA — hata varsa sonsuz döngüde yeniden dener
 * ================================================================ */
static void gprs_init(void)
{
    for (;;) {
        logpc("\r\n===== GPRS BASLATIYOR =====\r\n");

        /* [1] TCP stack'i temizle (eski oturumlar) */
        mbuf_clear(); mat("AT+CIPSHUT");
        mbuf_wait("SHUT OK", 5000); mdump(); HAL_Delay(1000);

        /* [2] Kart / şebeke tanı */
        mbuf_clear(); mat("AT+CPIN?");  HAL_Delay(1000); mdump();
        mbuf_clear(); mat("AT+CSQ");    HAL_Delay(800);  mdump();
        mbuf_clear(); mat("AT+CREG?");  HAL_Delay(800);  mdump();

        /* [3] GPRS detach → re-attach (asılı kalmış attach'ı çözer) */
        logpc("  GPRS detach/re-attach...\r\n");
        mbuf_clear(); mat("AT+CGATT=0"); HAL_Delay(2000); mdump();
        mbuf_clear(); mat("AT+CGATT=1"); mbuf_wait("OK", 10000); mdump();
        HAL_Delay(1000);

        /* [4] Tek bağlantı modu (MUX=0: karışık cevap riski yok) */
        mbuf_clear();
        mat("AT+CIPMUX=0");    HAL_Delay(500);
        mat("AT+CIPMODE=0");   HAL_Delay(500);
        mat("AT+CIPQSEND=0");  HAL_Delay(500);
        mdump();

        /* [5] APN — operatöre göre "internet" / "mgbs" / "web" */
        mbuf_clear(); mat("AT+CSTT=\"internet\"");
        mbuf_wait("OK", 3000); mdump();

        /* [6] GPRS bağlantısını etkinleştir (fresh attach sonrası 5-10sn normal) */
        logpc("  CIICR bekleniyor (max 30sn)...\r\n");
        mbuf_clear(); mat("AT+CIICR");
        if (!mbuf_wait("OK", 30000)) {
            logpc("  [!] CIICR timeout — basa donuyor\r\n");
            mdump(); HAL_Delay(5000); continue;
        }
        mdump();

        /* [7] IP adresini al — en az bir rakam görmek yeterli */
        mbuf_clear(); mat("AT+CIFSR"); HAL_Delay(2000); mdump();
        uint8_t has_ip = 0;
        for (uint16_t i = 0; i < big_idx; i++) {
            if (big_buf[i] >= '0' && big_buf[i] <= '9') { has_ip = 1; break; }
        }
        if (!has_ip) {
            logpc("  [!] IP alinamadi — basa donuyor\r\n");
            HAL_Delay(3000); continue;
        }

        HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);  /* LED ON: hazır */
        logpc("===== GPRS HAZIR =====\r\n\r\n");
        return;
    }
}

/* ================================================================
 *  GÖREV FONKSİYONLARI
 * ================================================================ */

/* ── T_FAST (500ms): Hızlı sinyalleri buffer'a al ─────────────
 *  TODO: Her "mock" satırını gerçek CAN okumasıyla değiştirin.
 *        Örnek:  fb_push(&fb_motor_rpm_sag, CanApp_GetRpmSag());
 * ──────────────────────────────────────────────────────────── */
static void task_fast(void)
{
    uint32_t t = HAL_GetTick();

    /* Motor akımları — 0-200 A sawtooth (mock) */
    fb_push(&fb_motor_akim_sag, (int32_t)((t / 100) % 200));  /* TODO: CAN */
    fb_push(&fb_motor_akim_sol, (int32_t)((t / 110) % 190));  /* TODO: CAN */
    fb_push(&fb_dc_akim,        (int32_t)((t /  90) % 350));  /* TODO: CAN */

    /* Motor devir sayıları — 0-5000 rpm */
    fb_push(&fb_motor_rpm_sag, (int32_t)((t /  50) % 5000));  /* TODO: CAN */
    fb_push(&fb_motor_rpm_sol, (int32_t)((t /  55) % 4800));  /* TODO: CAN */

    /* Araç hızı — 0-20 km/h */
    fb_push(&fb_gercek_hiz,    (int32_t)((t / 500) %   20));  /* TODO: CAN */

    /* Pompa devri — 0-3000 rpm */
    fb_push(&fb_pompa_rpm,     (int32_t)((t /  80) % 3000));  /* TODO: CAN */

    /* Kullanıcı girdileri */
    fb_push(&fb_gaz_talep,  (int32_t)((t / 200) % 100));      /* TODO: CAN */
    fb_push(&fb_aci_sensor, (int32_t)((t / 300) % 100));      /* TODO: CAN */
    /* Açı: -45..+45 derece */
    fb_push(&fb_aci_deger,  (int32_t)(((t / 400) % 90) - 45));/* TODO: CAN */
    fb_push(&fb_lift,       (int32_t)((t / 600) % 100));      /* TODO: CAN */
}

/* ── T_1S (1sn): Durum sinyalleri ────────────────────────────── */
static void task_1s(void)
{
    val_koltuk   = (int32_t)((HAL_GetTick() / 10000) % 2);  /* TODO: CAN */
    val_hiz_modu = (int32_t)((HAL_GetTick() / 30000) % 2);  /* TODO: CAN */
}

/* ── T_1MIN (1dk): Sıcaklıklar + batarya SOC ─────────────────── */
static void task_1min(void)
{
    uint32_t dk = HAL_GetTick() / 60000;   /* kaçıncı dakika */

    /* Sıcaklıklar dakikada ~0.5°C artar, 80°C'de sabit kalır */
    val_motor_sic_sag    = 30 + (int32_t)(dk < 100 ? dk / 2 : 50);  /* TODO: CAN */
    val_motor_sic_sol    = 29 + (int32_t)(dk < 100 ? dk / 2 : 50);  /* TODO: CAN */
    val_surucu_sic       = 28 + (int32_t)(dk < 100 ? dk / 3 : 33);  /* TODO: CAN */
    val_pompa_motor_sic  = 27 + (int32_t)(dk < 100 ? dk / 3 : 33);  /* TODO: CAN */
    val_pompa_surucu_sic = 25 + (int32_t)(dk < 100 ? dk / 4 : 25);  /* TODO: CAN */

    /* SOC: her 5dk'da 1% düşer */
    val_batarya_soc = (int32_t)(85 - (int32_t)(dk / 5));
    if (val_batarya_soc < 0) val_batarya_soc = 0;                     /* TODO: CAN */
}

/* ── T_1HR (1saat): Çalışma saati sayacı ─────────────────────── */
static void task_1hr(void)
{
    val_calisma_saati = HAL_GetTick() / 3600000UL;  /* TODO: CAN/EEPROM */
}

/* ================================================================
 *  HTTP GET GÖNDERİMİ
 *  Tüm kanalları tek URL'de birleştirir, HTTP GET ile gönderir.
 * ================================================================ */
static uint8_t task_send(void)
{
    char path[600];
    char req[800];
    int  n;

    n = snprintf(path, sizeof(path), "/veri_al.php?DEVICE_ID=%d", DEVICE_ID);

    /* ── 2Hz kanalları: buffer ortalaması + temizle ──────────── */
    n += snprintf(path + n, sizeof(path) - n,
                  "&motor_akim_sag=%ld&motor_akim_sol=%ld&dc_akim=%ld",
                  (long)fb_avg(&fb_motor_akim_sag),
                  (long)fb_avg(&fb_motor_akim_sol),
                  (long)fb_avg(&fb_dc_akim));

    n += snprintf(path + n, sizeof(path) - n,
                  "&motor_rpm_sag=%ld&motor_rpm_sol=%ld&gercek_hiz=%ld&pompa_rpm=%ld",
                  (long)fb_avg(&fb_motor_rpm_sag),
                  (long)fb_avg(&fb_motor_rpm_sol),
                  (long)fb_avg(&fb_gercek_hiz),
                  (long)fb_avg(&fb_pompa_rpm));

    n += snprintf(path + n, sizeof(path) - n,
                  "&gaz_talep=%ld&aci_sensor=%ld&aci_deger=%ld&lift=%ld",
                  (long)fb_avg(&fb_gaz_talep),
                  (long)fb_avg(&fb_aci_sensor),
                  (long)fb_avg(&fb_aci_deger),
                  (long)fb_avg(&fb_lift));

    fb_clear_all();   /* gönderim sonrası tüm buffer'ları sıfırla */

    /* ── 1Hz kanalları: son değer ──────────────────────────── */
    n += snprintf(path + n, sizeof(path) - n,
                  "&koltuk=%ld&hiz_modu=%ld",
                  (long)val_koltuk, (long)val_hiz_modu);

    /* ── 1/dk kanalları ─────────────────────────────────────── */
    n += snprintf(path + n, sizeof(path) - n,
                  "&batarya_soc=%ld&motor_sic_sag=%ld&motor_sic_sol=%ld"
                  "&surucu_sic=%ld&pompa_motor_sic=%ld&pompa_surucu_sic=%ld",
                  (long)val_batarya_soc,
                  (long)val_motor_sic_sag, (long)val_motor_sic_sol,
                  (long)val_surucu_sic,
                  (long)val_pompa_motor_sic, (long)val_pompa_surucu_sic);

    /* ── 1/sa kanal ──────────────────────────────────────────── */
    n += snprintf(path + n, sizeof(path) - n,
                  "&calisma_saati=%lu",
                  (unsigned long)val_calisma_saati);

    logpc("\r\n--- GONDERIM (url_len=%d) ---\r\n", n);

    /* Önceki soketi kapat */
    mbuf_clear(); mat("AT+CIPCLOSE");
    mbuf_wait("CLOSE OK", 1500); mdump();

    /* TCP bağlan */
    {
        char cmd[128];
        snprintf(cmd, sizeof(cmd),
                 "AT+CIPSTART=\"TCP\",\"%s\",\"%u\"",
                 SERVER_HOST, (unsigned)SERVER_PORT);
        mbuf_clear(); mat(cmd);
    }

    uint8_t conn = 0;
    uint32_t t0 = HAL_GetTick();
    while ((HAL_GetTick() - t0) < 15000) {
        if (strstr(big_buf, "CONNECT OK") || strstr(big_buf, "ALREADY CONNECT")) { conn = 1; break; }
        if (strstr(big_buf, "CONNECT FAIL") || strstr(big_buf, "ERROR")) break;
        HAL_Delay(10);
    }
    mdump();

    if (!conn) {
        logpc("  [!] CONNECT FAIL — stack sifirla\r\n");
        mbuf_clear(); mat("AT+CIPSHUT");           mbuf_wait("SHUT OK", 3000);
        mbuf_clear(); mat("AT+CSTT=\"internet\"");  mbuf_wait("OK", 3000);
        mbuf_clear(); mat("AT+CIICR");             mbuf_wait("OK", 15000);
        mbuf_clear(); mat("AT+CIFSR");             mbuf_wait(".", 3000);
        return 0;
    }

    mbuf_clear(); mat("AT+CIPSEND");
    if (!mbuf_wait(">", 5000)) { mat("AT+CIPCLOSE"); return 0; }

    int rn = snprintf(req, sizeof(req),
                      "GET %s HTTP/1.1\r\n"
                      "Host: %s\r\n"
                      "Connection: close\r\n\r\n",
                      path, SERVER_HOST);
    mbuf_clear();
    HAL_UART_Transmit(&huart1, (uint8_t *)req, rn, 5000);
    uint8_t ctrlz = 0x1A;
    HAL_UART_Transmit(&huart1, &ctrlz, 1, 100);

    uint8_t ok = mbuf_wait("SEND OK", 10000); mdump();
    HAL_Delay(2000); mdump();

    mbuf_clear(); mat("AT+CIPCLOSE");
    mbuf_wait("CLOSE OK", 3000); mdump();

    if (ok) logpc("  => SUNUCU OK\r\n");
    else    logpc("  => SEND HATASI\r\n");

    return ok;
}

/* ================================================================
 *  MAIN — Başlatma + Görev Döngüsü
 * ================================================================ */
int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_USART2_UART_Init();
    MX_USART1_UART_Init();
    HAL_UART_Receive_IT(&huart1, &rx_byte, 1);

    logpc("\r\n======================================\r\n");
    logpc("  OMNITRACE  Forklift Telemetri\r\n");
    logpc("  Sunucu : %s:%d\r\n", SERVER_HOST, SERVER_PORT);
    logpc("  Cihaz  : DEVICE_ID=%d\r\n", DEVICE_ID);
    logpc("  Gonderim: %u ms\r\n", T_SEND);
    logpc("======================================\r\n\r\n");

    gprs_init();

    /* Görev zamanlayıcıları */
    uint32_t last_fast = HAL_GetTick();
    uint32_t last_1s   = HAL_GetTick();
    uint32_t last_1min = HAL_GetTick();
    uint32_t last_1hr  = HAL_GetTick();
    uint32_t last_send = HAL_GetTick() - T_SEND;  /* ilk gönderim hemen */

    /* İlk yavaş değerleri hesapla */
    task_1min();
    task_1hr();

    while (1)
    {
        uint32_t now = HAL_GetTick();

        /* 500ms: hızlı örnekleme */
        if ((now - last_fast) >= T_FAST) {
            last_fast += T_FAST;
            task_fast();
        }

        /* 1sn: durum sinyalleri */
        if ((now - last_1s) >= T_1S) {
            last_1s += T_1S;
            task_1s();
        }

        /* 1dk: sıcaklıklar + SOC */
        if ((now - last_1min) >= T_1MIN) {
            last_1min += T_1MIN;
            task_1min();
        }

        /* 1saat: çalışma saati */
        if ((now - last_1hr) >= T_1HR) {
            last_1hr += T_1HR;
            task_1hr();
        }

        /* 8sn: toplu gönderim — TCP bloklayıcı (~5-8sn) */
        if ((HAL_GetTick() - last_send) >= T_SEND) {
            last_send = HAL_GetTick();
            task_send();
            /* Uzun TCP bloğu sonrası burst görevleri önle */
            last_fast = HAL_GetTick();
            last_1s   = HAL_GetTick();
        }
    }
}

/* ================================================================
 *  UART ISR  (USART1 RX — her byte big_buf'a biriktirilir)
 * ================================================================ */
void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        if (big_idx < sizeof(big_buf) - 1)
            big_buf[big_idx++] = rx_byte;
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
    }
}

/* ================================================================
 *  CubeIDE tarafından üretilen init fonksiyonlarını buraya ekleyin:
 *
 *  void SystemClock_Config(void) { ... }
 *  static void MX_USART1_UART_Init(void) { ... }
 *  static void MX_USART2_UART_Init(void) { ... }
 *  static void MX_GPIO_Init(void) { ... }
 * ================================================================ */
