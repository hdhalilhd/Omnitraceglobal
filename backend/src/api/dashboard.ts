import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { authRequired, requireRole } from "../middleware/auth";

export const dashboardRouter = Router();
dashboardRouter.use(authRequired);

const widgetSchema = z.object({
  signalKey: z.string(),
  type: z.enum(["gauge", "number", "chart"]),
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
});
const layoutSchema = z.object({ widgets: z.array(widgetSchema) });

async function getDefaultLayout(vehicleId: number) {
  let layout = await prisma.dashboardLayout.findFirst({
    where: { vehicleId, userId: null, name: "default" },
  });
  if (!layout) {
    layout = await prisma.dashboardLayout.create({
      data: { vehicleId, name: "default", widgets: [] },
    });
  }
  return layout;
}

// Aracın dashboard düzeni + tüm sinyal tanımları (modal için)
dashboardRouter.get("/:vehicleId", async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  const layout = await getDefaultLayout(vehicleId);
  const signals = await prisma.signalDef.findMany({ orderBy: { sortKey: "asc" } });
  res.json({ vehicleId, widgets: layout.widgets, signals });
});

// Düzeni kaydet (Gösterge Ekle/Kaldır + sürükle-bırak)
dashboardRouter.put("/:vehicleId", requireRole("ADMIN", "OPERATOR"), async (req, res) => {
  const vehicleId = Number(req.params.vehicleId);
  const parsed = layoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Geçersiz düzen", details: parsed.error.flatten() });
    return;
  }
  const layout = await getDefaultLayout(vehicleId);
  const updated = await prisma.dashboardLayout.update({
    where: { id: layout.id },
    data: { widgets: parsed.data.widgets },
  });
  res.json({ vehicleId, widgets: updated.widgets });
});
