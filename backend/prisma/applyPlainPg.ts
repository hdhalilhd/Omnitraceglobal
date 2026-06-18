/**
 * Docker'sız / TimescaleDB olmadan yerel kurulum için zaman-serisi nesneleri.
 * `telemetry` düz bir PostgreSQL tablosu olur; telemetry_1m / telemetry_1h
 * date_trunc tabanlı VIEW'lardır → rapor sorguları (reports.ts) DEĞİŞMEDEN çalışır.
 *
 * Çalıştır:  npm run db:plainpg
 * (TimescaleDB'ye geçince bunun yerine npm run db:timescale kullanın.)
 */
import { prisma } from "../src/db";

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS telemetry (
     time        TIMESTAMPTZ      NOT NULL,
     vehicle_id  INTEGER          NOT NULL,
     signal_key  TEXT             NOT NULL,
     source      TEXT             NOT NULL,
     value       DOUBLE PRECISION,
     raw         BIGINT
   );`,

  `CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_signal_time
     ON telemetry (vehicle_id, signal_key, time DESC);`,

  `CREATE OR REPLACE VIEW telemetry_1m AS
     SELECT date_trunc('minute', time) AS bucket,
            vehicle_id, signal_key, source,
            avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value,
            count(*) AS sample_count
       FROM telemetry
      GROUP BY 1, 2, 3, 4;`,

  `CREATE OR REPLACE VIEW telemetry_1h AS
     SELECT date_trunc('hour', time) AS bucket,
            vehicle_id, signal_key, source,
            avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value,
            count(*) AS sample_count
       FROM telemetry
      GROUP BY 1, 2, 3, 4;`,
];

async function main() {
  for (const sql of statements) {
    await prisma.$executeRawUnsafe(sql);
    console.log("✓", sql.replace(/\s+/g, " ").slice(0, 60));
  }
  console.log("\nDüz PostgreSQL kurulumu tamamlandı (Timescale'siz).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
