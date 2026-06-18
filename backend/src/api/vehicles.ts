import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authRequired, requireRole } from "../middleware/auth";
import { getLatest } from "../latest";

export const vehiclesRouter = Router();
vehiclesRouter.use(authRequired);

const vehicleSchema = z.object({
  chassisNo: z.string().min(3),
  model: z.string().optional(),
  type: z.string().optional(),
  name: z.string().optional(),
  photoUrl: z.string().url().optional().or(z.literal("")),
  tractionNodeId: z.number().int().min(0).max(127).optional(),
  pumpNodeId: z.number().int().min(0).max(127).optional(),
  deviceId: z.number().int().optional().nullable(),
  locationLabel: z.string().optional(),
});

// Liste (+ aktif hata sayısı)
vehiclesRouter.get("/", async (_req, res) => {
  const vehicles = await prisma.vehicle.findMany({
    include: { device: true },
    orderBy: { createdAt: "asc" },
  });
  const counts = await prisma.errorLog.groupBy({
    by: ["vehicleId"],
    where: { active: true },
    _count: { _all: true },
  });
  const countMap = new Map(counts.map((c) => [c.vehicleId, c._count._all]));
  res.json(vehicles.map((v) => ({ ...v, activeErrorCount: countMap.get(v.id) ?? 0 })));
});

// Detay (+ son değerler)
vehiclesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: { device: true },
  });
  if (!vehicle) {
    res.status(404).json({ error: "Araç bulunamadı" });
    return;
  }
  res.json({ ...vehicle, latest: getLatest(id) });
});

// Son değerler (canlı ilk yükleme)
vehiclesRouter.get("/:id/latest", async (req, res) => {
  res.json(getLatest(Number(req.params.id)));
});

// Oluştur
vehiclesRouter.post("/", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  const parsed = vehicleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  try {
    const v = await prisma.vehicle.create({ data: parsed.data });
    // Aracın varsayılan boş dashboard düzenini oluştur
    await prisma.dashboardLayout.create({
      data: { vehicleId: v.id, name: "default", widgets: [] },
    });
    res.status(201).json(v);
  } catch (e: any) {
    if (e.code === "P2002") {
      res.status(409).json({ error: "Bu şase numarası veya cihaz zaten kayıtlı" });
      return;
    }
    throw e;
  }
});

// Güncelle
vehiclesRouter.put("/:id", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  const id = Number(req.params.id);
  const parsed = vehicleSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz veri", details: parsed.error.flatten() });
    return;
  }
  const v = await prisma.vehicle.update({ where: { id }, data: parsed.data });
  res.json(v);
});

// Sil
vehiclesRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  await prisma.vehicle.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});
