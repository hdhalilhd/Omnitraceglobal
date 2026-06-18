/*
 * can_app.c — FDCAN1 (STM32G431) sürücüsü, 250 kbps @ PA11/PA12.
 * Çözümleme YOK: ham frame'ler backend'e gönderilir, sunucu CAN map ile çözer.
 */
#include "can_app.h"
#include <stdio.h>
#include <string.h>

/* CANopen node ID'leri (backend ile aynı varsayım) */
#define NODE_TRACTION 14  /* yürüyüş */
#define NODE_PUMP     22  /* pompa */

FDCAN_HandleTypeDef hfdcan1;

/* Bu COB-ID ilgilendiğimiz bir frame mi? (TPDO1-4, EMCY, heartbeat) */
static int isRelevant(uint32_t id)
{
  const uint8_t nodes[2] = { NODE_TRACTION, NODE_PUMP };
  for (int i = 0; i < 2; i++) {
    uint8_t n = nodes[i];
    if (id == (uint32_t)(0x180 + n)) return 1; /* TPDO1 */
    if (id == (uint32_t)(0x280 + n)) return 1; /* TPDO2 */
    if (id == (uint32_t)(0x380 + n)) return 1; /* TPDO3 */
    if (id == (uint32_t)(0x480 + n)) return 1; /* TPDO4 */
    if (id == (uint32_t)(0x080 + n)) return 1; /* EMCY  */
    if (id == (uint32_t)(0x700 + n)) return 1; /* Heartbeat */
  }
  return 0;
}

/* HAL bu zayıf fonksiyonu HAL_FDCAN_Init içinden çağırır: saat + GPIO + pin AF */
void HAL_FDCAN_MspInit(FDCAN_HandleTypeDef *fdcanHandle)
{
  GPIO_InitTypeDef GPIO_InitStruct = {0};
  RCC_PeriphCLKInitTypeDef PeriphClkInit = {0};

  if (fdcanHandle->Instance == FDCAN1) {
    /* FDCAN çekirdek saatini PCLK1'e (16 MHz) bağla — bit timing buna göre hesaplandı */
    PeriphClkInit.PeriphClockSelection = RCC_PERIPHCLK_FDCAN;
    PeriphClkInit.FdcanClockSelection = RCC_FDCANCLKSOURCE_PCLK1;
    HAL_RCCEx_PeriphCLKConfig(&PeriphClkInit);

    __HAL_RCC_FDCAN_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /* PA11 = FDCAN1_RX, PA12 = FDCAN1_TX (AF9) */
    GPIO_InitStruct.Pin = GPIO_PIN_11 | GPIO_PIN_12;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF9_FDCAN1;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
  }
}

HAL_StatusTypeDef CanApp_Init(void)
{
  hfdcan1.Instance = FDCAN1;
  hfdcan1.Init.ClockDivider = FDCAN_CLOCK_DIV1;
  hfdcan1.Init.FrameFormat = FDCAN_FRAME_CLASSIC; /* klasik CAN (CAN-FD değil) */
  hfdcan1.Init.Mode = FDCAN_MODE_NORMAL;
  hfdcan1.Init.AutoRetransmission = ENABLE;
  hfdcan1.Init.TransmitPause = DISABLE;
  hfdcan1.Init.ProtocolException = DISABLE;

  /* 250 kbps @ 16 MHz: 1(sync) + 50 + 13 = 64 tq, prescaler 1, örnek noktası ~%80 */
  hfdcan1.Init.NominalPrescaler = 1;
  hfdcan1.Init.NominalSyncJumpWidth = 13;
  hfdcan1.Init.NominalTimeSeg1 = 50;
  hfdcan1.Init.NominalTimeSeg2 = 13;

  /* Klasik CAN'de kullanılmaz ama HAL geçerli değer ister */
  hfdcan1.Init.DataPrescaler = 1;
  hfdcan1.Init.DataSyncJumpWidth = 1;
  hfdcan1.Init.DataTimeSeg1 = 1;
  hfdcan1.Init.DataTimeSeg2 = 1;

  hfdcan1.Init.StdFiltersNbr = 0;
  hfdcan1.Init.ExtFiltersNbr = 0;
  hfdcan1.Init.TxFifoQueueMode = FDCAN_TX_FIFO_OPERATION;

  if (HAL_FDCAN_Init(&hfdcan1) != HAL_OK) return HAL_ERROR;

  /* Eşleşmeyen tüm çerçeveleri RX FIFO0'a kabul et, remote frame'leri reddet */
  if (HAL_FDCAN_ConfigGlobalFilter(&hfdcan1,
        FDCAN_ACCEPT_IN_RX_FIFO0, FDCAN_ACCEPT_IN_RX_FIFO0,
        FDCAN_REJECT_REMOTE, FDCAN_REJECT_REMOTE) != HAL_OK) {
    return HAL_ERROR;
  }

  return HAL_FDCAN_Start(&hfdcan1);
}

