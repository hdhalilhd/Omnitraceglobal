/**
 * Bellek-içi "son değer" önbelleği.
 * Sayfa ilk açılışında son bilinen değerler hemen gösterilir; sonrası WebSocket'ten akar.
 */
import { Source } from "./canmap/signals";

export interface LatestValue {
  signalKey: string;
  label: string;
  source: Source;
  value: number;
  raw: number;
  unit: string;
  ts: number; // epoch ms
}

// vehicleId -> (signalKey -> LatestValue)
const cache = new Map<number, Map<string, LatestValue>>();

export function updateLatest(vehicleId: number, v: LatestValue): void {
  let m = cache.get(vehicleId);
  if (!m) {
    m = new Map();
    cache.set(vehicleId, m);
  }
  m.set(v.signalKey, v);
}

export function getLatest(vehicleId: number): LatestValue[] {
  const m = cache.get(vehicleId);
  return m ? Array.from(m.values()) : [];
}

export function getLatestSignal(
  vehicleId: number,
  signalKey: string,
): LatestValue | undefined {
  return cache.get(vehicleId)?.get(signalKey);
}
