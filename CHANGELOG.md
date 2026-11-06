# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/) dan [Semantic Versioning](https://semver.org/).

## [0.6.14] — 2026-11-06 — "portal-custom"

### Ditambahkan
- **Kustomisasi Beranda & Portal Pelanggan** dari Pengaturan:
  - banner pengumuman (info/warning/danger/success),
  - status jaringan + keterangan,
  - badge, judul, dan deskripsi hero,
  - link Google Maps, Instagram, Facebook, TikTok di footer.

## [0.6.13] — 2026-11-06 — "webhook-shopeepay"

### Diperbaiki
- Parser notifikasi pembayaran mendukung variasi **ShopeePay / Mitra Shopee** yang memakai kata “ditambahkan” / “telah ditambahkan”, tanpa mengubah aplikasi Android.

## [0.6.12] — 2026-11-06 — "acs-virtual"

### Diperbaiki
- Ekstraksi **GenieACS Pro** memakai virtual parameters: `pppoeIP`, `pppIP`, `WanIP`, `IPTR069`, `pppoeUsername2`, `PPPoEUser`, `WlanSSID`.
- Lookup perangkat via PPPoE mencakup variabel virtual tersebut, sehingga IP/username lebih cepat dan akurat tampil di tabel ACS.

## [0.6.11] — 2026-11-06 — "acs-wifi-modal"

### Ditambahkan
- Tombol **Atur WiFi (SSID / Sandi)** di daftar perangkat ACS.
- Modal menampilkan SSID 2.4G/5G saat ini, simpan SSID dan sandi terpisah.
- Endpoint `POST /admin/acs/api/device/:id/ssid` dan `/password`.

## [0.6.10] — 2026-11-06 — "acs-lookup"

### Diperbaiki
- Lookup perangkat GenieACS kini punya fallback lewat data pelanggan (ID, nomor HP, PPPoE, tag ACS, MAC), sehingga perangkat lebih cepat ditemukan dan dashboard tidak menggantung saat tag/ID tidak cocok.

## [0.6.9] — 2026-11-06 — "acs-wifi-rx"

### Diperbaiki
- **ACS/GenieACS WiFi**: SSID hanya mengubah SSID1 (2.4G) dan SSID5 (5G bila tersedia); tidak lagi menyentuh SSID2/Guest.
- `setParameterValues` dipecah per parameter agar tidak kena TR-069 fault 9007.
- Sinkronisasi nama WiFi baru ke data pelanggan setelah update.
- **RX Power**: dukung nilai negatif, konversi raw CTC EPON/GPON, dan tampilkan **LOS** saat sinyal putus.

## [0.6.8] — 2026-11-06 — "isolir-url-setting"

### Ditambahkan
- Pengaturan **URL Halaman Isolir** (`isolir_portal_url`) dan **Port Redirector Isolir** (`isolir_redirect_port`) di Info Aplikasi.
- Redirector isolir membaca URL dari pengaturan **setiap request**, jadi perubahan URL langsung berlaku tanpa restart.
- Generator script cloud memakai URL halaman isolir dari pengaturan tersebut.

## [0.6.7] — 2026-11-06 — "isolir-cloud"

### Ditambahkan
- Tab **Cloud (Sederhana)** pada modal Script Isolir (Manajemen Router): generate script RouterOS siap tempel untuk billing yang berjalan di cloud.
  - Input domain/IP publik billing, port redirector, dan profil PPPoE isolir.
  - Berisi: address-list BILLING (semua hasil resolve A), hook profil PPPoE, redirect DNS, NAT HTTP ke redirector, serta filter allow/reject/drop.
  - Deteksi Cloudflare/CDN + peringatan bila port redirector tidak ikut diproxy.
- Endpoint `GET /admin/api/isolir-cloud-script`.

## [0.6.6] — 2026-11-06 — "qr-custom-bulk"

### Ditambahkan
- **Filter tanggal** (dari/sampai) pada histori QR-Custom Payment.
- **Pilih semua / per baris** + tombol **Hapus Terpilih** (batch remove) dengan password admin.
- **Reset Histori** tetap tersedia untuk menghapus semua data.

## [0.6.5] — 2026-11-06 — "qr-custom-delete"

