/**
 * CAN frame çözümleyici (decoder).
 * ESP32 ham frame gönderir; çözümleme burada CAN map ile yapılır.
 */
import {
  CanSignal,
  DataType,
  Source,
  EMCY_COB_IDS,
  HEARTBEAT_COB_IDS,
  SIGNALS_BY_COB_ID,
} from "./signals";

/** ESP32'den gelen ham CAN frame */
export interface RawFrame {
  /** COB-ID (11-bit), örn. 0x18E */
  id: number;
  /** 0-8 bayt */
  data: number[];
}

export interface DecodedSignal {
  signalKey: string;
  label: string;
  source: Source;
  value: number;
  raw: number;
  unit: string;
}

export interface DecodedEmcy {
  source: Source;
  nodeId: number;
  /** EMCY error code (decimal) */
  errorCode: number;
  errorCodeHex: string;
  errorRegister: number;
  /** üretici baytları (b3-7) hex */
  vendorBytes: string;
}

/** Ham baytlardan işaretli/işaretsiz tamsayı oku */
export function readRaw(
  data: number[],
  startByte: number,
  byteLength: number,
  dataType: DataType,
  endianness: "little" | "big",
): number {
  let unsigned = 0;
  for (let i = 0; i < byteLength; i++) {
    const byte = data[startByte + i] ?? 0;
    if (endianness === "little") {
      unsigned += byte * Math.pow(256, i);
    } else {
      unsigned = unsigned * 256 + byte;
    }
  }
  // İşaretli tipler için iki-tümleyen düzeltmesi
  const signed = dataType.startsWith("int");
  if (signed) {
    const bits = byteLength * 8;
    const max = Math.pow(2, bits);
    if (unsigned >= max / 2) unsigned -= max;
  }
  return unsigned;
}

/** Tek bir sinyali çöz */
export function decodeSignal(sig: CanSignal, data: number[]): DecodedSignal {
  const raw = readRaw(
    data,
    sig.startByte,
    sig.byteLength,
    sig.dataType,
    sig.endianness,
  );
  const value = raw * sig.scale + sig.offset;
  return {
    signalKey: sig.key,
    label: sig.label,
    source: sig.source,
    value,
    raw,
    unit: sig.unit,
  };
}

export function isEmcyFrame(id: number): boolean {
  return id in EMCY_COB_IDS;
}

export function isHeartbeatFrame(id: number): boolean {
  return id in HEARTBEAT_COB_IDS;
}

/** Bir TPDO frame'indeki tüm sinyalleri çöz */
export function decodeFrame(frame: RawFrame): DecodedSignal[] {
  const sigs = SIGNALS_BY_COB_ID.get(frame.id);
  if (!sigs) return [];
  return sigs.map((s) => decodeSignal(s, frame.data));
}

/** EMCY (hata) frame'ini çöz */
export function decodeEmcy(frame: RawFrame): DecodedEmcy | null {
  const meta = EMCY_COB_IDS[frame.id];
  if (!meta) return null;
  const d = frame.data;
  const errorCode = (d[0] ?? 0) + (d[1] ?? 0) * 256; // little-endian uint16
  const errorRegister = d[2] ?? 0;
  const vendorBytes = d
    .slice(3, 8)
    .map((b) => (b ?? 0).toString(16).padStart(2, "0"))
    .join(" ");
  return {
    source: meta.source,
    nodeId: meta.nodeId,
    errorCode,
    errorCodeHex: "0x" + errorCode.toString(16).toUpperCase().padStart(4, "0"),
    errorRegister,
    vendorBytes,
  };
}
