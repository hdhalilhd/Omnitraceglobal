/**
 * DEMO (MOCK) MODU — backend olmadan tüm arayüzü gezebilmek için.
 * VITE_DEMO=1 iken (frontend/.env) etkinleşir. Gerçek backend'i kullanmak için
 * frontend/.env içinde VITE_DEMO=0 yapın.
 */
import MockAdapter from "axios-mock-adapter";
import { api } from "./api";
import { SignalDef, Vehicle, Widget, ErrorLog, FaultCode, LatestValue } from "../types";
import { STATUS_KEYS } from "./statusLabels";

export const DEMO = import.meta.env.VITE_DEMO === "1";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---- Sahte sinyal tanımları (backend CAN map ile aynı) ----
export const signals: SignalDef[] = [
  s("traction.gas_pedal", "Gaz Pedalı", "TRACTION", "%", 0, 0, 100, 0x18e),
  s("traction.direction", "Yön", "TRACTION", "", 0, 0, 2, 0x18e),
  s("traction.seat", "Koltuk Durumu", "TRACTION", "", 0, 0, 1, 0x18e),
  s("traction.brake", "Fren", "TRACTION", "", 0, 0, 1, 0x18e),
  s("traction.vehicle_speed", "Araç Hızı", "TRACTION", "km/h", 1, 0, 25, 0x18e),
  s("traction.wheel_rpm", "Tekerlek Devri", "TRACTION", "rpm", 0, -500, 500, 0x18e),
  s("traction.motor_rpm", "Motor Devri", "TRACTION", "rpm", 0, -3000, 3000, 0x28e),
  s("traction.motor_current", "Motor Akımı", "TRACTION", "A", 1, -400, 400, 0x28e),
  s("traction.battery_voltage", "Akü Gerilimi", "TRACTION", "V", 1, 0, 100, 0x28e),
  s("traction.battery_soc", "Akü Şarjı", "TRACTION", "%", 0, 0, 100, 0x28e),
  s("traction.motor_temp", "Motor Sıcaklığı", "TRACTION", "°C", 0, -40, 150, 0x28e),
  s("pump.lift", "Kaldırma", "PUMP", "", 0, 0, 1, 0x196),
  s("pump.lower", "İndirme", "PUMP", "", 0, 0, 1, 0x196),
  s("pump.hyd_pressure", "Hidrolik Basınç", "PUMP", "bar", 1, 0, 300, 0x196),
  s("pump.motor_rpm", "Pompa Devri", "PUMP", "rpm", 0, 0, 4000, 0x196),
  s("pump.motor_current", "Pompa Akımı", "PUMP", "A", 1, 0, 400, 0x196),
  s("pump.motor_temp", "Pompa Sıcaklığı", "PUMP", "°C", 0, -40, 150, 0x296),
  s("pump.oil_temp", "Hidrolik Yağ Sıc.", "PUMP", "°C", 0, -40, 150, 0x296),
];

function s(
  key: string,
  label: string,
  source: "TRACTION" | "PUMP",
  unit: string,
  decimals: number,
  min: number,
  max: number,
  cobId: number,
): SignalDef {
  return { key, label, source, unit, decimals, min, max, cobId, dataType: "int16" };
}

// ---- Değer üreteçleri (sinüs + gürültü) ----
const generators: Record<string, (t: number) => number> = {
  "traction.gas_pedal": (t) => clamp(45 + 40 * Math.sin((t / 30) * 2 * Math.PI), 0, 100),
  "traction.direction": (t) => (Math.floor(t) % 30 < 20 ? 1 : 2),
  "traction.seat": (t) => (Math.floor(t) % 60 < 3 ? 0 : 1),
  "traction.brake": (t) => (Math.floor(t) % 15 < 2 ? 1 : 0),
  "traction.vehicle_speed": (t) => Math.max(0, 6 + 8 * Math.sin((t / 30) * 2 * Math.PI)),
  "traction.wheel_rpm": (t) => Math.round(Math.max(0, 6 + 8 * Math.sin((t / 30) * 2 * Math.PI)) * 30),
  "traction.motor_rpm": (t) => 1200 * Math.sin((t / 30) * 2 * Math.PI),
  "traction.motor_current": (t) => 60 + 150 * Math.sin((t / 25) * 2 * Math.PI),
  "traction.battery_voltage": (t) => 48 + 3 * Math.sin((t / 60) * 2 * Math.PI),
  "traction.battery_soc": (t) => clamp(85 - (Math.floor(t) % 600) / 20, 0, 100),
  "traction.motor_temp": (t) => 65 + 15 * Math.sin((t / 120) * 2 * Math.PI),
  "pump.lift": (t) => (Math.floor(t) % 10 < 3 ? 1 : 0),
  "pump.lower": (t) => (Math.floor(t) % 10 >= 7 ? 1 : 0),
  "pump.hyd_pressure": (t) => Math.max(0, 140 + 120 * Math.sin((t / 15) * 2 * Math.PI)),
  "pump.motor_rpm": (t) => Math.max(0, 1500 + 1500 * Math.sin((t / 18) * 2 * Math.PI)),
  "pump.motor_current": (t) => Math.max(0, 90 + 120 * Math.sin((t / 18) * 2 * Math.PI)),
  "pump.motor_temp": (t) => 60 + 12 * Math.sin((t / 120) * 2 * Math.PI),
  "pump.oil_temp": (t) => 55 + 10 * Math.sin((t / 120) * 2 * Math.PI),
};