### Ditambahkan
- **Hapus satu QR custom** dari detail (wajib password admin).
- **Reset seluruh histori QR custom** dari header tabel (wajib password admin, konfirmasi).

## [0.6.4] — 2026-11-06 — "qr-custom-ux"

### Diperbaiki
- QR pada link publik kini **center**.
- Timer hanya tampil saat QR masih aktif; berhenti/disembunyikan ketika LUNAS, ditolak, atau kedaluwarsa.
- **Reject / Refund** kini tersedia juga untuk pembayaran yang sudah LUNAS.
- QR kedaluwarsa: **nominal dan gambar QR disembunyikan** di link publik maupun detail dashboard.
- Tombol **Regenerate** untuk membuat QR baru + kode unik baru dari QR yang kedaluwarsa (juga tersedia di tabel histori).

## [0.6.3] — 2026-11-06 — "webhook-secret-auto"

### Diperbaiki
- **Secret Token webhook pembayaran** dibuat otomatis (64 hex) bila kosong/default, ditampilkan di Pengaturan dan langsung dipakai pada URL webhook.
- URL webhook memakai **Public Base URL**; bila kosong memakai host saat ini (tidak lagi menghasilkan URL relatif).
- Default lama `billing-rtrw-secret-key` tidak lagi diterima — forwarder harus memakai secret dari Pengaturan.

## [0.6.2] — 2026-11-06 — "webhook-diag"

### Diperbaiki
- Respons webhook pembayaran kini menyertakan `matched_custom_qr_id` untuk memudahkan diagnosis QR-Custom Payment.

## [0.6.1] — 2026-11-06 — "qr-custom-gate"

### Diperbaiki
- Ikon menu **QR-Custom Payment** memakai ikon yang tersedia (`bi-qr-code`).
- Fitur QR-Custom **dinonaktifkan otomatis** bila QRIS Statis (Semi-Otomatis) belum aktif atau `qris_static_payload` kosong:
  - menu disembunyikan,
  - form pembuatan dinonaktifkan,
  - request pembuatan ditolak (tidak ada data/list dibuat tanpa QR).

## [0.6.0] — 2026-11-06 — "qr-custom"

### Ditambahkan
- **QR-Custom Payment** (menu baru di sidebar UTAMA): membuat QRIS nominal bebas dengan kode unik untuk kebutuhan di luar billing (sewa, donasi perusahaan, dll).
  - Durasi 20 menit per QR, link share publik, QR dinamis, timer, dan halaman status.
  - Webhook pembayaran mencocokkan nominal unik; pembayaran dalam 20 menit → LUNAS + notifikasi admin.
  - Pembayaran dengan nominal sama **setelah 20 menit** → status `warning` + notifikasi admin, dapat diselesaikan atau ditolak/refund.
  - Panel histori, statistik masuk/pending/warning/rejected, manual pay bila sinkron webhook gagal.
- **Mode Webhook Secret GOWA**: pilihan **Auto Generate** (kolom terkunci, tombol simpan nonaktif) atau **Manual** (isi secret → Simpan → terkunci, tombol Ubah untuk mengganti), plus tombol salin.

## [0.5.20] — 2026-11-06 — "copy-secret"

### Ditambahkan
- Tombol **salin** di samping **Webhook Secret** GOWA (sama seperti tombol salin Webhook URL), dengan umpan balik ikon centang.

## [0.5.19] — 2026-11-06 — "restart-notice"

### Ditambahkan
- Setelah update sukses, aplikasi menulis penanda `.restart-required`.
- **Floating notification** di semua halaman admin: "Billing perlu restart" berisi versi yang sudah diterapkan dan tautan cara restart.
- Banner di halaman Update menjelaskan bahwa versi sudah terbaru tetapi kode lama masih berjalan sampai restart.
- Penanda otomatis dihapus saat proses aplikasi baru start, jadi notifikasi hilang setelah restart.

## [0.5.18] — 2026-11-06 — "gowa-autodevice"

### Diperbaiki
- **Device ID kosong** = otomatis mengikuti device yang terhubung lewat QR dashboard (tidak lagi dipin/disimpan otomatis). Isi Device ID hanya untuk menunjuk device GOWA tertentu.
- **Webhook secret GOWA** dibuat otomatis (32 byte hex) bila kosong atau masih default `secret`, lalu ditampilkan di pengaturan untuk disamakan dengan `WHATSAPP_WEBHOOK_SECRET` di GOWA.

