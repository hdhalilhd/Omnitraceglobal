/**
 * Gömülü MQTT broker (aedes) — Docker/Mosquitto kurmadan yerel geliştirme için.
 * mqtt://localhost:1883 üzerinde dinler. ESP32/simülatör buraya publish eder,
 * backend buradan subscribe olur.
 *
 * Çalıştır:  npm run broker
 */
import Aedes from "aedes";
import { createServer } from "net";

const PORT = 1883;
const aedes = new Aedes();
const server = createServer(aedes.handle);

server.listen(PORT, () => {
  console.log(`[broker] MQTT broker dinliyor: mqtt://localhost:${PORT}`);
});

aedes.on("client", (c) => console.log("[broker] bağlandı:", c?.id));
aedes.on("clientDisconnect", (c) => console.log("[broker] ayrıldı:", c?.id));
