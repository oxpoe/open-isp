# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/) dan [Semantic Versioning](https://semver.org/).

## [0.5.7] — 2026-11-05 — "gowa-podman"

### Ditambahkan
- `docker-compose.gowa.yml` + `.env.gowa.example`: menjalankan **GOWA** (WhatsApp gateway + dashboard/UI) dengan Docker atau Podman Compose, termasuk webhook ke OPEN-ISP dan Basic Auth.

## [0.5.6] — 2026-11-05 — "qris-hangus"

### Diperbaiki
- **QRIS mengikuti skema hangus**: nominal unik hanya untuk **satu tagihan** (tagihan terbaru). Tagihan lama otomatis `void` saat tagihan baru terbit, jadi tidak ada tunggakan menumpuk.
- Kirim tagihan QRIS manual memakai tagihan **terbaru** (sebelumnya bisa mengambil tagihan lama).

### Catatan
- Nonaktif otomatis setelah **3 bulan** menunggak dan hapus akun pada bulan berikutnya tetap berjalan sesuai pengaturan `auto_deactivate_months` / `auto_delete_overdue_enabled`.

## [0.5.5] — 2026-11-05 — "qris-fix"

### Diperbaiki
- **Kode unik bentrok**: pengecekan nominal unik sekarang mencakup invoice, voucher, dan donasi sekaligus — mencegah pembayaran dianggap ambigu oleh webhook (dulu bisa tidak diproses sama sekali).
- **Kirim tagihan QRIS manual**: gambar QR benar-benar terlampir (path `qrcode` tidak lagi hardcoded ke `/opt/billing-rtrw`), nominal di pesan memakai nominal unik, dan placeholder `{{qris_kode}}` didukung.
- **Kirim tagihan manual** memilih tagihan paling lama lebih dulu (sebelumnya tagihan terbaru).
- Pesan **pengingat manual** kini jujur saat tidak dikirim (WA/notifikasi OFF, gateway belum siap, atau tidak ada target hari ini), bukan “dijalankan: target 0”.

## [0.5.4] — 2026-11-05 — "wa-notice"

