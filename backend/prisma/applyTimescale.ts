/**
 * TimescaleDB zaman-serisi nesnelerini oluşturur (Prisma dışında, ham SQL).
 *   - telemetry hypertable + index
 *   - telemetry_1m / telemetry_1h continuous aggregate'ler (rapor için)
 *   - compression + retention politikaları
 *
 * Çalıştır:  npm run db:timescale   (prisma migrate'ten sonra)
 * Idempotent: tekrar çalıştırılabilir.
 */
import { prisma } from "../src/db";

// NOT: continuous aggregate / hypertable ifadeleri transaction içinde
// çalışmamalı; bu yüzden her ifade $executeRawUnsafe ile tek tek (autocommit) çalışır.
const statements: string[] = [
  `CREATE EXTENSION IF NOT EXISTS timescaledb;`,

  `CREATE TABLE IF NOT EXISTS telemetry (
     time        TIMESTAMPTZ      NOT NULL,
     vehicle_id  INTEGER          NOT NULL,
     signal_key  TEXT             NOT NULL,
     source      TEXT             NOT NULL,
     value       DOUBLE PRECISION,
     raw         BIGINT
   );`,

  `SELECT create_hypertable('telemetry', 'time', if_not_exists => TRUE);`,

  `CREATE INDEX IF NOT EXISTS idx_telemetry_vehicle_signal_time
     ON telemetry (vehicle_id, signal_key, time DESC);`,

  // 1 dakikalık özet (avg/min/max)
  `CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1m
     WITH (timescaledb.continuous) AS
     SELECT time_bucket('1 minute', time) AS bucket,
            vehicle_id, signal_key, source,
            avg(value) AS avg_value,
            min(value) AS min_value,
            max(value) AS max_value,
            count(*)   AS sample_count
     FROM telemetry
     GROUP BY bucket, vehicle_id, signal_key, source
     WITH NO DATA;`,

  `SELECT add_continuous_aggregate_policy('telemetry_1m',
       start_offset => INTERVAL '3 hours',
       end_offset   => INTERVAL '1 minute',
       schedule_interval => INTERVAL '1 minute',
       if_not_exists => TRUE);`,

  // 1 saatlik özet
  `CREATE MATERIALIZED VIEW IF NOT EXISTS telemetry_1h
     WITH (timescaledb.continuous) AS
     SELECT time_bucket('1 hour', time) AS bucket,
            vehicle_id, signal_key, source,
            avg(value) AS avg_value,
            min(value) AS min_value,
            max(value) AS max_value,
            count(*)   AS sample_count
     FROM telemetry
     GROUP BY bucket, vehicle_id, signal_key, source
     WITH NO DATA;`,

  `SELECT add_continuous_aggregate_policy('telemetry_1h',
       start_offset => INTERVAL '3 days',
       end_offset   => INTERVAL '1 hour',
       schedule_interval => INTERVAL '1 hour',
       if_not_exists => TRUE);`,

  // Sıkıştırma (7 günden eski ham veriyi sıkıştır)
  `ALTER TABLE telemetry SET (
       timescaledb.compress,
       timescaledb.compress_segmentby = 'vehicle_id, signal_key',
       timescaledb.compress_orderby   = 'time DESC'
   );`,

  `SELECT add_compression_policy('telemetry', INTERVAL '7 days', if_not_exists => TRUE);`,

  // Saklama: ham veriyi 90 günde sil (continuous aggregate'ler kalır)
  `SELECT add_retention_policy('telemetry', INTERVAL '90 days', if_not_exists => TRUE);`,
];

async function main() {
  for (const sql of statements) {
    const label = sql.replace(/\s+/g, " ").slice(0, 70);
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log("✓", label);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // ALTER ... SET (compress) ikinci çalıştırmada "already" hatası verebilir; tolere et
      if (/already|exists|duplicate/i.test(msg)) {
        console.log("· (zaten var)", label);
      } else {
        console.error("✗", label, "\n   ", msg);
        throw err;
      }
    }
  }
  console.log("\nTimescale kurulumu tamamlandı.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
