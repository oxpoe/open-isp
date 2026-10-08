# Changelog Perubahan Kode — Billing RTRW

Project : `/opt/billing-rtrw`
Host    : `deneva`
Service : `billing-rtrw` (systemd, port 3001)
Owner   : `billing:billing`

> Project ini **belum memakai Git**, jadi file ini adalah satu-satunya catatan
> perubahan. Setiap perubahan kode selalu disertai backup file asli (lihat
> bagian *Rollback* pada tiap entri).

Format: `## [versi] — tanggal` (terbaru di atas).

---

## [v1.9.7] — 2026-09-28 16:55 — Full UI/UX Modernization & Database Optimization (Gentelella Tiles, uiverse.io Effects & Google Fonts)

### 1. Modernisasi Lengkap Seluruh Halaman Utama Admin (Gentelella Admin Style)
- **views/admin/dashboard.ejs**: Implementasi Tile KPI Stat horizontal (Total ONU, Online, Offline, Warning Redaman) dan Tile Keuangan (Pendapatan, Pelanggan Aktif, Tagihan Belum Bayar, Total Piutang) dengan indikator tren visual.
- **views/admin/customers.ejs**: Mengubah stat-grid filter pelanggan menjadi Gentelella Tile Cards interaktif (Total, Aktif, Disuspend, Nonaktif/Baru) dengan highlight filter aktif dan angka monospaced.
- **views/admin/billing.ejs**: Mengubah summary tagihan menjadi Gentelella Tile Cards (Total Tagihan, Sudah Bayar, Belum Bayar, Rasio Lunas).
- **views/admin/monitoring.ejs & views/admin/olts.ejs**: Menambahkan Google Fonts universal (Inter + JetBrains Mono).