### Ditambahkan
- **WA ke pelanggan saat tiket gangguan dibuat** (web & aplikasi): konfirmasi laporan diterima beserta nomor tiket `#TCK-…`.
- **Notifikasi WA pada Status Layanan**: centang "Kirim notifikasi WhatsApp" saat mode berubah ke **Gangguan Masal**/**Perbaikan**, dengan target semua pelanggan aktif, per area, atau per router.
- **WA "Layanan Kembali Normal"** otomatis saat mode dikembalikan ke NORMAL.
- Pengiriman broadcast berjalan di latar belakang dengan jeda acak mengikuti `whatsapp_broadcast_delay`, nomor duplikat digabung, dan hasilnya dicatat di log (`[NoticeWA]`).

## [0.5.3] — 2026-11-05 — "forge-lime"

### Ditambahkan
- **Pembatasan wilayah kerja**: teknisi & kolektor hanya melihat/menangani pelanggan, tiket, perangkat, dan tagihan di area tugasnya (dukung multi-area). Admin/root tetap penuh.
- **Inventaris gudang**: alur stok keluar (FIFO / serial number), retur barang bekas, stock opname dengan selisih otomatis, detail unit per barang, statistik stok, serta harga & supplier.
- **Edit slip payroll**: rincian gaji (tunjangan, potongan, bonus, lembur) dapat diubah selama status masih draft; total dihitung ulang otomatis.
- **AI & Self-Healing**: provider AI OpenAI-compatible (DeepSeek default, OpenAI, Groq, OpenRouter, custom/Ollama), bot Telegram menjawab pertanyaan admin, dan auto-repair jaringan (status isolir vs tagihan, secret PPPoE hilang/tertukar profil, sesi RADIUS menggantung, IP ACS kosong) dengan **toggle on/off** di Pengaturan.
- **Security Watchdog**: deteksi brute-force login admin/kasir/teknisi/kolektor dan MikroTik, blokir IP sementara, alert suara (TTS soundbox) + notifikasi admin.
- **Batas sesi login**: admin/kasir/teknisi/kolektor maksimal 2 sesi per akun, pelanggan 3 sesi; sesi lama diputus otomatis dan session ID dirotasi saat login.

### Diperbaiki
- Tab **Status** di halaman login pelanggan kini mengikuti setting `uptime_url` (sebelumnya selalu menuju URL lama `status.skyfiber.qzz.io`).
- Kolom API key AI disamarkan (`type=password`) agar tidak tampil di layar/screenshot.

### Dokumentasi
- 10 screenshot aplikasi (desktop + mobile) di `docs/screenshots/`.

## [0.5.2] — 2026-10-14 — "mirror-gitea"

### Diperbaiki
- Kolom **IP Address** di **GenieACS Pro** kini tampil saat **mode pencarian** (sebelumnya kosong).
- Menu **Update Gitea** otomatis disembunyikan pada instalasi **tanpa `.git`** (container/Docker), tetap tampil pada instalasi git.

### Ditambahkan
- **Badge kelengkapan data** di daftar pelanggan: centang hijau = **nomor HP + koordinat + ACS** lengkap; silang merah = ada yang kurang (tooltip menyebut yang belum).
- **Backend speedtest bawaan** (`/speedtest/*`) kini aktif (LibreSpeed self-hosted, same-origin).
- `isolir-redirect-server` dapat dijalankan **embedded** dalam proses app (opt-out via `ISOLIR_REDIRECT_EMBEDDED=0`).

## [0.5.1] — 2026-10-13 — "pickle-lime"

### Diubah
- **WhatsApp** kini **notifikasi keluar saja** (interaksi/bot perintah dimatikan); interaksi dipindah ke **Telegram**.
- **Telegram** jadi pusat monitoring admin: menu + `/sistem`, `/pendapatan`, `/tunggakan`, `/tiket`, `/offline`, `/aktif`, `/olt`, `/trafik`.
- Alert admin/monitoring (staff/GenieACS/cron) dikirim via **Telegram** (WA fallback).
- Footer & portal *brand-aware* (mengikuti `company_header`).

### Ditambahkan
- Toggle **`voucher_enabled`** (Pengaturan → Fitur Opsional) untuk menyalakan/mematikan fitur Beli Voucher.
- Notifikasi **tiket** menyertakan **Chat Pelanggan (wa.me)** + **Share Lokasi (Maps)**.

### Diperbaiki
- Spintax `{A|B|C}` diproses terpusat (teks/gambar/dokumen).
- `getTechById` (notifikasi tiket oleh admin yang sebelumnya gagal).
- Tabel `discount_logs` dibuat saat fresh-install (500 di `/admin/discounts`).
- `.devcontainer` + `.nvmrc` untuk Codespaces (Node 22).
- **Backup DB** memakai `VACUUM INTO` (konsisten walau mode WAL) dan **restore diterapkan saat startup** (sebelum koneksi DB dibuka); app restart otomatis untuk menerapkan.
- **Logger** memutar berkas otomatis (10MB × 5) dan `console.*` sisi server diarahkan ke logger (log seragam di `logs/`).
- `settings.json` permission di-set `600`.

### Keamanan
- **`npm audit`: 16 → 0** kerentanan.
  - Hapus `@whiskeysockets/baileys` (tidak dipakai).
  - Perbarui `axios`, `multer`, `brace-expansion`, `proxy-addr`.
  - `xlsx` → build resmi **SheetJS 0.20.3**.
  - `node-telegram-bot-api` 0.66 → **2.1.0** (via adapter v1→v2 internal).
- Perbaiki bug **`trust proxy`** (`X-Forwarded-For` terbalik → IP bisa dipalsukan).

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
- Dikembangkan menjadi OPEN-ISP oleh [oxpoe](https://gitea.oxpoe.qzz.io/oxpoe).
