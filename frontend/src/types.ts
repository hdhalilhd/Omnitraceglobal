export type Source = "TRACTION" | "PUMP";
export type WidgetType = "gauge" | "number" | "chart";
export type Severity = "INFO" | "WARNING" | "CRITICAL";
export type VehicleStatus = "ACTIVE" | "IDLE" | "OFFLINE" | "MAINTENANCE";

export interface User {
  id: number;
  email: string;
  name: string;
  role: "ADMIN" | "OPERATOR" | "VIEWER";
}

export interface Device {
  id: number;
  serial: string;
  online: boolean;
  lastSeen: string | null;
  fwVersion: string | null;
}

export interface Vehicle {
  id: number;
  chassisNo: string;
  model: string | null;
  type: string;
  name: string | null;
  photoUrl: string | null;
  tractionNodeId: number;
  pumpNodeId: number;
  status: VehicleStatus;
  totalHours: number;
  locationLabel: string | null;
  deviceId: number | null;
  device?: Device | null;
  activeErrorCount?: number;
  latest?: LatestValue[];
}

export interface SignalDef {
  key: string;
  label: string;
  source: Source;
  cobId: number;
  unit: string;
  dataType: string;
  decimals: number;
  min: number | null;
  max: number | null;
}

export interface Widget {
  signalKey: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LatestValue {
  signalKey: string;
  label: string;
  source: "traction" | "pump";
  value: number;
  raw: number;
  unit: string;
  ts: number;
}

export interface ErrorLog {
  id: number;
  time: string;
  vehicleId: number;
  source: Source;
  nodeId: number;
  emcyCode: number;
  emcyCodeHex: string;
  errorRegister: number;
  vendorBytes: string;
  description: string;
  severity: Severity;
  active: boolean;
  clearedAt: string | null;
  vehicle?: { chassisNo: string; name: string | null };
}

export interface FaultCode {
  id: number;
  code: number;
  source: Source | null;
  descriptionTr: string;
  severity: Severity;
  recommendedAction: string | null;
}

/** WebSocket telemetri olayı */
export interface TelemetryEvent {
  vehicleId: number;
  ts: number;
  signals: { signalKey: string; source: "traction" | "pump"; value: number }[];
}
