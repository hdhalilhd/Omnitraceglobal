/**
 * MQTT ingest transport'u (ESP32 vb.).
 *   topic forklift/{deviceSerial}/can     ham CAN frame'leri
 *   topic forklift/{deviceSerial}/status  cihaz durum/heartbeat (+LWT)
 * Çözümleme ortak hatta (./process) yapılır.
 */
import mqtt, { MqttClient } from "mqtt";
import { config } from "../config";
import { processCanPayload, processStatus, CanPayload } from "./process";

let client: MqttClient | null = null;

function parseOnline(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.online === "boolean") return parsed.online;
  } catch {
    /* düz metin */
  }
  return raw.trim() !== "offline";
}

export function startMqtt(): MqttClient {
  client = mqtt.connect(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    reconnectPeriod: 3000,
  });

  client.on("connect", () => {
    console.log(`[mqtt] bağlandı: ${config.mqtt.url}`);
    client!.subscribe(["forklift/+/can", "forklift/+/status"], (err) => {
      if (err) console.error("[mqtt] subscribe hatası:", err.message);
      else console.log("[mqtt] abone: forklift/+/can, forklift/+/status");
    });
  });

  client.on("message", async (topic, message) => {
    try {
      const [, deviceSerial, kind] = topic.split("/");
      if (!deviceSerial) return;
      if (kind === "can") {
        await processCanPayload(deviceSerial, JSON.parse(message.toString()) as CanPayload);
      } else if (kind === "status") {
        await processStatus(deviceSerial, parseOnline(message.toString()));
      }
    } catch (err) {
      console.error("[mqtt] mesaj işleme hatası:", err instanceof Error ? err.message : err);
    }
  });

  client.on("error", (err) => console.error("[mqtt] hata:", err.message));
  return client;
}

export function stopMqtt(): void {
  client?.end();
}
