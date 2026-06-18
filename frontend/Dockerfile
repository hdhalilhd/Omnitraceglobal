# Forklift Telemetri — frontend (Vite build) + Caddy (statik servis + reverse proxy + HTTPS)

# 1) Statik build
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Üretim: demo kapalı, API aynı origin (relative /api)
ENV VITE_DEMO=0
ENV VITE_API_BASE=
RUN npm run build

# 2) Caddy ile servis et
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
