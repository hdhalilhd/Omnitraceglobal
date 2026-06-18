import { describe, it, expect } from "vitest";
import {
  readRaw,
  decodeFrame,
  decodeEmcy,
  isEmcyFrame,
} from "./decoder";
import { cob, NODE_IDS } from "./signals";

const T = NODE_IDS.traction;
const P = NODE_IDS.pump;

describe("readRaw", () => {
  it("uint16 little-endian okur", () => {
    expect(readRaw([0x10, 0x27, 0, 0, 0, 0, 0, 0], 0, 2, "uint16", "little")).toBe(10000);
  });
  it("int16 negatif değeri iki-tümleyenle çözer", () => {
    // 0xFFFF = -1
    expect(readRaw([0xff, 0xff, 0, 0, 0, 0, 0, 0], 0, 2, "int16", "little")).toBe(-1);
  });
  it("uint8 okur", () => {
    expect(readRaw([0, 0, 0, 0, 0, 0, 75, 0], 6, 1, "uint8", "little")).toBe(75);
  });
});

describe("decodeFrame — yürüyüş TPDO1 (0x18E)", () => {
  it("gaz pedalı, yön, koltuk, hız, tekerlek devri çözülür", () => {
    // gas=75%, yön=1(ileri), koltuk=1(dolu), fren=0, hız=8.50 km/h (raw 850), tekerlek=300 rpm
    const data = [75, 1, 1, 0, 0x52, 0x03, 0x2c, 0x01];
    const decoded = decodeFrame({ id: cob.tpdo1(T), data });
    const byKey = Object.fromEntries(decoded.map((d) => [d.signalKey, d.value]));
    expect(byKey["traction.gas_pedal"]).toBe(75);
    expect(byKey["traction.direction"]).toBe(1);
    expect(byKey["traction.seat"]).toBe(1);
    expect(byKey["traction.vehicle_speed"]).toBeCloseTo(8.5, 5);
    expect(byKey["traction.wheel_rpm"]).toBe(300);
    expect(decoded.every((d) => d.source === "traction")).toBe(true);
  });
});

describe("decodeFrame — pompa TPDO1 (0x196)", () => {
  it("kaldırma, hidrolik basınç, pompa devri çözülür ve kaynak 'pump' olur", () => {
    // lift=1, lower=0, basınç=20.0 bar (raw 200), pompa devri=3000, akım=10.0A (raw 100)
    const data = [1, 0, 0xc8, 0x00, 0xb8, 0x0b, 0x64, 0x00];
    const decoded = decodeFrame({ id: cob.tpdo1(P), data });
    const byKey = Object.fromEntries(decoded.map((d) => [d.signalKey, d.value]));
    expect(byKey["pump.lift"]).toBe(1);
    expect(byKey["pump.hyd_pressure"]).toBeCloseTo(20.0, 5);
    expect(byKey["pump.motor_rpm"]).toBe(3000);
    expect(decoded.every((d) => d.source === "pump")).toBe(true);
  });
});

describe("decodeEmcy", () => {
  it("EMCY frame'ini tanır ve çözer", () => {
    expect(isEmcyFrame(cob.emcy(T))).toBe(true);
    const emcy = decodeEmcy({ id: cob.emcy(T), data: [0x30, 0x42, 0x01, 0, 0, 0, 0, 0] });
    expect(emcy).not.toBeNull();
    expect(emcy!.errorCode).toBe(0x4230);
    expect(emcy!.errorCodeHex).toBe("0x4230");
    expect(emcy!.errorRegister).toBe(1);
    expect(emcy!.source).toBe("traction");
  });
});
