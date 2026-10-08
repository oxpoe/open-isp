#!/usr/bin/env bash
# Setup otomatis OPEN-ISP di GitHub Codespaces
set -e
cd "$(dirname "$0")/.."

echo "==> [OPEN-ISP] Menyiapkan dependensi sistem…"
sudo apt-get update -qq && sudo apt-get install -y -qq build-essential python3 >/dev/null 2>&1 || true

echo "==> [OPEN-ISP] Install dependensi npm…"
npm ci --omit=dev || npm install --omit=dev

echo "==> [OPEN-ISP] Siapkan file .env…"
[ -f .env ] || cp env-example.txt .env

echo "==> [OPEN-ISP] Siapkan data demo…"
node scripts/seed-demo.js || true

echo "==> [OPEN-ISP] Selesai. Aplikasi akan dijalankan otomatis di port 3001."
