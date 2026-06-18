/**
 * CAN MAP — TASLAK (tek doğru kaynak)
 * ------------------------------------------------------------------
 * Gerçek PDO map geldiğinde SADECE bu dosya güncellenir; decoder, seed
 * ve frontend otomatik olarak buna göre çalışır.
 *
 * Varsayım: Node ID 14 = Yürüyüş (traction), Node ID 22 = Pompa (pump).
 *
 * CANopen varsayılan COB-ID şeması:
 *   TPDO1 = 0x180 + NodeID   TPDO2 = 0x280 + NodeID
 *   TPDO3 = 0x380 + NodeID   TPDO4 = 0x480 + NodeID
 *   EMCY  = 0x080 + NodeID   Heartbeat = 0x700 + NodeID
 */

export type Source = "traction" | "pump";
export type DataType =
  | "uint8"
  | "int8"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32";

export interface CanSignal {
  /** Benzersiz anahtar, örn. "traction.motor_rpm" */
  key: string;
  /** UI etiketi (TR), örn. "Motor Devri" */
  label: string;
  /** Yürüyüş mü pompa mı */
  source: Source;
  /** Bu sinyalin geldiği CAN frame COB-ID'si (örn. 0x18E) */
  cobId: number;
  /** Veri alanında başlangıç baytı (0-7) */
  startByte: number;
  /** Bayt uzunluğu */
  byteLength: number;
  dataType: DataType;
  endianness: "little" | "big";
  /** mühendislik değeri = raw * scale + offset */
  scale: number;
  offset: number;
  /** Birim, örn. "rpm", "A", "°C", "V", "bar", "%" */
  unit: string;
  /** UI'da gösterilecek ondalık hane sayısı */
  decimals?: number;
  /** Gauge aralığı */
  min?: number;
  max?: number;
}

export const NODE_IDS = {
  traction: 14,
  pump: 22,
} as const;

/** CANopen COB-ID yardımcıları */
export const cob = {
  tpdo1: (node: number) => 0x180 + node,
  tpdo2: (node: number) => 0x280 + node,
  tpdo3: (node: number) => 0x380 + node,
  tpdo4: (node: number) => 0x480 + node,
  emcy: (node: number) => 0x080 + node,
  heartbeat: (node: number) => 0x700 + node,
};

const T = NODE_IDS.traction; // 14 -> 0x0E
const P = NODE_IDS.pump; //     22 -> 0x16

/**
 * TASLAK sinyal yerleşimi. Gerçek map gelince değerleri (cobId, startByte,
 * byteLength, dataType, scale, unit) düzeltin.
 */
