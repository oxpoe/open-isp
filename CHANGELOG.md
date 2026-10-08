# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/) dan [Semantic Versioning](https://semver.org/).

## [0.5.0] — 2026-10-09 — "pickle-lime"

Rilis open-source perdana.

### Ditambahkan
- Billing otomatis, isolir otomatis, pengingat WhatsApp, jam kalong, FUP, sinkron pemakaian.
- Multi-router MikroTik (PPPoE & hotspot), voucher hotspot, backup konfigurasi.
- Multi-vendor OLT (Hioso/HSGQ via SNMP; ZTE/Huawei via CLI) + `scripts/olt-probe.js`.
- TR-069: ACS bawaan (built-in) + integrasi GenieACS.
- RADIUS (PAP/CHAP) untuk PPPoE/hotspot.
- Peta jaringan (Leaflet) admin & teknisi, ODP, jalur kabel.
- Portal: admin, kasir, teknisi, kolektor, pelanggan (PWA, offline).
- Notifikasi WhatsApp (GoWA/Baileys) & Telegram.
- Pembayaran QRIS + webhook, kode unik, gateway opsional.
- Antarmuka bilingual Indonesia/English.
- Docker (Dockerfile + docker-compose), data demo (`scripts/seed-demo.js`).
- Lisensi ISC + Wiki dokumentasi.

### Kredit
- Base kode & repo: [alijayanet/billing-rtrw](https://github.com/alijayanet/billing-rtrw) oleh **Alijaya Net**.
- Dikembangkan menjadi OPEN-ISP oleh [oxpoe](https://github.com/oxpoe).
