import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authRequired, requireRole } from "../middleware/auth";
import { Prisma, SourceType, Severity } from "@prisma/client";

export const errorsRouter = Router();
errorsRouter.use(authRequired);

const querySchema = z.object({
  vehicleId: z.coerce.number().int().optional(),
  active: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  source: z.nativeEnum(SourceType).optional(),
  severity: z.nativeEnum(Severity).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// Hata logu listesi (filtre + sayfalama) — kullanıcı için kritik ekran
errorsRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz filtre", details: parsed.error.flatten() });
    return;
  }
  const { vehicleId, active, source, severity, from, to, q, page, pageSize } = parsed.data;

  const where: Prisma.ErrorLogWhereInput = {
    ...(vehicleId !== undefined && { vehicleId }),
    ...(active !== undefined && { active }),
    ...(source && { source }),
    ...(severity && { severity }),
    ...((from || to) && { time: { ...(from && { gte: from }), ...(to && { lte: to }) } }),
    ...(q && {
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { emcyCodeHex: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [total, items] = await Promise.all([
    prisma.errorLog.count({ where }),
    prisma.errorLog.findMany({
      where,
      include: { vehicle: { select: { chassisNo: true, name: true } } },
      orderBy: { time: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  res.json({ total, page, pageSize, items });
});

// Hata kodu sözlüğü
errorsRouter.get("/faults", async (_req, res) => {
  const faults = await prisma.faultCode.findMany({ orderBy: { code: "asc" } });
  res.json(faults);
});

// Hatayı manuel temizle/onayla
errorsRouter.post("/:id/clear", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  const updated = await prisma.errorLog.update({
    where: { id: Number(req.params.id) },
    data: { active: false, clearedAt: new Date() },
  });
  res.json(updated);
});
