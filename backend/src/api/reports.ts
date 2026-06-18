import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authRequired } from "../middleware/auth";

export const reportsRouter = Router();
reportsRouter.use(authRequired);

const BUCKETS = {
  raw: { table: "telemetry", timeCol: "time", valueExpr: "value" },
  "1m": { table: "telemetry_1m", timeCol: "bucket", valueExpr: "avg_value" },
  "1h": { table: "telemetry_1h", timeCol: "bucket", valueExpr: "avg_value" },
} as const;
type BucketKey = keyof typeof BUCKETS;

const querySchema = z.object({
  signalKey: z.string().min(1),
  from: z.coerce.date(),
  to: z.coerce.date(),
  bucket: z.enum(["raw", "1m", "1h"]).default("1m"),
  limit: z.coerce.number().int().min(1).max(20000).default(5000),
});

interface Row {
  bucket: Date;
  avg_value: number | null;
  min_value: number | null;
  max_value: number | null;
}

async function fetchSeries(
  vehicleId: number,
  signalKey: string,
  from: Date,
  to: Date,
  bucket: BucketKey,
  limit: number,
): Promise<Row[]> {
  if (bucket === "raw") {
    return prisma.$queryRawUnsafe<Row[]>(
      `SELECT time AS bucket, value AS avg_value, value AS min_value, value AS max_value
         FROM telemetry
        WHERE vehicle_id = $1 AND signal_key = $2 AND time BETWEEN $3 AND $4
        ORDER BY time ASC
        LIMIT $5`,
      vehicleId,
      signalKey,
      from,
      to,
      limit,
    );
  }
  const t = BUCKETS[bucket];
  return prisma.$queryRawUnsafe<Row[]>(
    `SELECT ${t.timeCol} AS bucket, avg_value, min_value, max_value
       FROM ${t.table}
      WHERE vehicle_id = $1 AND signal_key = $2 AND ${t.timeCol} BETWEEN $3 AND $4
      ORDER BY ${t.timeCol} ASC
      LIMIT $5`,
    vehicleId,
    signalKey,
    from,
    to,
    limit,
  );
}

// Zaman aralığı serisi (rapor grafiği)
reportsRouter.get("/:vehicleId", async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz parametre", details: parsed.error.flatten() });
    return;
  }
  const { signalKey, from, to, bucket, limit } = parsed.data;
  const rows = await fetchSeries(vehicleId, signalKey, from, to, bucket, limit);
  res.json({
    vehicleId,
    signalKey,
    bucket,
    points: rows.map((r) => ({
      t: r.bucket,
      avg: r.avg_value,
      min: r.min_value,
      max: r.max_value,
    })),
  });
});

// CSV dışa aktarım
reportsRouter.get("/:vehicleId/export.csv", async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz parametre" });
    return;
  }
  const { signalKey, from, to, bucket, limit } = parsed.data;
  const rows = await fetchSeries(vehicleId, signalKey, from, to, bucket, limit);
  const header = "time,avg,min,max\n";
  const body = rows
    .map((r) => `${new Date(r.bucket).toISOString()},${r.avg_value ?? ""},${r.min_value ?? ""},${r.max_value ?? ""}`)
    .join("\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="rapor_${vehicleId}_${signalKey}_${bucket}.csv"`,
  );
  res.send(header + body);
});
