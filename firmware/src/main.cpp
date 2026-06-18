/*
 * Forklift Telemetri — ESP32 CAN -> MQTT köprüsü (İSKELET)
 * ----------------------------------------------------------------
 * ESP32 dahili TWAI (CAN) denetleyicisini kullanır (harici transceiver gerekir,
 * örn. SN65HVD230 / TJA1050). MCP2515 kullanıyorsanız TWAI yerine MCP_CAN
 * kütüphanesine geçirin.
 *
 * Akış: ilgili COB-ID'li CAN frame'lerini topla -> ~1 sn'de bir tek JSON paketi
 * olarak MQTT'ye publish et. ÇÖZÜMLEME YOK — ham frame gönderilir, sunucu çözer.
 *
 * Topic'ler:
 *   forklift/{DEVICE_ID}/can     -> { "ts": <ms>, "frames":[{ "id":398, "data":[...] }] }
 *   forklift/{DEVICE_ID}/status  -> { "online": true }   (+ LWT ile offline)
 */
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "driver/twai.h"

// ====== AYARLAR (kendi değerlerinizle değiştirin) ======
static const char *WIFI_SSID = "WIFI_ADINIZ";
static const char *WIFI_PASS = "WIFI_PAROLANIZ";
static const char *MQTT_HOST = "192.168.1.100"; // backend/broker IP
static const uint16_t MQTT_PORT = 1883;
static const char *DEVICE_ID = "ESP32-DEMO-001"; // DB'deki Device.serial ile aynı olmalı

// CAN transceiver pinleri (board'a göre değiştirin)
static const gpio_num_t CAN_TX_PIN = GPIO_NUM_5;
static const gpio_num_t CAN_RX_PIN = GPIO_NUM_4;

// CANopen node ID'leri
static const uint8_t NODE_TRACTION = 14;
static const uint8_t NODE_PUMP = 22;

static const uint32_t PUBLISH_INTERVAL_MS = 1000;
static const size_t MAX_FRAMES = 32;
// =========================================================

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

char topicCan[64];
char topicStatus[64];

struct Frame {
  uint32_t id;
  uint8_t len;
  uint8_t data[8];
};
Frame frameBuf[MAX_FRAMES];
size_t frameCount = 0;
uint32_t lastPublish = 0;

// İlgilendiğimiz COB-ID mi? (TPDO1-4, EMCY, heartbeat — her iki node için)
bool isRelevant(uint32_t id) {
  for (uint8_t node : {NODE_TRACTION, NODE_PUMP}) {
    if (id == (uint32_t)(0x180 + node)) return true; // TPDO1
    if (id == (uint32_t)(0x280 + node)) return true; // TPDO2
    if (id == (uint32_t)(0x380 + node)) return true; // TPDO3
    if (id == (uint32_t)(0x480 + node)) return true; // TPDO4
    if (id == (uint32_t)(0x080 + node)) return true; // EMCY
    if (id == (uint32_t)(0x700 + node)) return true; // Heartbeat
  }
  return false;
}

void setupWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi bağlanıyor");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.printf("\nWiFi OK: %s\n", WiFi.localIP().toString().c_str());
}

void setupCan() {
  twai_general_config_t g = TWAI_GENERAL_CONFIG_DEFAULT(CAN_TX_PIN, CAN_RX_PIN, TWAI_MODE_NORMAL);
  // CANopen için tipik hız: 250 kbit (sürücünüze göre 125/250/500 seçin)
  twai_timing_config_t t = TWAI_TIMING_CONFIG_250KBITS();
  twai_filter_config_t f = TWAI_FILTER_CONFIG_ACCEPT_ALL();
  if (twai_driver_install(&g, &t, &f) == ESP_OK && twai_start() == ESP_OK) {
    Serial.println("TWAI (CAN) başlatıldı");
  } else {
    Serial.println("TWAI başlatılamadı!");
  }
}

void mqttReconnect() {
  while (!mqtt.connected()) {
    Serial.print("MQTT bağlanıyor...");
    // LWT: cihaz kopunca status=offline yayınlanır
    StaticJsonDocument<64> willDoc;
    willDoc["online"] = false;
    char willMsg[64];
    serializeJson(willDoc, willMsg);
    if (mqtt.connect(DEVICE_ID, topicStatus, 0, false, willMsg)) {
      Serial.println("OK");
      StaticJsonDocument<64> doc;
      doc["online"] = true;
      char msg[64];
      serializeJson(doc, msg);
      mqtt.publish(topicStatus, msg);
    } else {
      Serial.printf("hata=%d, 3 sn sonra tekrar\n", mqtt.state());
      delay(3000);
    }
  }
}

void pollCan() {
  twai_message_t msg;
  while (twai_receive(&msg, 0) == ESP_OK) {
    if (msg.rtr || !isRelevant(msg.identifier)) continue;
    if (frameCount >= MAX_FRAMES) break;
    Frame &fr = frameBuf[frameCount++];
    fr.id = msg.identifier;
    fr.len = msg.data_length_code;
    for (int i = 0; i < 8; i++) fr.data[i] = (i < msg.data_length_code) ? msg.data[i] : 0;
  }
}

void publishBatch() {
  if (frameCount == 0) return;
  JsonDocument doc;
  doc["ts"] = (uint64_t)millis(); // gerçek projede NTP/RTC zaman damgası önerilir
  JsonArray frames = doc["frames"].to<JsonArray>();
  for (size_t i = 0; i < frameCount; i++) {
    JsonObject f = frames.add<JsonObject>();
    f["id"] = frameBuf[i].id;
    JsonArray d = f["data"].to<JsonArray>();
    for (int b = 0; b < 8; b++) d.add(frameBuf[i].data[b]);
  }
  char payload[1024];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(topicCan, (const uint8_t *)payload, n, false);
  frameCount = 0;
}

void setup() {
  Serial.begin(115200);
  snprintf(topicCan, sizeof(topicCan), "forklift/%s/can", DEVICE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "forklift/%s/status", DEVICE_ID);
  setupWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
  setupCan();
}

void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();
  pollCan();
  uint32_t now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
    publishBatch();
    lastPublish = now;
  }
}
