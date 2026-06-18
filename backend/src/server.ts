import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { initWs } from "./ws";
import { startMqtt, stopMqtt } from "./ingest/mqtt";
import { authRouter } from "./api/auth";
import { vehiclesRouter } from "./api/vehicles";
import { signalsRouter } from "./api/signals";
import { dashboardRouter } from "./api/dashboard";
import { errorsRouter } from "./api/errors";
import { reportsRouter } from "./api/reports";
import { ingestRouter } from "./api/ingest";

const app = express();
app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

app.use("/api/auth", authRouter);
app.use("/api/vehicles", vehiclesRouter);
app.use("/api/signals", signalsRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/errors", errorsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/ingest", ingestRouter); // cihaz (STM32+SIM800L) HTTP ingest — JWT gerektirmez

// Hata yakalayıcı
app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Sunucu hatası" });
  },
);

const server = http.createServer(app);
initWs(server, config.corsOrigin);
startMqtt();

server.listen(config.port, () => {
  console.log(`[http] API + WebSocket: http://localhost:${config.port}`);
});

function shutdown() {
  console.log("\nKapatılıyor...");
  stopMqtt();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
