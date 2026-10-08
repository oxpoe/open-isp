#!/usr/bin/env bash
# Jalankan OPEN-ISP otomatis saat Codespace aktif
cd "$(dirname "$0")/.."
if pgrep -f "node app-customer.js" >/dev/null 2>&1; then
  echo "==> [OPEN-ISP] Aplikasi sudah berjalan."
  exit 0
fi
echo "==> [OPEN-ISP] Menjalankan aplikasi di background (port 3001)…"
nohup node app-customer.js > /tmp/open-isp.log 2>&1 &
sleep 3
echo "==> [OPEN-ISP] Log: /tmp/open-isp.log"