function valueOf(key: string, t: number): number {
  const g = generators[key];
  if (!g) return 0;
  if (STATUS_KEYS.has(key)) return Math.round(g(t)); // durum sinyali: tam sayı, gürültüsüz
  return g(t) + (Math.random() * 2 - 1);
}

const sourceOf = (key: string): "traction" | "pump" =>
  key.startsWith("pump") ? "pump" : "traction";

// ---- Sahte araçlar ----
export const vehicles: Vehicle[] = [
  veh(1, "304MB100104", "EF-25", "Depo Forklift #1", "ACTIVE", 1140, "Gaziantep Deposu", 1),
  veh(2, "304MB100210", "EF-30", "Saha Forklift #2", "OFFLINE", 892, "İstanbul Şube", 0),
  veh(3, "304MB100355", "EF-18", "Yükleme #3", "IDLE", 455, "Kocaeli", 0),
];

function veh(
  id: number,
  chassisNo: string,
  model: string,
  name: string,
  status: Vehicle["status"],
  totalHours: number,
  locationLabel: string,
  activeErrorCount: number,
): Vehicle {
  return {
    id,
    chassisNo,
    model,
    type: "Electric Forklift",
    name,
    photoUrl: null,
    tractionNodeId: 14,
    pumpNodeId: 22,
    status,
    totalHours,
    locationLabel,
    deviceId: id,
    activeErrorCount,
  };
}

// Araç bazında dashboard düzeni (oturum boyunca değişebilir)
const layouts: Record<number, Widget[]> = {};
function defaultLayout(): Widget[] {
  return [
    { signalKey: "traction.gas_pedal", type: "gauge", x: 0, y: 0, w: 3, h: 2 },
    { signalKey: "traction.vehicle_speed", type: "gauge", x: 3, y: 0, w: 3, h: 2 },
    { signalKey: "traction.wheel_rpm", type: "number", x: 6, y: 0, w: 3, h: 2 },
    { signalKey: "traction.seat", type: "number", x: 9, y: 0, w: 3, h: 2 },
    { signalKey: "traction.battery_soc", type: "gauge", x: 0, y: 2, w: 3, h: 2 },
    { signalKey: "traction.motor_rpm", type: "number", x: 3, y: 2, w: 3, h: 2 },
    { signalKey: "pump.hyd_pressure", type: "gauge", x: 6, y: 2, w: 3, h: 2 },
    { signalKey: "pump.lift", type: "number", x: 9, y: 2, w: 3, h: 2 },
  ];
}
function layoutFor(id: number): Widget[] {
  if (!layouts[id]) layouts[id] = defaultLayout();
  return layouts[id];
}

function latestFor(): LatestValue[] {
  const t = Date.now() / 1000;
  return signals.map((sig) => ({
    signalKey: sig.key,
    label: sig.label,
    source: sourceOf(sig.key),
    value: valueOf(sig.key, t),
    raw: 0,
    unit: sig.unit,
    ts: Date.now(),
  }));
}

// ---- Sahte hatalar ----
const errors: ErrorLog[] = [
  {
    id: 1,
    time: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    vehicleId: 1,
    source: "TRACTION",
    nodeId: 14,
    emcyCode: 0x4210,
    emcyCodeHex: "0x4210",
    errorRegister: 1,
    vendorBytes: "00 00 00 00 00",
    description: "Aşırı sıcaklık",
    severity: "CRITICAL",
    active: true,
    clearedAt: null,
    vehicle: { chassisNo: "304MB100104", name: "Depo Forklift #1" },
  },
  {
    id: 2,
    time: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    vehicleId: 1,
    source: "PUMP",
    nodeId: 22,
    emcyCode: 0x3220,
    emcyCodeHex: "0x3220",
    errorRegister: 4,
    vendorBytes: "00 00 00 00 00",
    description: "Düşük gerilim (undervoltage)",
    severity: "WARNING",
    active: false,
    clearedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    vehicle: { chassisNo: "304MB100104", name: "Depo Forklift #1" },
  },
];

