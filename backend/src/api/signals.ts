import { Router } from "express";
import { prisma } from "../db";
import { authRequired } from "../middleware/auth";

export const signalsRouter = Router();
signalsRouter.use(authRequired);

// Tüm sinyal tanımları (Gösterge Ekle/Kaldır listesi + rapor sinyal seçimi)
signalsRouter.get("/", async (_req, res) => {
  const defs = await prisma.signalDef.findMany({ orderBy: { sortKey: "asc" } });
  res.json(defs);
});
