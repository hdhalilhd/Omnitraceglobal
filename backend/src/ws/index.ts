/**
 * Socket.IO canlı yayın katmanı.
 * İstemci bir aracın odasına abone olur; ~1 Hz telemetri + hata olayları alır.
 */
import { Server as HttpServer } from "http";
import { Server } from "socket.io";

let io: Server | null = null;

export function initWs(httpServer: HttpServer, corsOrigin: string): Server {
  io = new Server(httpServer, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
  });

  io.on("connection", (socket) => {
    socket.on("subscribe:vehicle", (vehicleId: number) => {
      socket.join(`vehicle:${vehicleId}`);
    });
    socket.on("unsubscribe:vehicle", (vehicleId: number) => {
      socket.leave(`vehicle:${vehicleId}`);
    });
  });

  return io;
}

/** Bir araca ait telemetri güncellemesi (bir frame'in çözülmüş sinyalleri) */
export function emitTelemetry(vehicleId: number, payload: unknown): void {
  io?.to(`vehicle:${vehicleId}`).emit("telemetry", payload);
}

/** Yeni hata logu — hem araç odasına hem global "alerts" kanalına */
export function emitErrorLog(vehicleId: number, payload: unknown): void {
  io?.to(`vehicle:${vehicleId}`).emit("error_log", payload);
  io?.emit("alerts", payload);
}

/** Araç çevrimiçi/çevrimdışı durum değişimi */
export function emitVehicleStatus(vehicleId: number, status: string): void {
  io?.emit("vehicle_status", { vehicleId, status });
}

/** Cihaz heartbeat'i (yaşıyor sinyali) — araç odasına + global kanala */
export function emitHeartbeat(vehicleId: number, payload: unknown): void {
  io?.to(`vehicle:${vehicleId}`).emit("heartbeat", payload);
  io?.emit("heartbeat:any", payload);
}