void CanApp_Poll(CanFrame *buf, uint16_t maxFrames, uint16_t *count)
{
  FDCAN_RxHeaderTypeDef rxHeader;
  uint8_t rxData[8];

  while (HAL_FDCAN_GetRxFifoFillLevel(&hfdcan1, FDCAN_RX_FIFO0) > 0 && *count < maxFrames) {
    if (HAL_FDCAN_GetRxMessage(&hfdcan1, FDCAN_RX_FIFO0, &rxHeader, rxData) != HAL_OK) break;
    if (rxHeader.IdType != FDCAN_STANDARD_ID) continue;       /* sadece 11-bit */
    if (rxHeader.RxFrameType != FDCAN_DATA_FRAME) continue;   /* remote yok */
    if (!isRelevant(rxHeader.Identifier)) continue;

    uint8_t len = (uint8_t)(rxHeader.DataLength >> 16); /* DLC kodundan bayt sayısı */
    if (len > 8) len = 8;

    CanFrame *f = &buf[(*count)++];
    f->id = rxHeader.Identifier;
    f->dlc = len;
    for (int i = 0; i < 8; i++) f->data[i] = (i < len) ? rxData[i] : 0;
  }
}

int CanApp_BuildJson(const CanFrame *buf, uint16_t count, char *out, int outSize, uint32_t ts)
{
  int n = snprintf(out, outSize, "{\"ts\":%lu,\"frames\":[", (unsigned long)ts);
  for (uint16_t i = 0; i < count; i++) {
    if (n >= outSize - 64) break; /* taşma koruması */
    const uint8_t *d = buf[i].data;
    n += snprintf(out + n, outSize - n,
                  "%s{\"id\":%lu,\"data\":[%u,%u,%u,%u,%u,%u,%u,%u]}",
                  (i ? "," : ""), (unsigned long)buf[i].id,
                  d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7]);
  }
  n += snprintf(out + n, outSize - n, "]}");
  return n;
}

/* ---- Hostinger (veri_al.php) için değer çıkarma ---- */
static const CanFrame *findFrame(const CanFrame *buf, uint16_t count, uint32_t id)
{
  for (uint16_t i = 0; i < count; i++) {
    if (buf[i].id == id) return &buf[i];
  }
  return NULL;
}

static int16_t i16le(const uint8_t *d, int off)
{
  return (int16_t)(d[off] | (d[off + 1] << 8));
}

/*
 * TASLAK eşleme — gerçek PDO map gelince burayı düzeltin:
 *   KOLTUK  : 0x18E (yürüyüş TPDO1) bayt 2  (0/1)
 *   STEERING: 0x18E bayt 6-7 (int16)
 *   SAG_RPM : 0x28E (TPDO2) bayt 0-1 (int16)
 *   SOL_RPM : 0x38E (TPDO3) bayt 0-1 (int16)
 */
void CanApp_Extract(const CanFrame *buf, uint16_t count,
                    int *koltuk, int *sagRpm, int *solRpm, int *steering)
{
  *koltuk = 0; *sagRpm = 0; *solRpm = 0; *steering = 0;
  const CanFrame *f;
  if ((f = findFrame(buf, count, 0x18E)) != NULL) { *koltuk = f->data[2]; *steering = i16le(f->data, 6); }
  if ((f = findFrame(buf, count, 0x28E)) != NULL) { *sagRpm = i16le(f->data, 0); }
  if ((f = findFrame(buf, count, 0x38E)) != NULL) { *solRpm = i16le(f->data, 0); }
}