## [0.5.17] — 2026-11-06 — "gowa-connected"

### Diperbaiki
- Status GOWA membaca array `/devices` (banyak device) sehingga tidak lagi selalu menampilkan **Belum Terhubung** ketika Device ID belum diisi.
- Device yang terhubung disimpan otomatis sebagai `gowa_device_id` — tidak perlu menyalin ID manual dari UI GOWA.
- Setelah scan QR, halaman memantau status tiap 3 detik; QR otomatis disembunyikan dan status berubah **Terhubung** saat berhasil.
- Pengiriman memilih device yang benar-benar terhubung bila ada lebih dari satu device.

## [0.5.16] — 2026-11-05 — "restart-help"

### Ditambahkan
- Kotak panduan **Cara Restart Aplikasi** di halaman Update: self-hosted (PM2, manual, quadlet/systemd, Docker/Podman Compose) dan cloud/managed (restart otomatis pada update berikutnya atau hubungi admin server).

## [0.5.15] — 2026-11-05 — "update-keep-env"

### Diperbaiki
- Update aplikasi tidak lagi menghapus `.env.gowa` (kredensial/webhook GOWA) saat `git clean`.
- Log update tidak lagi menampilkan error `pathspec 'settings.json'/'database'` — file yang tidak dilacak git tidak di-checkout.
- `.env.gowa` ditambahkan ke `.gitignore`.

## [0.5.14] — 2026-11-05 — "ai-test"

### Ditambahkan
- Tombol **Test API** di Pengaturan → AI: memvalidasi provider, API key, base URL, dan model yang sedang diisi **tanpa harus menyimpan**. Menampilkan status valid/tidak, HTTP status, dan latensi.

## [0.5.13] — 2026-11-05 — "lunas-notify"

### Diperbaiki
- Notifikasi WA **LUNAS** memakai gateway aktif (GOWA/Fonnte/Meta/Baileys), bukan hanya Baileys.
- Deteksi koneksi GOWA membaca status device dari `/devices` (array) — sebelumnya dianggap tidak terhubung bila Device ID kosong, sehingga notifikasi lunas dilewati.
- Approve pembayaran kolektor dari APK admin dan pencocokan notifikasi pembayaran manual kini mengirim WA lunas ke pelanggan.

## [0.5.12] — 2026-11-05 — "gowa-test-unsaved"

### Diperbaiki
- **Test Koneksi GOWA** kini memakai nilai yang sedang diisi di form (base URL, username, password), jadi tidak perlu simpan pengaturan dulu.

## [0.5.11] — 2026-11-05 — "gowa-test"

### Ditambahkan
- Tombol **Test Koneksi** di Admin → WhatsApp → GOWA: menampilkan apakah GOWA terjangkau, status `/health`, kecocokan username/password Basic Auth, dan jumlah device terdaftar.

## [0.5.10] — 2026-11-05 — "gowa-mode"

### Ditambahkan
- Pilihan **Mode Akses GOWA** di Admin → WhatsApp: **Cloud (HTTPS)** atau **Local (HTTP)**. Mode Local menampilkan peringatan wajib polyfill `crypto.randomUUID` beserta tautan panduan wiki.
- Halaman wiki **GOWA**: setup Compose, perbedaan Cloud/Local, perintah polyfill, setting OPEN-ISP, dan troubleshooting QR/webhook.

## [0.5.9] — 2026-11-05 — "gowa-qr-image"

### Diperbaiki
- QR GOWA dikirim sebagai **data URI** sehingga gambar tetap tampil walau app berjalan multi-proses atau request gambar terpisah gagal.
- `qr_link` dari GOWA yang menunjuk host internal (`127.0.0.1`/container) ditulis ulang memakai base URL publik yang dikonfigurasi.
- Log peringatan `[GOWA] Gagal ambil gambar QR` bila pengambilan gambar gagal.

## [0.5.8] — 2026-11-05 — "gowa-qr-error"

### Diperbaiki
- QR GOWA: pesan gagal kini menampilkan status HTTP dan respons GOWA (mis. `HTTP 401 — Unauthorized`) sehingga penyebabnya langsung terlihat, bukan lagi "pastikan GOWA berjalan".

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
