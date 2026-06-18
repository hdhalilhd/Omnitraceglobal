/*
 * modem_http.h — SIM800L (USART1) üzerinden GPRS/TCP ile backend'e JSON POST.
 * GPRS'in zaten açık olduğu varsayılır (main.c içindeki SIM800() ile açılır).
 */
#ifndef MODEM_HTTP_H
#define MODEM_HTTP_H

#include <stdint.h>

/* Backend'e POST /api/ingest/{deviceSerial}/can gönderir. 1=SEND OK, 0=hata. */
uint8_t ModemHttp_PostJson(const char *host, uint16_t port,
                           const char *deviceSerial, const char *json);

/* Genel: verilen path'e JSON POST eder (örn. "/veri_al.php"). 1=SEND OK, 0=hata. */
uint8_t ModemHttp_PostPath(const char *host, uint16_t port,
                           const char *path, const char *json);

/* Genel: verilen path+query'ye HTTP GET yapar (kanıtlanmış ThingSpeak akışı).
   Örn. pathWithQuery = "/veri_al.php?DEVICE_ID=1&...". 1=SEND OK, 0=hata. */
uint8_t ModemHttp_GetPath(const char *host, uint16_t port,
                          const char *pathWithQuery);

#endif /* MODEM_HTTP_H */
