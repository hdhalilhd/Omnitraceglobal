// Durum (on/off, çok-değerli) sinyalleri için metin etiketleri.
// Dashboard'da sayı yerine bu metin gösterilir (örn. Koltuk: "Dolu").
export const STATUS_LABELS: Record<string, Record<number, string>> = {
  "traction.direction": { 0: "Boş", 1: "İleri", 2: "Geri" },
  "traction.seat": { 0: "Boş", 1: "Dolu" },
  "traction.brake": { 0: "Bırakıldı", 1: "Basılı" },
  "pump.lift": { 0: "—", 1: "Aktif" },
  "pump.lower": { 0: "—", 1: "Aktif" },
};

export const STATUS_KEYS = new Set(Object.keys(STATUS_LABELS));