const faults: FaultCode[] = [
  { id: 1, code: 0x4210, source: null, descriptionTr: "Aşırı sıcaklık", severity: "CRITICAL", recommendedAction: "Soğutma/yük kontrolü" },
  { id: 2, code: 0x3220, source: null, descriptionTr: "Düşük gerilim", severity: "WARNING", recommendedAction: "Akü şarjını kontrol edin" },
];

function reportFor(params: any) {
  const signalKey = params?.signalKey ?? "traction.motor_temp";
  const from = params?.from ? new Date(params.from).getTime() : Date.now() - 3600_000;
  const to = params?.to ? new Date(params.to).getTime() : Date.now();
  const n = 60;
  const points = Array.from({ length: n }, (_, i) => {
    const time = from + ((to - from) * i) / (n - 1);
    const v = valueOf(signalKey, time / 1000);
    return { t: new Date(time).toISOString(), avg: v, min: v - 3, max: v + 3 };
  });
  return { vehicleId: params?.vehicleId ?? 1, signalKey, bucket: params?.bucket ?? "1m", points };
}

const idFrom = (url?: string) => Number((url ?? "").match(/\/(\d+)/)?.[1] ?? 1);

export function setupDemo(): void {
  const mock = new MockAdapter(api, { delayResponse: 150 });

  mock.onPost("/auth/login").reply(200, {
    token: "demo-token",
    user: { id: 1, email: "admin@forklift.local", name: "Yönetici (Demo)", role: "ADMIN" },
  });
  mock.onGet("/auth/me").reply(200, { id: 1, email: "admin@forklift.local", name: "Yönetici (Demo)", role: "ADMIN" });

  mock.onGet(/\/vehicles\/\d+\/latest$/).reply(() => [200, latestFor()]);
  mock.onGet(/\/vehicles\/\d+$/).reply((cfg) => {
    const v = vehicles.find((x) => x.id === idFrom(cfg.url)) ?? vehicles[0];
    return [200, { ...v, latest: latestFor() }];
  });
  mock.onGet("/vehicles").reply(200, vehicles);

  mock.onGet("/signals").reply(200, signals);

  mock.onGet(/\/dashboard\/\d+$/).reply((cfg) => {
    const id = idFrom(cfg.url);
    return [200, { vehicleId: id, widgets: layoutFor(id), signals }];
  });
  mock.onPut(/\/dashboard\/\d+$/).reply((cfg) => {
    const id = idFrom(cfg.url);
    const body = JSON.parse(cfg.data);
    layouts[id] = body.widgets;
    return [200, { vehicleId: id, widgets: body.widgets }];
  });

  mock.onGet("/errors/faults").reply(200, faults);
  mock.onGet("/errors").reply(200, { items: errors, total: errors.length, page: 1, pageSize: 50 });
  mock.onPost(/\/errors\/\d+\/clear$/).reply((cfg) => {
    const id = idFrom(cfg.url);
    const e = errors.find((x) => x.id === id);
    if (e) {
      e.active = false;
      e.clearedAt = new Date().toISOString();
    }
    return [200, e ?? {}];
  });

  mock.onGet(/\/reports\/\d+/).reply((cfg) => [200, reportFor({ ...cfg.params, vehicleId: idFrom(cfg.url) })]);

  mock.onAny().passThrough();
}

// ---- Sahte WebSocket ----
type Handler = (...args: any[]) => void;
class DemoSocket {
  private handlers: Record<string, Handler[]> = {};
  private timer: ReturnType<typeof setInterval> | null = null;
  private vehicleId = 0;

  on(ev: string, fn: Handler) {
    (this.handlers[ev] ||= []).push(fn);
    return this;
  }
  off(ev: string, fn: Handler) {
    this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn);
    return this;
  }
  emit(ev: string, ...args: any[]) {
    if (ev === "subscribe:vehicle") this.start(args[0]);
    if (ev === "unsubscribe:vehicle") this.stop();
    return this;
  }
  private fire(ev: string, payload: any) {
    (this.handlers[ev] || []).forEach((f) => f(payload));
  }
  private start(vehicleId: number) {
    this.stop();
    this.vehicleId = vehicleId;
    this.timer = setInterval(() => {
      const t = Date.now() / 1000;
      this.fire("heartbeat", { vehicleId: this.vehicleId, ts: Date.now() });
      this.fire("telemetry", {
        vehicleId: this.vehicleId,
        ts: Date.now(),
        signals: signals.map((sig) => ({
          signalKey: sig.key,
          source: sourceOf(sig.key),
          value: valueOf(sig.key, t),
        })),
      });
    }, 1000);
  }
  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

let demoSocket: DemoSocket | null = null;
export function getDemoSocket(): DemoSocket {
  if (!demoSocket) demoSocket = new DemoSocket();
  return demoSocket;
}
