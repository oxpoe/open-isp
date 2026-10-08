# ─────────────────────────────────────────────────────────────────────────────
# OPEN-ISP — Dockerfile (produksi)
# Build:  docker compose build
# Run:    docker compose up -d
# ─────────────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    TZ=Asia/Jakarta

# tzdata: zona waktu · curl: healthcheck · ca-certificates: HTTPS keluar (WhatsApp/dll)
RUN apt-get update && apt-get install -y --no-install-recommends \
      tzdata curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifest dulu → cache layer dependensi
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Sisa aplikasi (lihat .dockerignore — data pribadi TIDAK ikut ke image)
COPY . .

# Folder runtime (di-mount oleh docker-compose)
RUN mkdir -p /app/logs /app/public/uploads /app/data /app/database

EXPOSE 3001

# Healthcheck ringan via /version.txt
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3001/version.txt > /dev/null || exit 1

CMD ["node", "app-customer.js"]
