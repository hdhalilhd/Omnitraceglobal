/*
 * Forklift Telemetri — ESP32 + SIM800L (GPRS) + CAN (TWAI) -> MQTT
 * ==================================================================
 * Arduino IDE sketch'i.
 *
 * Donanım varsayımı:
 *   - ESP32 (Dev Module)
 *   - SIM800L GSM/GPRS modülü (UART)
 *   - CAN: ESP32 DAHİLİ TWAI denetleyicisi + harici transceiver IC
 *          (örn. SN65HVD230 / TJA1050). MCP2515 SPI modülü kullanıyorsanız
 *          CAN bölümünün mcp_can ile değiştirilmesi gerekir — söyleyin.
 *
 * Akış: ilgili COB-ID'li ham CAN frame'lerini topla -> ~1 sn'de bir tek JSON
 * paketi olarak SIM800L/GPRS üzerinden MQTT'ye publish et. ÇÖZÜMLEME YOK
 * (ham frame gönderilir, sunucu CAN map ile çözer).
 *
 * Topic'ler:
 *   forklift/{DEVICE_ID}/can     -> { "ts":<ms>, "frames":[{ "id":398,"data":[...] }] }
 *   forklift/{DEVICE_ID}/status  -> { "online":true }   (+ LWT ile offline)
 *
 * Arduino IDE kütüphaneleri (Library Manager):
 *   - TinyGSM           (Volodymyr Shymanskyy)
 *   - PubSubClient      (Nick O'Leary)
 *   - ArduinoJson       (Benoit Blanchon)
 *   (TWAI ESP32 çekirdeğinde gömülü; ayrı kütüphane gerekmez.)
 *
 * UYARI (güç): SIM800L iletim anında ~2A tepe akım çeker. ESP32'nin 3V3
 * pininden BESLEMEYİN. Ayrı 3.7–4.2V (veya modül kartınızın) güç kaynağı +
 * bol kondansatör (1000µF) kullanın, GND ortak olsun. Aksi halde sürekli reset.
 */

// ======================= AYARLAR =======================
// --- GPRS / operatör ---
const char APN[]       = "internet";   // Turkcell: "internet" | Vodafone: "internet" | TR Telekom: "internet"
const char GPRS_USER[] = "";
const char GPRS_PASS[] = "";

// --- MQTT (backend/broker) ---
const char* MQTT_HOST = "SUNUCU_IP_VEYA_DOMAIN"; // örn. "85.x.x.x" veya "telemetri.firma.com"
const int   MQTT_PORT = 1883;
const char* DEVICE_ID = "ESP32-SIM-001";          // DB'deki Device.serial ile AYNI olmalı
const char* MQTT_USER = "";                       // broker auth (yoksa boş)
const char* MQTT_PASS = "";

// --- SIM800L UART pinleri (TTGO T-Call varsayılanı; kendi kartınıza göre değiştirin) ---
#define MODEM_TX        27   // ESP32 TX -> SIM800L RX
#define MODEM_RX        26   // ESP32 RX <- SIM800L TX
#define MODEM_PWRKEY     4   // PWRKEY (yoksa -1 yapın)
#define MODEM_RST        5   // RESET  (yoksa -1 yapın)
#define MODEM_POWER_ON  23   // güç enable (yoksa -1 yapın)

// --- CAN (TWAI) pinleri ve hızı ---
#define CAN_TX_PIN      21
#define CAN_RX_PIN      22
// CANopen tipik hız: sürücünüze göre 125/250/500 kbps seçin
#define CAN_TIMING      TWAI_TIMING_CONFIG_250KBITS()

// --- CANopen node ID'leri ---
#define NODE_TRACTION   14   // yürüyüş
#define NODE_PUMP       22   // pompa

#define PUBLISH_INTERVAL_MS 1000
#define MAX_FRAMES          40
// =======================================================

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "driver/twai.h"

HardwareSerial SerialAT(1);
TinyGsm        modem(SerialAT);
TinyGsmClient  gsmClient(modem);
PubSubClient   mqtt(gsmClient);

char topicCan[64];
char topicStatus[64];

struct Frame { uint32_t id; uint8_t data[8]; };
Frame  frameBuf[MAX_FRAMES];
size_t frameCount = 0;
uint32_t lastPublish = 0;

// İlgilendiğimiz COB-ID mi? (TPDO1-4, EMCY, heartbeat — her iki node için)
bool isRelevant(uint32_t id) {
  uint8_t nodes[2] = { NODE_TRACTION, NODE_PUMP };
  for (uint8_t i = 0; i < 2; i++) {
    uint8_t n = nodes[i];
    if (id == (uint32_t)(0x180 + n)) return true; // TPDO1
    if (id == (uint32_t)(0x280 + n)) return true; // TPDO2
    if (id == (uint32_t)(0x380 + n)) return true; // TPDO3
    if (id == (uint32_t)(0x480 + n)) return true; // TPDO4
    if (id == (uint32_t)(0x080 + n)) return true; // EMCY
    if (id == (uint32_t)(0x700 + n)) return true; // Heartbeat
  }
  return false;
}

