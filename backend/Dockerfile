# Forklift Telemetri — backend üretim imajı
FROM node:20-bookworm-slim

# Prisma için openssl gerekir
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate

EXPOSE 4000

# Başlangıçta: şemayı uygula -> Timescale hypertable/aggregate -> seed -> sunucu
# (db_push/seed idempotent; seed mevcut kayıtları korur)
CMD ["sh", "-c", "npx prisma db push --skip-generate && (npx tsx prisma/applyTimescale.ts || true) && (npx tsx prisma/seed.ts || true) && npx tsx src/server.ts"]