### 2. Harmonisasi Desain Portal Pelanggan & Login (uiverse.io Style)
- **views/login.ejs**: Menyelaraskan seluruh palette warna dari hardcoded Indigo ke tema resmi Skyfiber (Teal #0d9488 & Cyan #06b6d4), menambahkan Google Fonts Plus Jakarta Sans, dan uiverse elevated glass card.
- **views/dashboard.ejs**: Menambahkan Google Fonts JetBrains Mono untuk pembacaan parameter teknis (IP, MAC, redaman dBm) dan efek micro-animation tombol .btn-uiverse-glow.

### 3. Optimasi Database SQLite
- Eksekusi PRAGMA integrity_check (hasil: ok).
- Eksekusi PRAGMA optimize untuk query planner performa tinggi.

### File disentuh
- public/css/admin.css
- views/admin/dashboard.ejs
- views/admin/customers.ejs
- views/admin/billing.ejs
- views/admin/monitoring.ejs
- views/admin/olts.ejs
- views/login.ejs
- views/dashboard.ejs
- views/isolated.ejs
- update-code.md

### Rollback
```bash
cp /opt/billing-rtrw/views/admin/customers.ejs.bak-gentelella /opt/billing-rtrw/views/admin/customers.ejs
cp /opt/billing-rtrw/views/admin/billing.ejs.bak-gentelella /opt/billing-rtrw/views/admin/billing.ejs
cp /opt/billing-rtrw/views/admin/dashboard.ejs.bak-gentelella /opt/billing-rtrw/views/admin/dashboard.ejs
cp /opt/billing-rtrw/views/login.ejs.bak-plusjakarta /opt/billing-rtrw/views/login.ejs
cp /opt/billing-rtrw/views/dashboard.ejs.bak-uiverse /opt/billing-rtrw/views/dashboard.ejs
sudo systemctl restart billing-rtrw.service
```

---

## [v1.9.6] — 2026-09-28 16:35 — Modernisasi UI/UX (Gentelella Admin Tiles, uiverse.io Effects & Google Fonts) + Matikan Service Biznet

### 1. Pematian Layanan di Server Biznet (Pencegahan Tabrakan Service)
- Service `billing-rtrw.service` di host `biznet` di-stop dan di-disable (`sudo systemctl stop & disable`).
- Process PM2 di `biznet` di-stop dan di-delete.
- Hasil: Menghilangkan konflik 409 pada Telegram Bot dan mencegah duplikasi trigger cron isolir/tagihan antar-server.

### 2. Adopsi Desain Gentelella Admin (views/admin/dashboard.ejs & public/css/admin.css)
- Mengganti grid metrik lama dengan modul **Gentelella Tile Stats (`.tile_count` & `.tile_stats_count`)**:
  - Border samping berwarna aksen (`tile-primary`, `tile-success`, `tile-danger`, `tile-warning`).
  - Label `count_top` uppercase dengan ikon jelas.
  - Nilai metrik `count` berbobot 800 dengan font monospaced tabular.
  - Sub-label `count_bottom` dengan indikator tren (`trend-up`, `trend-down`, `trend-warn`).
- Menambahkan class kontainer `.x_panel` & `.x_title` dan soft badges (`.badge-soft-success`, `.badge-soft-danger`, dll).

### 3. Adopsi Desain uiverse.io (views/dashboard.ejs)
- Menambahkan efek glassmorphism tingkat tinggi dengan border glow gradient dan shadow elevasi.
- Menambahkan animasi tombol mikro-interaktif (`.btn-uiverse-glow`) dengan hover lift-up (`translateY(-2px)`) dan klik aktif responsif.

### 4. Standarisasi Google Fonts Universal
- Mengintegrasikan **Inter** (antarmuka admin & tabel data), **Plus Jakarta Sans** (portal pelanggan & public landing), dan **JetBrains Mono** (data teknis IP, MAC, serial, dBm) melalui Google Fonts dengan koneksi teroptimasi (`preconnect` dan `display=swap`).

### File disentuh
- public/css/admin.css
- views/admin/dashboard.ejs
- views/dashboard.ejs
- update-code.md

### Rollback
```bash
cp /opt/billing-rtrw/public/css/admin.css.bak-gentelella /opt/billing-rtrw/public/css/admin.css
cp /opt/billing-rtrw/views/admin/dashboard.ejs.bak-gentelella /opt/billing-rtrw/views/admin/dashboard.ejs
cp /opt/billing-rtrw/views/dashboard.ejs.bak-uiverse /opt/billing-rtrw/views/dashboard.ejs
sudo systemctl restart billing-rtrw.service
```

---

## [v1.9.5] — 2026-09-28 16:20 — Fix Telegram Polling Flood, Unifikasi Tipografi (Plus Jakarta Sans) & Harmonize Login UI

### 1. Perbaikan Telegram Bot Polling Error Flood (services/telegramBot.js)
- Log server sebelumnya dibanjiri pesan error setiap 8 detik: error: Telegram Polling Error:.
- Penyebab: Terdeteksi error code 409 Conflict dari API Telegram karena bot token yang sama masih aktif dijalankan di server lama (biznet/migrasi).
- Solusi:
  1. Menambahkan penanganan error detail (error?.response?.body?.description || error.message) agar terbaca jelas di logger.
  2. Implementasi throttling logger (maksimal 1 log per 2 menit untuk error berulang yang sama).
  3. Memisahkan level warning khusus bila terjadi 409 Conflict, sehingga journalctl bersih tanpa spam error.

### 2. Unifikasi Tipografi & Harmonisasi Desain (views/login.ejs & views/isolated.ejs)
- Menyelaraskan seluruh font pada portal publik & login pelanggan ke **Plus Jakarta Sans** (Google Fonts).
- Menyesuaikan palette warna primer & hover pada halaman login (views/login.ejs) menggunakan tema Teal/Cyan (#0d9488, #14b8a6, #2dd4bf) agar selaras dengan dashboard pelanggan.
- Menambahkan **Plus Jakarta Sans** pada halaman terisolir (views/isolated.ejs).

### File disentuh
- services/telegramBot.js
- views/login.ejs
- views/isolated.ejs
- update-code.md

### Rollback
```bash
cp /opt/billing-rtrw/services/telegramBot.js.bak-pollfix /opt/billing-rtrw/services/telegramBot.js
cp /opt/billing-rtrw/views/login.ejs.bak-plusjakarta /opt/billing-rtrw/views/login.ejs
cp /opt/billing-rtrw/views/isolated.ejs.bak-plusjakarta /opt/billing-rtrw/views/isolated.ejs
sudo systemctl restart billing-rtrw.service
```

---

## [v1.9.4] — 2026-09-27 18:35 — Fix Theme Toggle (Dark/Light Mode), FOUC Prevention & Light Theme Styling

### Masalah
- Tombol toggle tema (#theme-icon di header dashboard pelanggan) tidak berfungsi sama sekali saat diklik.
- Penyebab:
  1. Logika Negasi Terbalik di toggleTheme(): Saat mode awal gelap, contains('light') bernilai false sehingga !false adalah true. Kode terus-menerus menyimpan dan menerapkan mode 'dark', tidak pernah beralih ke 'light'.
  2. Class Collision pada <html>: <html class='dark'> memiliki class 'dark' permanen. applyTheme lama hanya menambahkan class 'light' tanpa menghapus class 'dark'. Tailwind CSS (darkMode: 'class') tetap mengaktifkan semua style dark:... selama class 'dark' ada di <html>.
  3. FOUC saat reload: Tidak ada script sinkronisasi langsung di <head>, sehingga halaman sempat berkedip gelap sebelum DOMContentLoaded berjalan.
  4. Missing data-theme: Tidak mengeset atribut data-theme='light'/'dark' yang diperlukan oleh theme.css.

### Solusi & Perbaikan
1. Perbaikan toggleTheme() & applyTheme(mode):
   - Menghapus class 'dark' dan menambahkan 'light' saat beralih ke mode terang, dan sebaliknya saat mode gelap.
   - Menetapkan atribut data-theme pada <html> secara konsisten.
   - Sinkronisasi kedua key penyimpanan (skyfiber-customer-theme & app-theme).
   - Mengubah ikon toggle secara dinamis: fa-sun text-amber-500 pada mode terang, fa-moon text-amber-400 pada mode gelap.
2. Inline Script di <head>:
   - Menambahkan skrip sinkronisasi tema instan di dalam <head> sebelum browser merender body untuk mencegah kedip (FOUC).
3. Penyempurnaan Styling Mode Terang (Light Mode):
   - Floating glass dock disesuaikan dengan latar frosted transparan putih dan sliding pill bergradasi lembut.
   - Penyesuaian kontras input form, teks judul, card modal, dan gradien banner (tagihan lunas, tagihan aktif, info router).

### File disentuh
- views/dashboard.ejs
- update-code.md

### Rollback
```bash
cp /opt/billing-rtrw/views/dashboard.ejs.bak-themefix-20260927183449 /opt/billing-rtrw/views/dashboard.ejs
systemctl restart billing-rtrw.service
```

---

## [v1.9.3] — 2026-09-27 18:30 — Fix PWA Auto-Login, Persistent Remember Token & Session Lifetime

### Masalah
- Ketika PWA di-install di HP dan user login, saat aplikasi PWA di-kill atau ditutup, user terlempar ke halaman login lagi.
- Penyebab utama:
  1. `start_url` di `manifest.webmanifest` diset ke `/customer/login?source=pwa`.
  2. Rute `/customer/login` dan `/` memeriksa `req.session.customer`, sementara rute login hanya menyimpan `req.session.phone` dan `req.session.pppoe_username` (`customer` selalu undefined), sehingga selalu merender form login ulang.
  3. Masa berlaku cookie sesi bawaan hanya 24 jam dan disimpan di RAM (MemoryStore) tanpa token persistensi native.
  4. Service worker (`public/sw.js`) melakukan fallback navigasi ke `/customer/login` saat jaringan lambat/offline.

### Solusi & Perbaikan
1. **PWA Start URL:** Mengubah `start_url` di `/manifest.webmanifest` menjadi `/customer/dashboard`.
2. **Persistent Auto-Login Token (90 Hari):**
   - Layanan baru `services/customerAuthTokenService.js` dengan tabel SQLite `customer_auth_tokens`.
   - Mengeluarkan cookie `customer_remember` (90 hari, httpOnly, secure, lax) saat login langsung maupun verifikasi OTP.
   - Middleware auto-login di `routes/customerPortal.js` yang secara otomatis memulihkan sesi pelanggan ketika aplikasi dibuka kembali.
3. **Penyelarasan Guard Sesi:**
   - Rute `/customer/` dan `/customer/login` kini memeriksa `req.session.phone || req.session.customer` sehingga pengguna yang sudah login langsung dialihkan ke `/customer/dashboard`.
   - Objek `req.session.customer` kini diisi lengkap pada direct login dan OTP.
4. **Masa Berlaku Cookie Sesi:** Ditingkatkan dari 24 jam menjadi 30 hari.
5. **Logout Bersih:** Rute `/customer/logout` (mendukung POST dan GET) mencabut token dari database dan menghapus cookie `customer_remember` serta `customer.sid`.
6. **Fallback Offline SW v6:** Navigasi offline dialihkan ke `/offline.html` dengan tombol "Coba Lagi", bukan ke halaman login.
7. **Penyimpanan Lokal Form:** Menyimpan ID pelanggan terakhir di `localStorage` pada `views/login.ejs`.

### File disentuh
- `services/customerAuthTokenService.js` (file baru)
- `app-customer.js`
- `routes/customerPortal.js`
- `public/sw.js`
- `views/login.ejs`

---

## [v1.9.2] — 2026-09-27 18:15 — Multi-Vendor WiFi SSID & Password Changer (Huawei / Nokia / FiberHome / ZTE)

### Perbaikan Ganti SSID & Password WiFi Multi-Vendor
- Mengatasi kegagalan ganti password TR-069 akibat penumpukan multiple parameter paths dalam satu payload SOAP atomik.
- Menghindari pengiriman `PreSharedKey.1.PreSharedKey` (format hex 64 digit) bersamaan dengan `KeyPassphrase`, yang sebelumnya memicu SOAP fault 9007 (Invalid Parameter Value) di modem.
- **Deteksi Vendor Otomatis (`HWTC`, `FiberHome`, `Nokia`, `ZTE`, `ZICG`, `CIOT`, `CDTC`):**
  - Huawei / FiberHome / Nokia: memprioritaskan `PreSharedKey.1.KeyPassphrase` (menghindari fault 9007 karena penolakan `KeyPassphrase` top-level).
  - ZTE / ZICG / CIOT: memprioritaskan `KeyPassphrase`.
- **SSID 2.4G & 5G:** Mengirim path tunggal yang tepat untuk 2.4 GHz (`WLANConfiguration.1.SSID`) dan 5 GHz (`WLANConfiguration.5.SSID`) jika perangkat dual-band, tanpa menimpa interface guest/sekunder.
- Fallback cerdas berbasis standar TR-098 per vendor.

### File disentuh
- `services/customerDeviceService.js`

### Rollback
```bash
cp /opt/billing-rtrw/services/customerDeviceService.js.bak-wififix /opt/billing-rtrw/services/customerDeviceService.js
sudo systemctl restart billing-rtrw
```

---

## [v1.9.1] — 2026-09-27 16:30 — 5-Tab Floating Dock, PPOB Soon, Profil Tiket & WhatsApp Anti-Ban

### 1. Floating Dock 5-Tab (Dashboard Pelanggan)
- Menghilangkan tombol tengah (+) Aksi Cepat dan popup modal sheet.
- Menjadikan navbar 5 tombol langsung: Beranda, Router, PPOB (badge gradient "Soon"), Tagihan (ping unread), dan Profil.
- Pusat Bantuan & Pembuatan Tiket Kendala diintegrasikan ke dalam Tab Profil (`tab-profile`) dengan tombol cepat ke form pelaporan dan WhatsApp CS.
- Ditambahkan tombol "Kembali ke Profil" di halaman tiket bantuan (`tab-bantuan`).
- Banner "Layanan PPOB Segera Hadir" pada tab PPOB (`tab-ppob`).

### 2. Sinkronisasi Upstream & Fix Anti-Ban WhatsApp
- Verifikasi repository upstream `alijayanet/billing-rtrw`: base commit `ffd3c62` sudah mencakup seluruh perbaikan OLT Hioso (gap-fill DDM, Buffer UTF-8 decoding, slow SNMP session) dan timezone midnight hourCycle h23.
- Menambahkan proteksi anti-ban WhatsApp pada alert monitoring (`services/whatsappBot.mjs`):
  - Mematuhi toggle `genieacs_monitoring_enabled` (tidak kirim alert jika toggle OFF).
  - Jeda acak (8-20 detik) antar penerima saat kirim broadcast alert ke admin/teknisi.
- Menjadwalkan pemeriksaan monitoring harian pada jam 07:00 pagi (`config/genieacs.js`) lewat `node-cron` untuk mencegah spam alert berulang.

### File disentuh
- `views/dashboard.ejs`
- `services/whatsappBot.mjs`
- `config/genieacs.js`

---

## [v1.9.0] — 2026-09-26 22:55 — Floating Dock Navbar + CDN Pin + SW v5

Perubahan UI besar (navbar) sekaligus perbaikan regresi PWA/offline.

### Navbar: floating glass dock
- Bottom nav lama (waterdrop, 6 tombol horizontal) diganti **floating glass
  dock** sesuai referensi `adaptive_glassmorphism_floating_dock.html`.
- Struktur: 4 tombol langsung (**Beranda, Router, Tagihan, Profil**) + 1 tombol
  tengah `+` yang membuka **quick-action sheet** berisi
  **PPOB, Bantuan, Reconnect, Poll ONU**.
  PPOB & Bantuan sengaja dipindah ke sheet agar dock tidak terlalu padat.
- ** keenam tab tetap bisa diakses**, `id="tab-*"` tidak berubah:
  `tab-beranda`, `tab-router`, `tab-ppob`, `tab-tagihan`, `tab-bantuan`,
  `tab-profile`.
- CSS baru: `.dock-glass`, `.dock-pill` (sliding pill), `.dock-item`,
  `.dock-icon`, quick-sheet overlay. `safe-area-inset-bottom` untuk iPhone.
- JS baru: `updatePillPosition()`, `toggleQuickSheet()`, `openQuickSheet()`,
  `closeQuickSheet()`, state `currentTab`, `isSheetOpen`.
  `switchTab()` sekarang menandai `.dock-item` aktif dan memindahkan pill.
- Support keyboard: angka `1`–`6` pindah tab, `Escape` menutup sheet.
- Ikon memakai **Lucide** (`data-lucide`) + `lucide.createIcons()`.
- CSS `.waterdrop-active` yang tidak terpakai lagi dibuang.

### Perbaikan regresi offline/PWA
- **Semua CDN dashboard kini di-pin ke versi tetap** (sebelumnya `@latest` /
  tanpa versi → bisa berubah atau break tanpa notice):

  ||Aset|URL|
  |---|---|
  |Lucide|`https://unpkg.com/lucide@1.48.0/dist/umd/lucide.min.js`|
  |Chart.js|`https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js`|
  |Tailwind|`https://cdn.tailwindcss.com/3.4.17`|

  `https://unpkg.com/lucide@latest` dan `https://cdn.tailwindcss.com`
  (tanpa versi) sama-sama **redirect 302** tiap load → di-pin ke URL final.
- **Bug:** service worker hanya cache-first `cdn.jsdelivr.net`, sehingga
  Tailwind, FontAwesome, Google Fonts, dan Lucide **tidak tersedia saat
  offline** — layout PWA hancur. Sekarang `sw.js` punya array `CDN_HOSTS`:
  `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`,
  `cdn.tailwindcss.com`, `fonts.googleapis.com`, `fonts.gstatic.com`.
- Cache bust: `CACHE_NAME` / `CDN_CACHE` `customer-pwa-v4` → **`-v5`**, plus
  5 URL baru masuk `PRECACHE_URLS`.

### File disentuh
- `views/dashboard.ejs` (1481 baris)
- `public/sw.js` (173 baris)

### Verifikasi
- Render EJS OK, `div` seimbang `160/160`.
- Live `/customer/dashboard` HTTP 200, `div` seimbang `184/184`.
- Semua CDN membalas 200 tanpa redirect.
- `systemctl is-active billing-rtrw` = `active`, journal tanpa error.

### Rollback
```bash
cd /opt/billing-rtrw
cp views/dashboard.ejs.bak-twpin-225510 views/dashboard.ejs
cp public/sw.js.bak-twpin-225510 public/sw.js
sudo systemctl restart billing-rtrw
```

### Catatan
- Tampilan visual (sliding pill, animasi sheet, posisi icon) **belum dicek di
  browser sungguhan** — verifikasi di atas semuanya server-side.

---

## [v1.8.2] — 2026-09-26 22:30 — Fix flash message toast

- `notif` dari server sebelumnya tidak tampil. Kini di-render sebagai variabel
  `FLASH` (`{ text, type }`) lalu dimunculkan lewat `#toast-container`.
- Pemetaan tipe: `danger → error`, `warning → info`, selain itu `info`.
- Render diproteksi dari injeksi `</script>` via `.replace(/</g, '\u003c')`.

### File disentuh
- `views/dashboard.ejs`

### Rollback
```bash
cp views/dashboard.ejs.bak-flashfix-20260926221014 views/dashboard.ejs
sudo systemctl restart billing-rtrw
```

---

## [v1.8.1] — 2026-09-26 22:10 — Fix route `/customer/reboot` + ACS Connection Request 401

### 1. Route reboot
- `POST /customer/reboot` gagal auth karena hanya memakai `session.phone`
  sebagai token device.
- Kini memakai `buildCustomerDeviceTokens()` sehingga mencoba seluruh kandidat
  token (tag, username, serial, MAC, IP).

### 2. Connection Request 401 (fix kritis)
- ACS membalas **HTTP 401** saat perangkat menjalankan Connection Request karena
  `ConnectionRequestUsername` / `ConnectionRequestPassword` belum diset.
- Diperbaiki dengan `provisionConnectionRequestAuth(deviceId)` di
  `services/acsServerService.js`, dipanggil dari `handleInform()`.
- Alur: Basic challenge → 401 → **Digest auth → HTTP 200**.
- Default username `skyfiber`, password = `crypto.randomBytes(12)` hex per
  perangkat, disimpan di database.
- Berlaku hanya untuk perangkat yang sedang online; 3 perangkat offline akan
  ter-provisioning otomatis saat melakukan Inform.

### Hasil
- 102/105 perangkat sukses di-provisioning, 0 provisioning task gagal.
- Perubahan SSID/reboot kini berlaku ~10 detik (sebelumnya gagal).
- 3 perangkat offline akan ter-provisioning otomatis saat Inform berikutnya.

### File disentuh
- `routes/customerPortal.js` (3967 baris)
- `services/acsServerService.js` (1711 baris)

### Rollback
```bash
cd /opt/billing-rtrw
cp routes/customerPortal.js.bak-rebootfix-20260926221014 routes/customerPortal.js
cp services/acsServerService.js.bak-crfix-20260926221014 services/acsServerService.js
sudo systemctl restart billing-rtrw
```

---

## [v1.8.0] — 2026-09-26 18:04–21:07 — Redesign dashboard (APPS-style)

Redesain tampilan dashboard pelanggan dengan gaya APPS.

### Yang ditambahkan
- **Banner promo** dari database (`GET /customer/api/promo-slides`).
- **Chart pemakaian isolate-day** (maks. 3 bulan riwayat), menggantikan
  polling traffic realtime yang sebelumnya membebani server.
  Helper: `buildUsageSummary(profile, activePackage)`.
- **LibreSpeed** speedtest inline (sub-router `section-speedtest`).
- **Quick-action Reconnect** (`POST /customer/customer/reconnect`) dan
  **Poll ONU** (`POST /customer/api/device/refresh`).
- Sub-tab router: **WiFi**, **Speedtest**, **Pemakaian**.
- Tampilan AXS/PPOB (`/customer/ppob`, `/customer/topup`).
- Link WhatsApp admin otomatis ke nomor pertama di `settings.whatsapp_admin_numbers`.
- Tema persisten via `localStorage`.
- Tombol toggle lihat IP (`isIpVisible`).

### Perbaikan
- Semua endpoint palsu `/api/customer/*` diarahkan ke route `/customer/*` asli.
- Badge **GPON**: merah `Bad GPON` bila ONU tidak terdeteksi **atau** PPPoE offline.
- Form WiFi/ONT otomatis disabled bila ONU absent, dengan pesan penjelasan.
- Variabel yang dihitung defensif di ketiga cabang render:
  `hasUnpaid`, `latestUnpaid`, `latestInvoice`, `pppoeIP`, `pppoeUptime`,
  `stMaxMbps`.
- Penghapusan modal Bootstrap yang rusak.
- Layout mobile dirapikan.

### File disentuh
- `views/dashboard.ejs`

### Rollback
```bash
cp views/dashboard.ejs.bak-prefn-20260926210734 views/dashboard.ejs
# atau ke markup/endpoint stabil terakhir:
cp views/dashboard.ejs.bak-pre-newdesign-20260926181219 views/dashboard.ejs
sudo systemctl restart billing-rtrw
```

---

## [v1.7.0] — 2026-09-26 12:55–14:24 — Self-registration, tabular layout, PWA

- **Self-registration** (`/customer/register`) + pairing tag perangkat
  (`POST /customer/change-tag`).
- Tata letak tabel Payments/Fitur dikembalikan ke mode tabular
  (`.bak-tabrapikan`, `.bak-tabcss`).
- Toggle lihat/sembunyikan password WiFi.
- Tampilan jatuh tempo (due) tagihan.
- Struktur `div` diperbaiki (tag tidak seimbang) — `.bak-divfix`.
- Navbar sticky di mobile — `.bak-sticky`.
- **Service worker** diperbaiki & di-cache ulang — `.bak-swfix`, `sw3`.
- **`rxPower` ACS** ditangani di `services/acsServerService.js`.

### File disentuh
- `views/dashboard.ejs`, `routes/customerPortal.js`, `public/sw.js`,
  `services/acsServerService.js`

### Rollback
```bash
cd /opt/billing-rtrw
cp views/dashboard.ejs.bak-divfix-20260926142250 views/dashboard.ejs
cp public/sw.js.bak-swfix-20260926142327 public/sw.js
```

---

## Daftar endpoint yang dipakai dashboard

Semua Calls dari `views/dashboard.ejs` (sudah diverifikasi terhadap router):

| Aksi | Method | Endpoint |
|---|---|---|
| Promo slides | GET | `/customer/api/promo-slides` |
| Poll ONU / refresh | POST | `/customer/api/device/refresh` |
| Reconnect | POST | `/customer/customer/reconnect` |
| Ganti SSID | POST | `/customer/change-ssid` |
| Ganti password | POST | `/customer/change-password` |
| Reboot | POST | `/customer/reboot` |
| Buat tiket (+foto) | POST | `/customer/tickets/create` (multipart) |
| Bayar invoice | GET | `/customer/payment/create/:id` |
| PPOB | GET | `/customer/ppob` |
| Top up | GET | `/customer/topup` |
| Logout | GET | `/customer/logout` |

> Catatan: **tidak ada** route `/customer/poll-onu`. Tombol "Poll ONU"
> memanggil `POST /customer/api/device/refresh`.

---

## TODO / tindak lanjut

Detail lengkap ada di `/home/oxpoe/Documents/CATATAN-OPS-SKYFIBER.txt`
section 11 (mode `600`, jangan dibagikan).

### Keamanan — perlu tindakan
- [ ] Rotasi `telegram_bot_token` (via `@BotFather` → `/revoke`; token **baru**
      jangan dikirim ke chat mana pun).
- [ ] Rotasi `admin_password`.
- [ ] Rotasi `admin_api_key`.
- [ ] Amankan backup `backups/settings_20260926_211113.json` (masih memuat
      token lama) atau hapus setelah rotasi.
- [ ] Inisialisasi Git (`git init` + commit awal) supaya changelog berikutnya
      punya riwayat & diff.

### Fungsional
- [ ] **Password WiFi pelanggan uji masih nilai sementara** dan harus
      dikembalikan ke nilai asli (nilai uji tercatat di notes section 11).
- [ ] 3 perangkat belum punya CR credentials, akan provisioning otomatis saat
      online:
      - `001141-CL601-ZTEGCBBFB774`
      - `B4E46B-SIGMA Z99LX XPON-ZICG27766207`
      - `B4E46B-SIGMA Z99LX XPON-ZICG27766F6A`
- [ ] Alur pembayaran belum diuji end-to-end (butuh invoice uji).
- [ ] Cek visual floating dock di browser/HP sungguhan.
- [ ] Test PWA mode offline (SW v5) — belum pernah diuji.
- [ ] Keputusan: apakah FUP enforcement mengikuti isolate-day.
- [ ] Parity peta admin desktop vs mobile.
- [ ] Pemetaan kecepatan WiFi 2.4GHz vs 5GHz.

---

## Cara rollback umum

```bash
cd /opt/billing-rtrw
sudo systemctl stop billing-rtrw
# salin backup yang dikehendali ke file aslinya
sudo systemctl start billing-rtrw
sudo journalctl -u billing-rtrw -n 50 --no-pager
```

Backup tersedia (format `.bak-<label>-<timestamp>`):

| File | Backup |
|---|---|
| `views/dashboard.ejs` | `.bak-rxpower`, `.bak-selfapp-*`, `.bak-akun-*`, `.bak-due-*`, `.bak-tabcss-*`, `.bak-usage-ui-*`, `.bak-togglepass-*`, `.bak-tabrapikan-*`, `.bak-mobile-*`, `.bak-usageview-*`, `.bak-usagehelper-*`, `.bak-tailadmin-*`, `.bak-divfix-*`, `.bak-sticky-*`, `.bak-prefn-*`, `.bak-pre-newdesign-*`, `.bak-flashfix-*`, `.bak-dock-*`, `.bak-cdnpin-*`, `.bak-twpin-*` |
| `routes/customerPortal.js` | `.bak-selfapp-*`, `.bak-usageview-*`, `.bak-usagehelper-*`, `.bak-akun-*`, `.bak-rebootfix-*` |
| `services/acsServerService.js` | `.bak-rxpower-*`, `.bak-crfix-*` |
| `public/sw.js` | `.bak-selfapp-*`, `.bak-sw3-*`, `.bak-swfix-*`, `.bak-v4-*`, `.bak-twpin-*` |

---

## [v1.9.8] - 2026-09-28: Rombak Total UI/UX Multi-Portal (5-Color Modern Design System)

### Ringkasan Rilis
Rombak visual dan interaksi total pada seluruh portal aplikasi (Landing Page/Pelanggan, Customer PWA Dashboard, Admin Portal, Teknisi, Kolektor, dan Agen) menggunakan palette 5-warna konsisten, tipografi Google Fonts universal, elemen cyber-glassmorphism terinspirasi dari uiverse.io, dan panel KPI dense terinspirasi dari Gentelella.

### Design System & Palette
- **Dark 1 (Latar Utama)**: `#161A21`
- **Dark 2 (Gelap Sedang / Surfaces & Cards)**: `#1F2420`
- **Dark 3 (Abu-abu Gelap / Aksesori & Borders)**: `#2A313C`
- **Accent Lime (Aksen Hijau Neon)**: `#ADFF2F`
- **Light (Putih Terang / Teks)**: `#F2F5F1`
- **Typography**:
  - `Plus Jakarta Sans`: Landing, PWA Pelanggan, Heading & Kartu
  - `Inter`: Admin tabel, form controls, dense grid
  - `JetBrains Mono`: Angka teknis (IP PPPoE, MAC, Serial, RX/TX Optical Power, Speed, Bandwidth)

### Modul yang Dirombak
1. **Landing Page & Customer Login (`views/login.ejs`)**:
   - Cyber-glassmorphism card hero, paket internet (`#packages`), fitur (`#features`), layanan (`#services`), contact.
   - PWA Install Modal dengan status online/offline otomatis.
2. **Halaman Isolir / Walled Garden (`views/isolated.ejs`)**:
   - Palette `#161A21`, `#1F2420`, `#2A313C`, dan aksen neon `#ADFF2F`.
3. **Customer PWA Dashboard (`views/dashboard.ejs` & `views/partials/customer_bottom_nav.ejs`)**:
   - Floating Glass Dock 5-Tab (`#1F2420` glass) dengan sliding active pill neon lime (`#ADFF2F`).
   - Kartu status PPPoE/ONU dengan indikator neon pulse, telemetry optik, ganti SSID/password, speedtest gauge, dan Chart.js riwayat pemakaian.
4. **Admin Portal (`public/css/admin.css` & `views/admin/*`)**:
   - Update CSS variables: `--bg: #161A21`, `--bg2: #1F2420`, `--bg3: #2A313C`, `--primary: #ADFF2F`, `--text: #F2F5F1`.
   - Sidebar Gentelella modern dengan indikator aktif neon lime.
   - KPI Tile Stats (`.tile_stats_count`) pada Dashboard, Customers, dan Billing.
   - Perbaikan dark theme pada `views/admin/olts.ejs`, `monitoring.ejs`, `settings.ejs`, dan `login.ejs`.
5. **Technician Portal (`views/tech/*`)**:
   - `views/tech/partials/header.ejs`, `views/tech/partials/bottom_nav.ejs`, `views/tech/dashboard.ejs`, `monitoring.ejs`, `attendance.ejs`, `map.ejs`, dan `login.ejs`.
6. **Collector & Agent Portals (`views/collector/*`, `views/agent/*`, `public/css/theme.css`)**:
   - `public/css/theme.css` sebagai global theme provider untuk tema gelap 5-warna.
   - Modernisasi login dan dashboard collector & agent.

### Verifikasi & Integritas
- 88 dari 88 template EJS aktif berhasil dikompilasi dengan `ejs.compile` (0 error).
- Seluruh endpoint HTTP menghasilkan kode `200 OK` / valid redirect.
- Database SQLite integrity check: `ok`.
- Service `billing-rtrw.service` berjalan stabil di Systemd VPS Deneva.

---

## [v1.9.9] - 2026-09-28: Penghapusan Total Komponen Light Mode (Konsistensi Eksklusif Halogen Kit)

### Ringkasan Perubahan
Menghapus seluruh komponen *light mode*, tombol pengalih tema (*theme toggle button / FAB*), script peralihan mode terang, dan aturan CSS override  di semua portal aplikasi. Seluruh aplikasi kini konsisten 100% berjalan dalam **Mode Gelap Halogen Kit**:
1. **`public/js/theme.js`**: Menghapus fungsi injeksi tombol floating tema (`injectThemeFab`), fungsi `toggleAppTheme`, dan memaksa `data-theme=dark` di localStorage secara permanen.
2. **`public/css/theme.css`**: Menghapus seluruh blok aturan `html[data-theme=light]` dan styling tombol mengambang `.theme-fab`.
3. **Admin Sidebar (`views/admin/partials/sidebar.ejs`)`**: Menghapus tombol toggle tema pada bagian brand/header sidebar dan menyederhanakan inisialisasi dark mode.
4. **Customer PWA Dashboard (`views/dashboard.ejs`)`**: Menghapus tombol pengalih tema (`#theme-toggle-btn`) pada header topbar, menghapus fungsi `toggleTheme()` / `applyTheme()`, dan membersihkan seluruh override class CSS `html.light`.
5. **Verifikasi**: Seluruh 88 template EJS tervalidasi 0 error dan service berjalan stabil.

---

## [v1.9.9] - 2026-09-28: Penghapusan Total Komponen Light Mode (Konsistensi Eksklusif Halogen Kit)

### Ringkasan Perubahan
Menghapus seluruh komponen *light mode*, tombol pengalih tema (*theme toggle button / FAB*), script peralihan mode terang, dan aturan CSS override `html.light` di semua portal aplikasi. Seluruh aplikasi kini konsisten 100% berjalan dalam **Mode Gelap Halogen Kit**:
1. **`public/js/theme.js`**: Menghapus fungsi injeksi tombol floating tema (`injectThemeFab`), fungsi `toggleAppTheme`, dan memaksa `data-theme="dark"` di localStorage secara permanen.
2. **`public/css/theme.css`**: Menghapus seluruh blok aturan `html[data-theme="light"]` dan styling tombol mengambang `.theme-fab`.
3. **Admin Sidebar (`views/admin/partials/sidebar.ejs`)**: Menghapus tombol toggle tema pada bagian brand/header sidebar dan menyederhanakan inisialisasi dark mode.
4. **Customer PWA Dashboard (`views/dashboard.ejs`)**: Menghapus tombol pengalih tema (`#theme-toggle-btn`) pada header topbar, menghapus fungsi `toggleTheme()` / `applyTheme()`, dan membersihkan seluruh override class CSS `html.light`.
5. **Verifikasi**: Seluruh 88 template EJS tervalidasi 0 error dan service berjalan stabil.
