/*
 * can_app.h — Forklift telemetri için FDCAN1 (STM32G431) sürücüsü
 * FDCAN1: PA11 (RX) / PA12 (TX), 250 kbps. Ham frame'leri okur, JSON'a paketler.
 */
#ifndef CAN_APP_H
#define CAN_APP_H

#include "stm32g4xx_hal.h"
#include <stdint.h>

/* ----------------------------------------------------------------------------
 * CAN MESAJ YAPISI
 * NOT: Kendi CAN mesaj yapınız (paylaşacağınız "aşağıdaki kod") farklıysa
 * bu struct'ı ona göre güncelleyin; CanApp_Poll / CanApp_BuildJson da uyarlanır.
 * -------------------------------------------------------------------------- */
typedef struct {
  uint32_t id;        /* COB-ID (11-bit standart) */
  uint8_t  dlc;       /* veri uzunluğu (0..8) */
  uint8_t  data[8];   /* veri baytları */
} CanFrame;

extern FDCAN_HandleTypeDef hfdcan1;

/* FDCAN1'i başlat (250 kbps, PA11/PA12). HAL_OK dönerse hazır. */
HAL_StatusTypeDef CanApp_Init(void);

/* RX FIFO0'ı boşalt; ilgili COB-ID'leri buf'a ekler, *count'u günceller. */
void CanApp_Poll(CanFrame *buf, uint16_t maxFrames, uint16_t *count);

/* Frame dizisini backend formatında JSON'a yazar:
 * {"ts":<ms>,"frames":[{"id":398,"data":[..8..]},...]}
 * Yazılan bayt sayısını döner. */
int CanApp_BuildJson(const CanFrame *buf, uint16_t count, char *out, int outSize, uint32_t ts);

/* TASLAK: CAN frame'lerinden Hostinger (veri_al.php) için değerleri çıkarır.
 * Gerçek PDO map gelince can_app.c içindeki COB-ID/bayt konumlarını güncelleyin. */
void CanApp_Extract(const CanFrame *buf, uint16_t count,
                    int *koltuk, int *sagRpm, int *solRpm, int *steering);

#endif /* CAN_APP_H */
