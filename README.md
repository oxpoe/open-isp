> 🪞 **Repositori utama:** [Gitea](https://gitea.oxpoe.xyz/oxpoe/open-isp) — rilis & unduhan ada di sana. **Forgejo** (forgejo.oxpoe.xyz) hanya **mirror read-only**.

<p align="center">
  <img src="docs/assets/banner.png" alt="OPEN-ISP" width="100%">
</p>

<p align="center">
  <b>Sistem billing &amp; manajemen ISP (fiber optic) — open source, self-hosted builtin AI.</b><br>
  PWA pelanggan · Panel admin · Portal teknisi &amp; kolektor · Multi-OLT · RADIUS · WhatsApp/Telegram · QRIS
</p>

<p align="center">
  <img src="https://img.shields.io/badge/lisensi-ISC-ADFF2F" alt="Lisensi: ISC">
  <img src="https://img.shields.io/badge/versi-0.6.12_acs--virtual-ADFF2F" alt="Versi 0.6.12 (acs-virtual)">
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A520-339933" alt="Node.js >= 20">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white" alt="Docker">
  <a href="https://demo-openisp.oxpoe.xyz"><img src="https://img.shields.io/badge/demo-live-ADFF2F?logo=googlechrome&logoColor=black" alt="Demo"></a>
  <a href="https://oxpoe.xyz"><img src="https://img.shields.io/badge/donasi-oxpoe.xyz-e5484d?logo=buymeacoffee&logoColor=white" alt="Donasi"></a>
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitea.oxpoe.xyz%2Fapi%2Fv1%2Frepos%2Foxpoe%2Fopen-isp&query=%24.stars_count&label=stars&style=flat&color=blue&logo=gitea" alt="Stars">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitea.oxpoe.xyz%2Fapi%2Fv1%2Frepos%2Foxpoe%2Fopen-isp&query=%24.forks_count&label=forks&style=flat&color=lightgrey&logo=gitea" alt="Forks">
  <img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fgitea.oxpoe.xyz%2Fapi%2Fv1%2Frepos%2Foxpoe%2Fopen-isp&query=%24.open_issues_count&label=issues&style=flat&color=orange&logo=gitea" alt="Issues">
</p>

---

**[demo](https://demo-openisp.oxpoe.xyz) · [donate](https://oxpoe.xyz) · [main repo](https://gitea.oxpoe.xyz/oxpoe/open-isp)**

---
**OPEN-ISP** adalah aplikasi billing dan manajemen ISP yang lengkap: tagihan otomatis, isolir otomatis, pembayaran (QRIS/webhook), perangkat MikroTik (PPPoE & hotspot), OLT PON multi-vendor, TR-069 (GenieACS/ACS), RADIUS, peta jaringan, notifikasi WhatsApp & Telegram, hingga portal self-service pelanggan dalam satu platform — semuanya berjalan mandiri (self-hosted) dengan SQLite sebagai basis data. **NOTE:** dibuat dan ditulis oleh AI ([Deepseek](https://github.com/deepseek-ai)), on [opencode](https://github.com/anomalyco/opencode).

## Tangkapan Layar

| Dashboard Admin | Daftar Pelanggan |
|---|---|
| ![Dashboard](docs/screenshots/03-admin-dashboard.webp) | ![Pelanggan](docs/screenshots/04-admin-customers.webp) |

| Inventaris & Stok Keluar | Pengaturan AI & Self-Healing |
|---|---|
| ![Inventaris](docs/screenshots/05-admin-inventory.webp) | ![AI](docs/screenshots/07-admin-settings-ai.webp) |

| Login Pelanggan | Dashboard Pelanggan |
|---|---|
| ![Login](docs/screenshots/08-customer-login.webp) | ![Dashboard Pelanggan](docs/screenshots/09-customer-dashboard.webp) |

Selengkapnya (10 gambar, desktop + mobile): [`docs/screenshots/`](docs/screenshots/).

## Fitur

- **Billing & pembayaran** — tagihan bulanan otomatis (cron tanggal 1), promo & prorata per paket, kode unik/QRIS, konfirmasi bukti transfer, webhook notifikasi pembayaran, cetak invoice, bayar tunggal/massal, void/unpay.
- **Otomatisasi** — isolir otomatis (harian, per pelanggan + hari isolir), pengingat tagihan via WhatsApp, jam kalong (profil malam), FUP (turun profil saat kuota habis), sinkron pemakaian PPPoE berkala.
- **MikroTik** — multi-router, PPPoE & hotspot, voucher hotspot, monitor trafik, tes koneksi, setup firewall, backup konfigurasi, dukungan RouterOS 7 (API + TLS).
- **OLT PON multi-vendor** — Hioso & HSGQ (SNMP), ZTE & Huawei (CLI/Telnet): statistik ONU, reboot/rename/otorisasi, konfigurasi WAN/OMCI. Tersedia `scripts/olt-probe.js` untuk mendeteksi OLT baru.
- **TR-069 (GenieACS/ACS)** — daftar perangkat, ubah SSID/password Wi-Fi, reboot, operasi massal.
- **RADIUS** — server PAP/CHAP untuk PPPoE/hotspot, secret per-NAS.
- **Peta & GIS** — Leaflet + OpenStreetMap/satelit: marker pelanggan & ODP, jalur kabel, trafik PPPoE real-time; peta teknisi + rute Google Maps.
- **Portal & peran** — admin (super admin/admin/kasir), teknisi (tiket, input pelanggan dari lapangan), kolektor (cek tagihan & pengajuan pembayaran), dan **PWA pelanggan** (tagihan, bayar, tiket, SSID/password, speed test, mode offline).
- **Notifikasi** — WhatsApp (gateway [Gowa](https://github.com/aldinokemal/go-whatsapp-web-multidevice): broadcast, pengingat otomatis, struk pembayaran; **monitoring & interaksi admin via Telegram** (menu & perintah: `/sistem`, `/pendapatan`, `/offline`, `/olt`, dll).
- **Speed test** — server internal maupun eksternal (preset provider diatur admin), mode embed/tab, tombol Muat Ulang & Bersihkan Cache.
- **PWA** — dapat dipasang di HP, offline, pembaruan otomatis (bar "versi baru tersedia").
- **Bilingual** — antarmuka Indonesia / English (bisa diganti dari UI).
- **Inventaris gudang** — stok masuk, keluar (FIFO / serial number), retur, stock opname, detail unit, harga & supplier, statistik stok.
- **AI & otomatisasi** — provider AI OpenAI-compatible (DeepSeek/OpenAI/Groq/OpenRouter/custom), bot Telegram AI, dan **self-healing** jaringan dengan toggle on/off.
- **Keamanan** — security watchdog brute-force (app + MikroTik), batas sesi login per akun (staff 2, pelanggan 3), rotasi session ID, alert suara/Telegram.
- **Pembatasan wilayah** — teknisi & kolektor hanya mengakses pelanggan/tiket/perangkat di area tugasnya.
- **Lain-lain** — tiket dukungan, laporan, monitoring sistem (CPU/RAM/disk), ODP, backup/restore database, audit log.

## Tangkapan Layar

<table>
<tr>
<td align="center"><b>Dashboard Admin</b><br><img src="docs/screenshots/admin-dashboard.webp" width="420"></td>
<td align="center"><b>Data Pelanggan</b><br><img src="docs/screenshots/admin-customers.webp" width="420"></td>
</tr>
<tr>
<td align="center"><b>Tagihan &amp; Pembayaran</b><br><img src="docs/screenshots/admin-billing.webp" width="420"></td>
<td align="center"><b>OLT (PON)</b><br><img src="docs/screenshots/admin-olts.webp" width="420"></td>
</tr>
<tr>
<td align="center"><b>Portal Pelanggan (PWA)</b><br><img src="docs/screenshots/customer-dashboard.webp" width="250"></td>
<td align="center"><b>Tagihan Pelanggan</b><br><img src="docs/screenshots/customer-billing.webp" width="250"></td>
</tr>
</table>

Selengkapnya: **[Wiki OPEN-ISP](https://gitea.oxpoe.xyz/oxpoe/open-isp/wiki)**.

## Mulai Cepat

### Demo online

Coba tanpa instal: **[demo-openisp.oxpoe.xyz](https://demo-openisp.oxpoe.xyz)** — login `admin` / `demo-isp123`.

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/oxpoe/open-isp)

### GitHub Codespaces (demo instan)

Klik badge di atas untuk membuka **Codespaces** — dependensi & data demo disiapkan otomatis, dan aplikasi langsung berjalan di **port 3001**. Login: `admin` / `demo-isp123`.

### Docker (disarankan)

```bash
git clone https://gitea.oxpoe.xyz/oxpoe/open-isp.git
cd open-isp
docker compose up -d
```

Buka **http://localhost:3001** — login awal `admin` / `demo-isp123` (**segera ganti password**).
Data tersimpan di volume `docker-data/` (settings, database, logs, uploads, sesi WhatsApp).

### WhatsApp gateway GOWA + UI (Podman / Docker Compose)

GOWA dijalankan sebagai container terpisah, lengkap dengan dashboard/scan QR bawaan:

```bash
cp .env.gowa.example .env.gowa   # isi GOWA_BASIC_AUTH + GOWA_WEBHOOK_SECRET
podman compose --env-file .env.gowa -f docker-compose.gowa.yml up -d
```

Buka dashboard di **http://<ip-host>:3000** (login Basic Auth), lalu scan QR.
Di OPEN-ISP → **Admin → WhatsApp**: pilih gateway **GOWA**, isi base URL `http://127.0.0.1:3000`
(app di host yang sama), username/password, dan **webhook secret** yang sama dengan `.env.gowa`.

> **UI hanya loading saat diakses lewat `http://IP:3000`?** gowa-ui memakai `crypto.randomUUID`
> yang hanya tersedia di secure context (HTTPS atau `localhost`). Pilih salah satu:
> pakai HTTPS/reverse proxy, buka lewat SSH tunnel (`ssh -L 3000:127.0.0.1:3000 user@server`
> lalu `http://localhost:3000`), atau tambahkan polyfill `crypto.randomUUID` ke
> `storages/ui/index.html` dan set `GOWA_UI_AUTO_UPDATE=false`.

### Manual (Node.js ≥ 20, disarankan 22 LTS)

```bash
npm ci --omit=dev
npm start
```

Opsional: `cp env-example.txt .env` untuk mengisi rahasia webhook pembayaran.

### Data demo (opsional)

```bash
node scripts/seed-demo.js
```

Menambahkan paket, area, 12 pelanggan contoh, tagihan, dan tiket. Login pelanggan demo: `081200000001` (cukup nomor HP).

## Aktivasi Menu Lanjutan

Beberapa menu lanjutan terkunci secara bawaan dan bisa dibuka dengan memasukkan kode aktivasi.
Aktivasi bersifat **gratis** (tanpa donasi). Demi keamanan, kode aktivasi **tidak dipublikasikan
di repositori ini** — setiap pemilik instalasi dapat mengaturnya di `settings.json`
(kunci `activation_code`) dan membagikannya melalui kanalnya masing-masing.
Dukungan sukarela tetap diterima lewat menu **Dukung OPEN-ISP** di aplikasi.

## Dokumentasi

- [`docs/`](docs/) — referensi teknis (skema database, OID OLT, integrasi RADIUS/MikroTik, checklist backup, dll.).
- [Wiki](https://gitea.oxpoe.xyz/oxpoe/open-isp/wiki) — panduan instalasi, konfigurasi, tutorial, FAQ (sedang disusun).
- [Issues](https://gitea.oxpoe.xyz/oxpoe/open-isp/issues) — laporan bug & permintaan fitur.

## Teknologi

Node.js · Express · EJS · better-sqlite3 (SQLite) · Bootstrap 5 + Bootstrap Icons (vendor lokal) · Leaflet · PWA/Service Worker · sharp · net-snmp · MikroTik RouterOS API · GoWA (WhatsApp gateway) · Telegram Bot API.

## Lisensi &amp; Kredit

Dirilis dengan lisensi **ISC** — bebas digunakan, dimodifikasi, dan didistribusikan ulang (sertakan lisensi). Lihat [`LICENSE`](LICENSE).

- **Base kode &amp; repo**: [alijayanet/billing-rtrw](https://github.com/alijayanet/billing-rtrw) — dibuat oleh **Alijaya Net**. Terima kasih banyak atas base kode dan repo yang bermanfaat.
- **Add-on**: GoWA (WhatsApp gateway), LibreSpeed & OpenSpeedTest (speed test), Uptime Kuma (monitoring, opsional), notification-forwarder.
- **Dikembangkan oleh** [oxpoe](https://gitea.oxpoe.xyz/oxpoe) — **code by DeepSeek V4.1 Flash — max, on opencode**.
- Terima kasih untuk para kontributor dan komunitas ISP Indonesia.

## Dukungan &amp; Donasi

OPEN-ISP tumbuh dari karya **Alijaya Net** — ayo dukung juga pengembang aslinya:

- **Donasi Alijaya Net**: [app.alijaya.com/donasi](https://app.alijaya.com/donasi) · WhatsApp [0819-4721-5703](https://wa.me/6281947215703)
- **Demo online**: [demo-openisp.oxpoe.xyz](https://demo-openisp.oxpoe.xyz)
- **Donasi OPEN-ISP**: [oxpoe.xyz](https://oxpoe.xyz) — sukarela, untuk pengembangan fitur.

Dukungan juga bisa lewat menu **Dukung OPEN-ISP** di aplikasi.

---

## English (quick)

**OPEN-ISP** is an open-source ISP billing & management system: customer PWA, admin/technician/collector portals, MikroTik PPPoE & hotspot, multi-vendor OLT (SNMP/CLI), GenieACS TR-069, RADIUS, WhatsApp & Telegram notifications, QRIS payments, and a bilingual (ID/EN) UI.

Live demo: **https://demo-openisp.oxpoe.xyz** (`admin` / `demo-isp123`). Donate: **https://oxpoe.xyz**.

Quick start: `docker compose up -d` → http://localhost:3001 (default login `admin` / `demo-isp123`).
Advanced menus are unlocked with a free activation code — not published in this repository (set via `activation_code` in `settings.json`). License: **ISC**. Based on the base code & repo by **Alijaya Net** ([alijayanet/billing-rtrw](https://github.com/alijayanet/billing-rtrw)). Code by DeepSeek V4.1 Flash — max, on opencode.
