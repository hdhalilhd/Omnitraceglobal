/*
 * modem_http.c — SIM800L TCP üzerinden HTTP POST (mevcut AT komut akışını kullanır).
 * Cevaplar, main.c'deki USART1 RX kesmesi tarafından big_buffer'a biriktirilir.
 */
#include "modem_http.h"
#include "main.h"
#include <string.h>
#include <stdio.h>

extern UART_HandleTypeDef huart1;   /* SIM800L UART */
extern char     big_buffer[2048];   /* SIM800 cevap havuzu (ISR doldurur) */
extern uint16_t big_index;

static void modem_clear(void)
{
  memset(big_buffer, 0, 2048);
  big_index = 0;
}

static void modem_send_line(const char *cmd)
{
  HAL_UART_Transmit(&huart1, (uint8_t *)cmd, strlen(cmd), 1000);
  HAL_UART_Transmit(&huart1, (uint8_t *)"\r\n", 2, 100);
}

/* big_buffer içinde 'token' görünene kadar (veya timeout) bekle */
static uint8_t modem_wait(const char *token, uint32_t timeout)
{
  uint32_t start = HAL_GetTick();
  while ((HAL_GetTick() - start) < timeout) {
    if (strstr(big_buffer, token) != NULL) return 1;
    HAL_Delay(5);
  }
  return 0;
}

/* Genel: verilen path'e JSON POST eder (örn. "/veri_al.php"). */
uint8_t ModemHttp_PostPath(const char *host, uint16_t port,
                           const char *path, const char *json)
{
  char cmd[160];
  char req[1400];

  /* 1) Sunucuya TCP bağlan */
  modem_clear();
  snprintf(cmd, sizeof(cmd), "AT+CIPSTART=\"TCP\",\"%s\",\"%u\"", host, (unsigned)port);
  modem_send_line(cmd);
  if (!modem_wait("CONNECT OK", 12000)) {
    if (strstr(big_buffer, "ALREADY CONNECT") == NULL) {
      modem_send_line("AT+CIPCLOSE");
      return 0;
    }
  }

  /* 2) Gönderim moduna geç ('>' işaretini bekle) */
  modem_clear();
  modem_send_line("AT+CIPSEND");
  if (!modem_wait(">", 5000)) {
    modem_send_line("AT+CIPCLOSE");
    return 0;
  }

  /* 3) HTTP POST isteğini oluştur ve gönder */
  int jlen = (int)strlen(json);
  int rn = snprintf(req, sizeof(req),
                    "POST %s HTTP/1.1\r\n"
                    "Host: %s\r\n"
                    "Content-Type: application/json\r\n"
                    "Content-Length: %d\r\n"
                    "Connection: close\r\n\r\n"
                    "%s",
                    path, host, jlen, json);
  modem_clear();
  HAL_UART_Transmit(&huart1, (uint8_t *)req, rn, 5000);

  /* 4) CTRL+Z ile gönderimi tamamla */
  uint8_t ctrlz = 0x1A;
  HAL_UART_Transmit(&huart1, &ctrlz, 1, 100);

  /* 5) Sonucu bekle */
  uint8_t ok = modem_wait("SEND OK", 10000);

  /* 6) Bağlantıyı kapat */
  modem_send_line("AT+CIPCLOSE");
  modem_wait("CLOSE OK", 3000);
  return ok;
}

/* Genel: verilen path+query'ye HTTP GET yapar (senin çalışan ThingSpeak akışının
   aynısı; sadece adres farklı). Paylaşımlı hosting için 'Host' başlığı şart. */
uint8_t ModemHttp_GetPath(const char *host, uint16_t port, const char *pathWithQuery)
{
  char cmd[160];
  char req[400];

  /* 0) Onceki soketi kapat — KRITIK.
   *    Sunucu 'Connection: close' ile baglantiyi kapatinca modul "CLOSED" durumunda
   *    kalir; bu temizlik olmadan ikinci CIPSTART ERROR doner ("bir kez gonderir,
   *    sonra hep hata" sorununun sebebi buydu). */
  modem_send_line("AT+CIPCLOSE");
  modem_wait("CLOSE OK", 1500);            /* CLOSED/ERROR de gelebilir, onemsiz */

  /* 1) Sunucuya TCP baglan (CONNECT OK YA DA ALREADY CONNECT kabul) */
  modem_clear();
  snprintf(cmd, sizeof(cmd), "AT+CIPSTART=\"TCP\",\"%s\",\"%u\"", host, (unsigned)port);
  modem_send_line(cmd);

  uint8_t conn = 0;
  uint32_t t0 = HAL_GetTick();
  while ((HAL_GetTick() - t0) < 15000) {
    if (strstr(big_buffer, "CONNECT OK") || strstr(big_buffer, "ALREADY CONNECT")) { conn = 1; break; }
    if (strstr(big_buffer, "CONNECT FAIL") || strstr(big_buffer, "ERROR"))         { break; }
    HAL_Delay(10);
  }
  if (!conn) {
    /* Stack takildi -> tamamen sifirla, GPRS'i yeniden ac. Bu cevrim atlanir;
     * bir SONRAKI cevrim temiz bir baglantiyla devam eder. */
    modem_send_line("AT+CIPSHUT");           modem_wait("SHUT OK", 3000);
    modem_send_line("AT+CSTT=\"internet\"");  modem_wait("OK", 3000);
    modem_send_line("AT+CIICR");             modem_wait("OK", 8000);
    modem_clear();
    modem_send_line("AT+CIFSR");             modem_wait(".", 3000);   /* IP geldi mi */
    return 0;
  }

  /* 2) Gönderim moduna geç ('>' işaretini bekle) */
  modem_clear();
  modem_send_line("AT+CIPSEND");
  if (!modem_wait(">", 5000)) {
    modem_send_line("AT+CIPCLOSE");
    return 0;
  }

  /* 3) HTTP GET isteğini gönder (Host başlığı vhost yönlendirmesi için ZORUNLU) */
  int rn = snprintf(req, sizeof(req),
                    "GET %s HTTP/1.1\r\n"
                    "Host: %s\r\n"
                    "Connection: close\r\n\r\n",
                    pathWithQuery, host);
  modem_clear();
  HAL_UART_Transmit(&huart1, (uint8_t *)req, rn, 5000);

  /* 4) CTRL+Z ile gönderimi tamamla */
  uint8_t ctrlz = 0x1A;
  HAL_UART_Transmit(&huart1, &ctrlz, 1, 100);

  /* 5) Sonucu bekle */
  uint8_t ok = modem_wait("SEND OK", 10000);

  /* 6) Bağlantıyı kapat */
  modem_send_line("AT+CIPCLOSE");
  modem_wait("CLOSE OK", 3000);
  return ok;
}

/* Backend (Node) ham-frame ucu: POST /api/ingest/{serial}/can */
uint8_t ModemHttp_PostJson(const char *host, uint16_t port,
                           const char *deviceSerial, const char *json)
{
  char path[96];
  snprintf(path, sizeof(path), "/api/ingest/%s/can", deviceSerial);
  return ModemHttp_PostPath(host, port, path, json);
}
