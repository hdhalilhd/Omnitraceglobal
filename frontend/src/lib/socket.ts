import { io } from "socket.io-client";
import { API_BASE } from "./api";
import { DEMO, getDemoSocket } from "./demo";

export interface SocketLike {
  on(ev: string, fn: (...args: any[]) => void): unknown;
  off(ev: string, fn: (...args: any[]) => void): unknown;
  emit(ev: string, ...args: any[]): unknown;
}

let socket: SocketLike | null = null;

export function getSocket(): SocketLike {
  if (DEMO) return getDemoSocket() as unknown as SocketLike;
  if (!socket) {
    socket = io(API_BASE || undefined, {
      autoConnect: true,
      transports: ["websocket", "polling"],
    }) as unknown as SocketLike;
  }
  return socket;
}