export const SIGNALS: CanSignal[] = [
  // ---------- YÜRÜYÜŞ (Node 14) ----------
  // TPDO1 = 0x18E — sürüş / operatör girişleri
  { key: "traction.gas_pedal",     label: "Gaz Pedalı",      source: "traction", cobId: cob.tpdo1(T), startByte: 0, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: 0,   unit: "%",    decimals: 0, min: 0,     max: 100 },
  { key: "traction.direction",     label: "Yön",             source: "traction", cobId: cob.tpdo1(T), startByte: 1, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: 0,   unit: "",     decimals: 0, min: 0,     max: 2 },
  { key: "traction.seat",          label: "Koltuk Durumu",   source: "traction", cobId: cob.tpdo1(T), startByte: 2, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: 0,   unit: "",     decimals: 0, min: 0,     max: 1 },
  { key: "traction.brake",         label: "Fren",            source: "traction", cobId: cob.tpdo1(T), startByte: 3, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: 0,   unit: "",     decimals: 0, min: 0,     max: 1 },
  { key: "traction.vehicle_speed", label: "Araç Hızı",       source: "traction", cobId: cob.tpdo1(T), startByte: 4, byteLength: 2, dataType: "uint16", endianness: "little", scale: 0.01, offset: 0,   unit: "km/h", decimals: 1, min: 0,     max: 25 },
  { key: "traction.wheel_rpm",     label: "Tekerlek Devri",  source: "traction", cobId: cob.tpdo1(T), startByte: 6, byteLength: 2, dataType: "int16",  endianness: "little", scale: 1,    offset: 0,   unit: "rpm",  decimals: 0, min: -500,  max: 500 },

  // TPDO2 = 0x28E — motor / akü
  { key: "traction.motor_rpm",     label: "Motor Devri",     source: "traction", cobId: cob.tpdo2(T), startByte: 0, byteLength: 2, dataType: "int16",  endianness: "little", scale: 1,    offset: 0,   unit: "rpm",  decimals: 0, min: -3000, max: 3000 },
  { key: "traction.motor_current", label: "Motor Akımı",     source: "traction", cobId: cob.tpdo2(T), startByte: 2, byteLength: 2, dataType: "int16",  endianness: "little", scale: 0.1,  offset: 0,   unit: "A",    decimals: 1, min: -400,  max: 400 },
  { key: "traction.battery_voltage", label: "Akü Gerilimi",  source: "traction", cobId: cob.tpdo2(T), startByte: 4, byteLength: 2, dataType: "uint16", endianness: "little", scale: 0.1,  offset: 0,   unit: "V",    decimals: 1, min: 0,     max: 100 },
  { key: "traction.battery_soc",   label: "Akü Şarjı",       source: "traction", cobId: cob.tpdo2(T), startByte: 6, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: 0,   unit: "%",    decimals: 0, min: 0,     max: 100 },
  { key: "traction.motor_temp",    label: "Motor Sıcaklığı", source: "traction", cobId: cob.tpdo2(T), startByte: 7, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,    offset: -40, unit: "°C",   decimals: 0, min: -40,   max: 150 },

  // ---------- POMPA (Node 22) ----------
  // TPDO1 = 0x196 — hidrolik
  { key: "pump.lift",          label: "Kaldırma",        source: "pump", cobId: cob.tpdo1(P), startByte: 0, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,   offset: 0, unit: "",    decimals: 0, min: 0, max: 1 },
  { key: "pump.lower",         label: "İndirme",         source: "pump", cobId: cob.tpdo1(P), startByte: 1, byteLength: 1, dataType: "uint8",  endianness: "little", scale: 1,   offset: 0, unit: "",    decimals: 0, min: 0, max: 1 },
  { key: "pump.hyd_pressure",  label: "Hidrolik Basınç", source: "pump", cobId: cob.tpdo1(P), startByte: 2, byteLength: 2, dataType: "uint16", endianness: "little", scale: 0.1, offset: 0, unit: "bar", decimals: 1, min: 0, max: 300 },
  { key: "pump.motor_rpm",     label: "Pompa Devri",     source: "pump", cobId: cob.tpdo1(P), startByte: 4, byteLength: 2, dataType: "int16",  endianness: "little", scale: 1,   offset: 0, unit: "rpm", decimals: 0, min: 0, max: 4000 },
  { key: "pump.motor_current", label: "Pompa Akımı",     source: "pump", cobId: cob.tpdo1(P), startByte: 6, byteLength: 2, dataType: "int16",  endianness: "little", scale: 0.1, offset: 0, unit: "A",   decimals: 1, min: 0, max: 400 },

  // TPDO2 = 0x296 — sıcaklık
  { key: "pump.motor_temp", label: "Pompa Sıcaklığı",   source: "pump", cobId: cob.tpdo2(P), startByte: 0, byteLength: 1, dataType: "uint8", endianness: "little", scale: 1, offset: -40, unit: "°C", decimals: 0, min: -40, max: 150 },
  { key: "pump.oil_temp",   label: "Hidrolik Yağ Sıc.", source: "pump", cobId: cob.tpdo2(P), startByte: 1, byteLength: 1, dataType: "uint8", endianness: "little", scale: 1, offset: -40, unit: "°C", decimals: 0, min: -40, max: 150 },
];

/** Durum (on/off, çok-değerli) sinyalleri için metin etiketleri — UI'da sayı yerine metin. */
export const STATUS_LABELS: Record<string, Record<number, string>> = {
  "traction.direction": { 0: "Boş", 1: "İleri", 2: "Geri" },
  "traction.seat": { 0: "Boş", 1: "Dolu" },
  "traction.brake": { 0: "Bırakıldı", 1: "Basılı" },
  "pump.lift": { 0: "—", 1: "Aktif" },
  "pump.lower": { 0: "—", 1: "Aktif" },
};

/** EMCY (hata) COB-ID'leri — kaynak eşlemesiyle */
export const EMCY_COB_IDS: Record<number, { source: Source; nodeId: number }> = {
  [cob.emcy(T)]: { source: "traction", nodeId: T },
  [cob.emcy(P)]: { source: "pump", nodeId: P },
};

/** Heartbeat COB-ID'leri */
export const HEARTBEAT_COB_IDS: Record<number, { source: Source; nodeId: number }> = {
  [cob.heartbeat(T)]: { source: "traction", nodeId: T },
  [cob.heartbeat(P)]: { source: "pump", nodeId: P },
};

/** cobId -> o frame'deki sinyaller (decoder performansı için ön-indeks) */
export const SIGNALS_BY_COB_ID: Map<number, CanSignal[]> = (() => {
  const m = new Map<number, CanSignal[]>();
  for (const s of SIGNALS) {
    const list = m.get(s.cobId) ?? [];
    list.push(s);
    m.set(s.cobId, list);
  }
  return m;
})();

export const SIGNAL_BY_KEY: Map<string, CanSignal> = new Map(
  SIGNALS.map((s) => [s.key, s]),
);
