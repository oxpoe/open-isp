# RUJUKAN ARSITEKTUR & FITUR SISTEM BILLING RTRW-NET

Dokumen ini disimpan sebagai **rujukan utama** arsitektur, fitur backend, frontend, dan skema database sebelum dilakukan penambahan fitur RADIUS Server.

---

## 1. DOKUMENTASI MODUL & KOMPONEN EKSISTING

### A. Core Engine & Entry Point
- **`app-customer.js`**: Main entry point Express.js v4.
  - Memuat middleware security: CORS, Referer/Origin CSRF Protection, Express Session, Body Parser limit 1MB.
  - Pengatur i18n multi-bahasa (`locales/`).
  - Menjalankan background service: Auto-backup (`scheduleAutoBackup`), Cron Billing (`cronService.js`), WhatsApp Bot, Telegram Bot.
  - Mengunci DNS ke IPv4 (`dns.setDefaultResultOrder('ipv4first')`) untuk mencegah timeout IPv6 di server produksi.

### B. Database & Stored Layer (`config/database.js`)
- **Engine**: SQLite 3 menggunakan driver `better-sqlite3` (Native C++ extension, high performance).
- **Mode**: `WAL` (Write-Ahead Logging) dengan `foreign_keys = ON`.
- **Fungsi Kustom SQLite**: `NOW_LOCAL()` (memformat tanggal-waktu berdasarkan timezone lokal `Asia/Jakarta`).
- **Tabel Utama**:
  1. `settings` (Dynamic Key-Value Store)
  2. `packages` (Paket Internet: harga, speed up/down, promo, jam kalong, FUP)
  3. `customers` (Data Pelanggan: no_pelanggan, nama, phone, pppoe_user, pppoe_secret, status, isolir_date, router_id, odp_id, genieacs_tag)
  4. `invoices` & `payments` (Tagihan & Pembayaran)
  5. `routers` (Daftar Router MikroTik: host, port 8728, username, password, status)
  6. `pppoe_users` & `pppoe_traffic_samples` & `pppoe_sessions`
  7. `hotspot_users` & `hotspot_profiles` & `hotspot_sessions`
  8. `voucher_batches` & `vouchers` & `public_voucher_orders`
  9. `olts`, `odps`, `onu_mapping`, `acsdevices` (Modul FTTH & TR-069 ACS)
  10. `technicians`, `cashiers`, `collectors`, `agents` (Akses multi-role)
  11. `audit_trail` (Log aktivitas pengguna)

### C. Services Layer (`services/`)
1. **`mikrotikService.js`**:
   - Menghubungkan aplikasi ke RouterOS via API port 8728/8729 menggunakan `routeros-client`.
   - Mengelola PPPoE Secret (Add, Update, Delete, Toggle Enable/Disable).
   - Mengelola Hotspot User & Active Sessions.
   - Mengambil trafik interface & active connections secara realtime.
   - Mengatur isolir pelanggan via MikroTik API (mengubah profile / IP pool).
2. **`customerService.js`**:
   - CRUD Pelanggan, komparasi data lokal vs router.
   - Penanganan siklus isolir & pemulihan status otomatis.
3. **`billingService.js`**:
   - Penjadwalan & pembuatan invoice bulanan.
   - Pembayaran invoice (Cash, Transfer, QRIS, Gateway Midtrans/Tripay/Xendit).
   - Eksekusi auto-isolir saat jatuh tempo.
4. **`cronService.js`**:
   - Menjalankan penagihan otomatis jam 00:05.
   - Cek auto-isolir harian jam 01:00.
   - Sampling statistik trafik jam 10 menit sekali.
   - Notifikasi reminder tagihan via WA / Telegram.
5. **`oltService.js` & `onuProvisionService.js` & `acsServerService.js`**:
   - Integrasi OLT ZTE/Huawei/FiberHome via SNMP & Telnet.
   - TR-069 Auto-Provisioning CPE via GenieACS.

### D. Route & Portal Layer (`routes/`)
1. **`/admin` (`adminPortal.js`)**: Portal Utama Admin (Dashboard, Pelanggan, Paket, Router, Transaksi, Laporan, OLT/ACS, Settings).
2. **`/customer` (`customerPortal.js`)**: Portal Pelanggan Self-Service (Cek Tagihan, Bayar QRIS, Tiket Komplain).
3. **`/agent` (`agentPortal.js`)**: Portal Agen (Jual Voucher, Topup Pulsa Digiflazz).
4. **`/collector` (`collectorPortal.js`)**: Portal Kolektor Penagih Lapangan.
5. **`/tech` (`techPortal.js`)**: Portal Teknisi (Tiket Gangguan, Pasang Baru, Mapping ODP).
6. **`/finance` (`financePortal.js`)**: Portal Keuangan (Pemasukan & Pengeluaran Kas).

### E. Frontend & Views (`views/`)
- Menggunakan **EJS (Embedded JavaScript)** dengan template responsive.
- Menggunakan CSS Vanilla & Custom Theme (Dark/Light Mode), Bootstrap Icons / FontAwesome.
- AJAX Fetch API untuk interaksi data tanpa reload halaman.

---

## 2. ATURAN INTEGRASI FITUR RADIUS (NON-BREAKING GUARANTEE)

1. **Prinsip Utama**: Seluruh modul MikroTik API eksisting **TIDAK BOLEH DIUBAH ATAU DIHAPUS**.
2. **Fleksibilitas**: Sistem akan mendukung 2 mode otentikasi router:
   - **Mode 1 (Default Eksisting)**: MikroTik API (`routeros-client`).
   - **Mode 2 (Fitur Baru)**: RADIUS Server (UDP Port 1812/1813).
   - **Mode 3 (Hybrid)**: MikroTik API + RADIUS Server berjalan bersamaan.
3. **Database Integration**: RADIUS Server akan langsung membaca & menulis ke `database/billing.db` eksisting:
   - Mengotentikasi kredensial pengguna dari tabel `customers` / `pppoe_users` / `hotspot_users`.
   - Mengirimkan atribut RADIUS standar (`Framed-IP-Address`, `Mikrotik-Rate-Limit`, `Session-Timeout`).
   - Menerima paket RADIUS Accounting (Start/Interim/Stop) dan mencatat penggunaan kuota/bandwidth ke tabel `pppoe_traffic_samples` & `radius_accounting_logs`.
