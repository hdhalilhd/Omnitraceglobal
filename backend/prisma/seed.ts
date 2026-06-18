/**
 * Seed: admin kullanıcı, sinyal tanımları (CAN map'ten), örnek hata kodları,
 * demo araç (304MB100104) + cihaz + varsayılan dashboard düzeni.
 *
 * Çalıştır:  npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, Severity, SourceType } from "@prisma/client";
import { SIGNALS, Source } from "../src/canmap/signals";

const prisma = new PrismaClient();

const toEnum = (s: Source): SourceType =>
  s === "traction" ? SourceType.TRACTION : SourceType.PUMP;

// Örnek CANopen EMCY hata kodları (TR). Gerçek sözlüğü siz vereceksiniz.
const FAULT_CODES: {
  code: number;
  source: SourceType | null;
  descriptionTr: string;
  severity: Severity;
  recommendedAction?: string;
}[] = [
  { code: 0x0000, source: null, descriptionTr: "Hata yok / hata sıfırlandı", severity: Severity.INFO },
  { code: 0x1000, source: null, descriptionTr: "Genel hata", severity: Severity.WARNING, recommendedAction: "Detay için üretici baytlarına bakın" },
  { code: 0x2310, source: null, descriptionTr: "Çıkış aşırı akım", severity: Severity.CRITICAL, recommendedAction: "Motor/kablo kısa devre kontrolü" },
  { code: 0x3210, source: null, descriptionTr: "Aşırı gerilim (overvoltage)", severity: Severity.CRITICAL, recommendedAction: "Akü/şarj devresini kontrol edin" },
  { code: 0x3220, source: null, descriptionTr: "Düşük gerilim (undervoltage)", severity: Severity.WARNING, recommendedAction: "Akü şarj seviyesini kontrol edin" },
  { code: 0x4210, source: null, descriptionTr: "Aşırı sıcaklık", severity: Severity.CRITICAL, recommendedAction: "Soğutma/yük kontrolü, makineyi dinlendirin" },
  { code: 0x5530, source: null, descriptionTr: "Donanım/bellek hatası", severity: Severity.CRITICAL },
  { code: 0x8110, source: null, descriptionTr: "CAN denetleyici taşması (overrun)", severity: Severity.WARNING },
  { code: 0x8130, source: null, descriptionTr: "Heartbeat / life-guard hatası", severity: Severity.WARNING, recommendedAction: "CAN bağlantısı/sürücü iletişimi" },
  { code: 0x2350, source: SourceType.TRACTION, descriptionTr: "Yürüyüş motoru aşırı akım", severity: Severity.CRITICAL },
  { code: 0x2351, source: SourceType.PUMP, descriptionTr: "Pompa motoru aşırı akım", severity: Severity.CRITICAL },
];

async function main() {
  // --- Admin kullanıcı ---
  const passwordHash = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@forklift.local" },
    update: {},
    create: {
      email: "admin@forklift.local",
      name: "Yönetici",
      role: "ADMIN",
      passwordHash,
    },
  });
  console.log("✓ admin kullanıcı (admin@forklift.local / admin123)");

  // --- Sinyal tanımları (CAN map'ten) ---
  for (let i = 0; i < SIGNALS.length; i++) {
    const s = SIGNALS[i];
    await prisma.signalDef.upsert({
      where: { key: s.key },
      update: {
        label: s.label,
        source: toEnum(s.source),
        cobId: s.cobId,
        unit: s.unit,
        dataType: s.dataType,
        decimals: s.decimals ?? 0,
        min: s.min ?? null,
        max: s.max ?? null,
        sortKey: i,
      },
      create: {
        key: s.key,
        label: s.label,
        source: toEnum(s.source),
        cobId: s.cobId,
        unit: s.unit,
        dataType: s.dataType,
        decimals: s.decimals ?? 0,
        min: s.min ?? null,
        max: s.max ?? null,
        sortKey: i,
      },
    });
  }
  // CAN map'ten kaldırılmış eski sinyalleri temizle
  await prisma.signalDef.deleteMany({ where: { key: { notIn: SIGNALS.map((s) => s.key) } } });
  console.log(`✓ ${SIGNALS.length} sinyal tanımı`);

  // --- Hata kodları sözlüğü ---
  for (const fc of FAULT_CODES) {
    const existing = await prisma.faultCode.findFirst({
      where: { code: fc.code, source: fc.source },
    });
    if (!existing) {
      await prisma.faultCode.create({ data: fc });
    }
  }
  console.log(`✓ ${FAULT_CODES.length} hata kodu`);

  // --- Demo cihaz + araç ---
  const device = await prisma.device.upsert({
    where: { serial: "ESP32-DEMO-001" },
    update: {},
    create: { serial: "ESP32-DEMO-001", mqttClientId: "ESP32-DEMO-001", fwVersion: "0.1.0" },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { chassisNo: "304MB100104" },
    update: {},
    create: {
      chassisNo: "304MB100104",
      model: "EF-25",
      type: "Electric Forklift",
      name: "Depo Forklift #1",
      tractionNodeId: 14,
      pumpNodeId: 22,
      status: "OFFLINE",
      deviceId: device.id,
      locationLabel: "Gaziantep Deposu",
    },
  });
  console.log(`✓ demo araç ${vehicle.chassisNo} (id=${vehicle.id})`);

  // --- Gerçek STM32 cihazı + aracı (firmware DEVICE_SERIAL ile aynı) ---
  const stmDevice = await prisma.device.upsert({
    where: { serial: "STM32-SIM-001" },
    update: {},
    create: { serial: "STM32-SIM-001", mqttClientId: "STM32-SIM-001", fwVersion: "0.1.0" },
  });
  const stmVehicle = await prisma.vehicle.upsert({
    where: { chassisNo: "304MB100200" },
    update: {},
    create: {
      chassisNo: "304MB100200",
      model: "EF-25",
      type: "Electric Forklift",
      name: "Saha Forklift (STM32)",
      tractionNodeId: 14,
      pumpNodeId: 22,
      status: "OFFLINE",
      deviceId: stmDevice.id,
      locationLabel: "Saha",
    },
  });
  console.log(`✓ STM32 aracı ${stmVehicle.chassisNo} (id=${stmVehicle.id})`);

  // --- Varsayılan dashboard düzeni ---
  const defaultWidgets = [
    { signalKey: "traction.gas_pedal", type: "gauge", x: 0, y: 0, w: 3, h: 2 },
    { signalKey: "traction.vehicle_speed", type: "gauge", x: 3, y: 0, w: 3, h: 2 },
    { signalKey: "traction.wheel_rpm", type: "number", x: 6, y: 0, w: 3, h: 2 },
    { signalKey: "traction.seat", type: "number", x: 9, y: 0, w: 3, h: 2 },
    { signalKey: "traction.battery_soc", type: "gauge", x: 0, y: 2, w: 3, h: 2 },
    { signalKey: "traction.motor_rpm", type: "number", x: 3, y: 2, w: 3, h: 2 },
    { signalKey: "pump.hyd_pressure", type: "gauge", x: 6, y: 2, w: 3, h: 2 },
    { signalKey: "pump.lift", type: "number", x: 9, y: 2, w: 3, h: 2 },
  ];

  for (const vId of [vehicle.id, stmVehicle.id]) {
    const existingLayout = await prisma.dashboardLayout.findFirst({
      where: { vehicleId: vId, userId: null, name: "default" },
    });
    if (existingLayout) {
      await prisma.dashboardLayout.update({
        where: { id: existingLayout.id },
        data: { widgets: defaultWidgets },
      });
    } else {
      await prisma.dashboardLayout.create({
        data: { vehicleId: vId, name: "default", widgets: defaultWidgets },
      });
    }
  }
  console.log("✓ varsayılan dashboard düzeni");

  console.log("\nSeed tamamlandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
