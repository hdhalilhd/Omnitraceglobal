import dotenv from "dotenv";

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Eksik ortam değişkeni: ${name}`);
  return v;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    secret: required("JWT_SECRET", "dev-secret-change-me"),
    expiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  },
  mqtt: {
    url: required("MQTT_URL", "mqtt://localhost:1883"),
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
  },
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
} as const;
