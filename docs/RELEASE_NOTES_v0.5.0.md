# OPEN-ISP v0.5.0 (pickle-lime) — Rilis Open-Source Perdana

Rilis pertama OPEN-ISP: sistem **billing & manajemen ISP (fiber optic)** open-source (lisensi ISC), self-hosted.

## Sorotan
- **PWA Pelanggan** (offline), **Admin**, **Teknisi**, **Kolektor** dalam satu aplikasi.
- **Billing otomatis**: generate tagihan, isolir otomatis, pengingat, prorata/promo, FUP, jam kalong.
- **Multi-vendor OLT** (Hioso, HSGQ, ZTE, Huawei) + `scripts/olt-probe.js`.
- **TR-069** (ACS bawaan + GenieACS), **RADIUS** (PAP/CHAP).
- **Pembayaran**: QRIS statis + webhook, kode unik, gateway opsional.
- **Antarmuka bilingual** Indonesia / English.
- **Docker & GitHub Codespaces** siap jalan (`docker compose up -d`).

## Peran notifikasi (edisi ini)
- **WhatsApp = notifikasi keluar**: broadcast, pengingat, struk, **notif tiket ke teknisi** (dengan tautan **Chat Pelanggan** + **Share Lokasi**). Bot tidak membalas perintah.
- **Telegram = monitoring & kontrol admin**: menu + perintah `/sistem`, `/pendapatan`, `/tunggakan`, `/tiket`, `/offline`, `/aktif`, `/olt`, `/trafik`, `/ringkasan`, `/lunas`, `/generate`, `/isolir`, `/buka`, `/listonu`, `/info`, `/reboot`, `/gantissid`, `/gantisandi`, `/kick`, `/editpppoe`, `/cekpppoe`, `/vcr`, `/vouch`, `/cari`.
- **Spintax** `{A|B|C}` otomatis untuk anti-ban.

## Perbaikan
- Menambahkan tabel `discount_logs` (fresh-install) yang sebelumnya hilang.
- Memperbaiki `getTechById` (notifikasi tiket oleh admin).
- Spintax diproses terpusat (teks/gambar/dokumen).

## Kredit
- Base kode & repo: [alijayanet/billing-rtrw](https://github.com/alijayanet/billing-rtrw) oleh **Alijaya Net** — terima kasih.
- Add-on: GoWA, LibreSpeed/OpenSpeedTest, Uptime Kuma, notification-forwarder.
- Dikembangkan oleh [oxpoe](https://github.com/oxpoe) — **code by DeepSeek V4.1 Flash — max, on opencode**.

## Instalasi singkat
```bash
git clone https://github.com/oxpoe/open-isp.git && cd open-isp
docker compose up -d     # http://localhost:3001 (admin / demo-isp123)
```
