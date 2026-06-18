/**
 * Ortak telemetri işleme hattı — hem MQTT (ESP32) hem HTTP (STM32+SIM800L)
 * aynı mantığı kullanır: ham CAN frame'lerini CAN map ile çöz, telemetry'ye yaz,
 * son değeri güncelle, WS yayınla; EMCY -> error_logs.
 */
import { prisma } from "../db";
import { RawFrame, decodeFrame, decodeEmcy, isEmcyFrame, isHeartbeatFrame } from "../canmap/decoder";
import { Source, HEARTBEAT_COB_IDS } from "../canmap/signals";
import { updateLatest } from "../latest";
import { emitTelemetry, emitErrorLog, emitVehicleStatus, emitHeartbeat } from "../ws";
import { SourceType, Severity } from "@prisma/client";

export interface CanPayload {
  ts?: number;
  frames: RawFrame[];
}

// deviceSerial -> { vehicleId } çözümleme önbelleği (kısa ömürlü)
const vehicleCache = new Map<string, { vehicleId: number; deviceId: number; at: number }>();
const CACHE_TTL = 30_000;

async function resolveVehicle(
  deviceSerial: string,
): Promise<{ vehicleId: number; deviceId: number } | null> {
  const cached = vehicleCache.get(deviceSerial);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached;

  const device = await prisma.device.findUnique({
    where: { serial: deviceSerial },
    include: { vehicle: true },
  });
  if (!device || !device.vehicle) return null;

  const entry = { vehicleId: device.vehicle.id, deviceId: device.id, at: Date.now() };
  vehicleCache.set(deviceSerial, entry);
  return entry;
}

const toEnum = (s: Source): SourceType =>
  s === "traction" ? SourceType.TRACTION : SourceType.PUMP;

/** telemetry tablosuna toplu (multi-row) insert */
async function insertTelemetry(
  vehicleId: number,
  time: Date,
  rows: { signalKey: string; source: Source; value: number; raw: number }[],
): Promise<void> {
  if (rows.length === 0) return;
  const cols = 6;
  const placeholders = rows
    .map(
      (_, i) =>
        `($${i * cols + 1},$${i * cols + 2},$${i * cols + 3},$${i * cols + 4},$${i * cols + 5},$${i * cols + 6})`,
    )
    .join(",");
  const params: unknown[] = [];
  for (const r of rows) params.push(time, vehicleId, r.signalKey, r.source, r.value, r.raw);
  await prisma.$executeRawUnsafe(
    `INSERT INTO telemetry (time, vehicle_id, signal_key, source, value, raw) VALUES ${placeholders}`,
    ...params,
  );
}

/** Bir cihazın CAN paketini işle (transport-bağımsız) */
export async function processCanPayload(
  deviceSerial: string,
  payload: CanPayload,
): Promise<void> {
  if (!payload || !Array.isArray(payload.frames)) return;
  const v = await resolveVehicle(deviceSerial);
  if (!v) return; // eşleşmemiş cihaz — yoksay

  const time = payload.ts ? new Date(payload.ts) : new Date();
  const tsMs = time.getTime();
  const rows: { signalKey: string; source: Source; value: number; raw: number }[] = [];

  for (const frame of payload.frames) {
    if (isHeartbeatFrame(frame.id)) {
      const meta = HEARTBEAT_COB_IDS[frame.id];
      emitHeartbeat(v.vehicleId, {
        vehicleId: v.vehicleId,
        source: meta?.source,
        nodeId: meta?.nodeId,
        state: frame.data[0] ?? null, // CANopen NMT state (0x05=operasyonel)
        ts: tsMs,
      });
      continue;
    }
    if (isEmcyFrame(frame.id)) {
      await handleEmcy(v.vehicleId, frame, time);
      continue;
    }
    for (const d of decodeFrame(frame)) {
      rows.push({ signalKey: d.signalKey, source: d.source, value: d.value, raw: d.raw });
      updateLatest(v.vehicleId, {
        signalKey: d.signalKey,
        label: d.label,
        source: d.source,
        value: d.value,
        raw: d.raw,
        unit: d.unit,
        ts: tsMs,
      });
    }
  }

  if (rows.length > 0) {
    await insertTelemetry(v.vehicleId, time, rows);
    emitTelemetry(v.vehicleId, {
      vehicleId: v.vehicleId,
      ts: tsMs,
      signals: rows.map((r) => ({ signalKey: r.signalKey, source: r.source, value: r.value })),
    });
  }

  await touchDevice(v.deviceId, v.vehicleId, true);
}

async function handleEmcy(vehicleId: number, frame: RawFrame, time: Date): Promise<void> {
  const emcy = decodeEmcy(frame);
  if (!emcy) return;
  const sourceEnum = toEnum(emcy.source);

  if (emcy.errorCode === 0) {
    await prisma.errorLog.updateMany({
      where: { vehicleId, source: sourceEnum, active: true },
      data: { active: false, clearedAt: time },
    });
    return;
  }

  const fault =
    (await prisma.faultCode.findFirst({ where: { code: emcy.errorCode, source: sourceEnum } })) ??
    (await prisma.faultCode.findFirst({ where: { code: emcy.errorCode, source: null } }));

  const existingActive = await prisma.errorLog.findFirst({
    where: { vehicleId, source: sourceEnum, emcyCode: emcy.errorCode, active: true },
  });
  if (existingActive) return;

  const created = await prisma.errorLog.create({
    data: {
      time,
      vehicleId,
      source: sourceEnum,
      nodeId: emcy.nodeId,
      emcyCode: emcy.errorCode,
      emcyCodeHex: emcy.errorCodeHex,
      errorRegister: emcy.errorRegister,
      vendorBytes: emcy.vendorBytes,
      description: fault?.descriptionTr ?? "Bilinmeyen hata kodu",
      severity: fault?.severity ?? Severity.WARNING,
      faultCodeId: fault?.id ?? null,
      active: true,
    },
    include: { vehicle: { select: { chassisNo: true, name: true } } },
  });

  emitErrorLog(vehicleId, created);
}

/** Cihaz durum bilgisi (online/offline) */
export async function processStatus(deviceSerial: string, online: boolean): Promise<void> {
  const v = await resolveVehicle(deviceSerial);
  if (!v) return;
  await touchDevice(v.deviceId, v.vehicleId, online);
}

/** Cihaz heartbeat'i — CAN frame'i olmadan "yaşıyorum" sinyali (örn. cihaz açılışı) */
export async function processHeartbeat(deviceSerial: string): Promise<void> {
  const v = await resolveVehicle(deviceSerial);
  if (!v) return;
  await touchDevice(v.deviceId, v.vehicleId, true);
  emitHeartbeat(v.vehicleId, { vehicleId: v.vehicleId, ts: Date.now() });
}

async function touchDevice(deviceId: number, vehicleId: number, online: boolean): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: { online, lastSeen: new Date() },
  });
  const status = online ? "ACTIVE" : "OFFLINE";
  await prisma.vehicle.update({ where: { id: vehicleId }, data: { status } });
  emitVehicleStatus(vehicleId, status);
}
