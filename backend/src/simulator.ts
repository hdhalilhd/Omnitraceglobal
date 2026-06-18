/**
 * Forklift simülatörü — donanım olmadan uçtan uca test.
 * Demo cihaz "ESP32-DEMO-001" adına sahte CAN frame'leri yayınlar (~1 Hz):
 *   - yürüyüş (Node 14) ve pompa (Node 22) TPDO'ları
 *   - ara sıra EMCY (hata) ve sonra sıfırlama
 *
 * Çalıştır:  npm run simulate
 */
import mqtt from "mqtt";
import { config } from "./config";
import { cob, NODE_IDS } from "./canmap/signals";

const DEVICE = process.env.SIM_DEVICE ?? "ESP32-DEMO-001";
const T = NODE_IDS.traction;
const P = NODE_IDS.pump;

const client = mqtt.connect(config.mqtt.url, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  will: {
    topic: `forklift/${DEVICE}/status`,
    payload: JSON.stringify({ online: false }),
    qos: 0,
    retain: false,
  },
});

function u16le(v: number): [number, number] {
  const x = Math.round(v) & 0xffff;
  return [x & 0xff, (x >> 8) & 0xff];
}
function i16le(v: number): [number, number] {
  return u16le(v < 0 ? v + 0x10000 : v);
}

let tick = 0;

function buildFrames() {
  tick++;
  const wave = (amp: number, period: number, base: number) =>
    base + amp * Math.sin((tick / period) * Math.PI * 2);

  // --- Yürüyüş (operatör + motor) ---
  const gasPedal = Math.max(0, Math.min(100, Math.round(wave(40, 30, 45))));
  const direction = tick % 30 < 20 ? 1 : 2; // 1=ileri, 2=geri
  const seat = tick % 60 < 3 ? 0 : 1; // ara sıra operatör kalkar
  const brake = tick % 15 < 2 ? 1 : 0;
  const speed = Math.max(0, wave(8, 30, 6)); // km/h
  const wheelRpm = Math.round(speed * 30); // tekerlek devri
  const motorRpm = Math.round(wave(1200, 30, 0) + (Math.random() * 80 - 40));
  const motorCurrent = wave(150, 25, 60); // A
  const battV = wave(3, 60, 48); // V
  const soc = Math.max(0, Math.min(100, Math.round(85 - (tick % 600) / 20))); // yavaş düşen şarj
  const motorTemp = Math.round(wave(15, 120, 65)); // °C

  // --- Pompa (hidrolik) ---
  const lift = tick % 10 < 3 ? 1 : 0;
  const lower = tick % 10 >= 7 ? 1 : 0;
  const hydPressure = Math.max(0, wave(120, 15, 140)); // bar
  const pumpRpm = Math.round(Math.max(0, wave(1500, 18, 1500)));
  const pumpCurrent = Math.max(0, wave(120, 18, 90)); // A
  const pumpTemp = Math.round(wave(12, 120, 60)); // °C
  const oilTemp = Math.round(wave(10, 120, 55)); // °C

  const frames = [
    // Heartbeat (0x70E / 0x716) — NMT operasyonel durumu (0x05)
    { id: cob.heartbeat(T), data: [0x05, 0, 0, 0, 0, 0, 0, 0] },
    { id: cob.heartbeat(P), data: [0x05, 0, 0, 0, 0, 0, 0, 0] },
    // Yürüyüş TPDO1 (0x18E): gaz, yön, koltuk, fren, hız, tekerlek devri
    {
      id: cob.tpdo1(T),
      data: [gasPedal, direction, seat, brake, ...u16le(speed * 100), ...i16le(wheelRpm)],
    },
    // Yürüyüş TPDO2 (0x28E): motor devri/akımı, akü gerilimi, şarj, sıcaklık
    {
      id: cob.tpdo2(T),
      data: [...i16le(motorRpm), ...i16le(motorCurrent * 10), ...u16le(battV * 10), soc, motorTemp + 40],
    },
    // Pompa TPDO1 (0x196): kaldırma, indirme, basınç, devir, akım
    {
      id: cob.tpdo1(P),
      data: [lift, lower, ...u16le(hydPressure * 10), ...i16le(pumpRpm), ...i16le(pumpCurrent * 10)],
    },
    // Pompa TPDO2 (0x296): sıcaklıklar
    {
      id: cob.tpdo2(P),
      data: [pumpTemp + 40, oilTemp + 40, 0, 0, 0, 0, 0, 0],
    },
  ];

  // ~Her 20 saniyede bir hata simülasyonu
  if (tick % 20 === 0) {
    // 0x4210 = Aşırı sıcaklık (yürüyüş)
    frames.push({ id: cob.emcy(T), data: [0x10, 0x42, 0x01, 0, 0, 0, 0, 0] });
    console.log("  ! EMCY yayınlandı: 0x4210 (yürüyüş aşırı sıcaklık)");
  }
  // 5 saniye sonra sıfırla
  if (tick % 20 === 5) {
    frames.push({ id: cob.emcy(T), data: [0, 0, 0, 0, 0, 0, 0, 0] });
    console.log("  · EMCY sıfırlandı (yürüyüş)");
  }

  return frames;
}

client.on("connect", () => {
  console.log(`[sim] bağlandı: ${config.mqtt.url} — cihaz ${DEVICE}`);
  client.publish(`forklift/${DEVICE}/status`, JSON.stringify({ online: true }));

  setInterval(() => {
    const payload = { ts: Date.now(), frames: buildFrames() };
    client.publish(`forklift/${DEVICE}/can`, JSON.stringify(payload));
    if (tick % 10 === 0) console.log(`[sim] ${tick}. paket gönderildi`);
  }, 1000);
});

client.on("error", (e) => console.error("[sim] hata:", e.message));