// ----------------- SIM800L -----------------
void powerOnModem() {
  if (MODEM_POWER_ON >= 0) { pinMode(MODEM_POWER_ON, OUTPUT); digitalWrite(MODEM_POWER_ON, HIGH); }
  if (MODEM_RST >= 0)      { pinMode(MODEM_RST, OUTPUT); digitalWrite(MODEM_RST, HIGH); }
  if (MODEM_PWRKEY >= 0) {
    pinMode(MODEM_PWRKEY, OUTPUT);
    digitalWrite(MODEM_PWRKEY, LOW);  delay(1000);   // SIM800L için ~1 sn LOW darbe
    digitalWrite(MODEM_PWRKEY, HIGH);
  }
  delay(3000);
}

void setupModem() {
  SerialAT.begin(9600, SERIAL_8N1, MODEM_RX, MODEM_TX);
  powerOnModem();
  Serial.println("Modem başlatılıyor...");
  modem.restart();                 // uzun sürebilir
  Serial.print("Şebeke bekleniyor...");
  if (!modem.waitForNetwork(60000L)) { Serial.println(" başarısız"); return; }
  Serial.println(" OK");
  Serial.print("GPRS bağlanıyor...");
  if (!modem.gprsConnect(APN, GPRS_USER, GPRS_PASS)) { Serial.println(" başarısız"); return; }
  Serial.println(" OK");
}

void ensureGprs() {
  if (!modem.isGprsConnected()) {
    Serial.println("GPRS koptu, yeniden bağlanıyor...");
    if (!modem.isNetworkConnected()) modem.waitForNetwork(60000L);
    modem.gprsConnect(APN, GPRS_USER, GPRS_PASS);
  }
}

// ----------------- CAN (TWAI) -----------------
void setupCan() {
  twai_general_config_t g =
      TWAI_GENERAL_CONFIG_DEFAULT((gpio_num_t)CAN_TX_PIN, (gpio_num_t)CAN_RX_PIN, TWAI_MODE_NORMAL);
  twai_timing_config_t t = CAN_TIMING;
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&g, &t, &f) == ESP_OK && twai_start() == ESP_OK)
    Serial.println("TWAI (CAN) başlatıldı");
  else
    Serial.println("TWAI başlatılamadı!");
}

void pollCan() {
  twai_message_t msg;
  while (twai_receive(&msg, 0) == ESP_OK) {
    if (msg.rtr || msg.extd) continue;            // RTR ve genişletilmiş ID'leri atla
    if (!isRelevant(msg.identifier)) continue;
    if (frameCount >= MAX_FRAMES) break;
    Frame &fr = frameBuf[frameCount++];
    fr.id = msg.identifier;
    for (int i = 0; i < 8; i++) fr.data[i] = (i < msg.data_length_code) ? msg.data[i] : 0;
  }
}

// ----------------- MQTT -----------------
void mqttConnect() {
  while (!mqtt.connected()) {
    ensureGprs();
    Serial.print("MQTT bağlanıyor...");
    StaticJsonDocument<48> willDoc; willDoc["online"] = false;
    char willMsg[48]; serializeJson(willDoc, willMsg);
    bool ok = (strlen(MQTT_USER) > 0)
      ? mqtt.connect(DEVICE_ID, MQTT_USER, MQTT_PASS, topicStatus, 0, false, willMsg)
      : mqtt.connect(DEVICE_ID, topicStatus, 0, false, willMsg);
    if (ok) {
      Serial.println(" OK");
      StaticJsonDocument<48> doc; doc["online"] = true;
      char msg[48]; serializeJson(doc, msg);
      mqtt.publish(topicStatus, msg);
    } else {
      Serial.printf(" hata=%d, 3 sn sonra tekrar\n", mqtt.state());
      delay(3000);
    }
  }
}

void publishBatch() {
  if (frameCount == 0) return;
  JsonDocument doc;
  doc["ts"] = (uint64_t)millis();   // Sahada NTP/şebeke zamanı önerilir (modem.getGSMDateTime)
  JsonArray frames = doc["frames"].to<JsonArray>();
  for (size_t i = 0; i < frameCount; i++) {
    JsonObject f = frames.add<JsonObject>();
    f["id"] = frameBuf[i].id;
    JsonArray d = f["data"].to<JsonArray>();
    for (int b = 0; b < 8; b++) d.add(frameBuf[i].data[b]);
  }
  char payload[1200];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(topicCan, (const uint8_t*)payload, n, false);
  frameCount = 0;
}

void setup() {
  Serial.begin(115200);
  snprintf(topicCan, sizeof(topicCan), "forklift/%s/can", DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "forklift/%s/status", DEVICE_ID);

  setupCan();
  setupModem();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1200);          // JSON paketi 256B'den büyük olabilir
  mqtt.setKeepAlive(30);
}

void loop() {
  if (!mqtt.connected()) mqttConnect();
  mqtt.loop();

  pollCan();

  uint32_t now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    publishBatch();
    lastPublish = now;
  }
}
