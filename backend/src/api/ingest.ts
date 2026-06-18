/**
 * HTTP ingest ucu — STM32 + SIM800L (GPRS/TCP) cihazları için.
 * Cihaz, MQTT yerine düz HTTP POST ile aynı JSON'u gönderir.
 *
 *   POST /api/ingest/{deviceSerial}/can     body: { ts, frames:[{ id, data:[8] }] }
 *   POST /api/ingest/{deviceSerial}/status  body: { online: true|false }
 *
 * Güvenlik: opsiyonel cihaz anahtarı. .env INGEST_TOKEN ayarlıysa, istekte
 * "x-device-token" başlığı eşleşmelidir (kullanıcı JWT'si GEREKMEZ — bu bir cihaz ucu).
 */
import { Router } from "express";
import { processCanPayload, processStatus, processHeartbeat } from "../ingest/process";

export const ingestRouter = Router();

ingestRouter.use((req, res, next) => {
  const expected = process.env.INGEST_TOKEN;
  if (expected && req.headers["x-device-token"] !== expected) {
    res.status(401).json({ error: "Geçersiz cihaz anahtarı" });
    return;
  }
  next();
});

ingestRouter.post("/:serial/can", async (req, res) => {
  await processCanPayload(req.params.serial, req.body);
  res.json({ ok: true });
});

ingestRouter.post("/:serial/status", async (req, res) => {
  await processStatus(req.params.serial, req.body?.online ?? true);
  res.json({ ok: true });
});

// Heartbeat — cihaz açılışta / periyodik "yaşıyorum" sinyali (CAN frame gerekmez)
ingestRouter.post("/:serial/heartbeat", async (req, res) => {
  await processHeartbeat(req.params.serial);
  res.json({ ok: true });
});
