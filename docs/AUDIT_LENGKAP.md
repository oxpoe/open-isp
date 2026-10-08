# AUDIT LENGKAP APLIKASI BILLING RTRWnet (B481)
**Status Aplikasi:** BERJALAN & PRODUKSI  
**Tanggal Audit:** Juni 2026  
**Tipe Sistem:** ISP Billing & Management System  

---

## 1. INFORMASI UMUM APLIKASI

### 1.1 Identitas Sistem
- **Nama Aplikasi:** RTRWNET Management & Billing System
- **Versi:** 1.0.0
- **Entry Point:** `app-customer.js`
- **Port Default:** 3001 (dapat diubah di settings.json)
- **Host Default:** localhost (dapat diubah di settings.json)
- **Runtime:** Node.js ≥20.0.0

### 1.2 Tech Stack
- **Backend Framework:** Express.js 4.18.2
- **Database:** SQLite (better-sqlite3 11.3.0)
- **Frontend Templating:** EJS 3.1.10
- **CSS Framework:** Bootstrap 5 + Bootstrap Icons
- **Mapping Library:** Leaflet (Peta geografis)
- **WhatsApp Integration:** Baileys (@whiskeysockets/baileys 6.7.21)
- **Session Management:** express-session 1.18.1
- **File Upload:** multer 2.1.1
- **Task Scheduling:** node-cron 4.2.1
- **Spreadsheet:** xlsx (dari CDN sheetjs)

### 1.3 Fitur Utama
1. **Portal Pelanggan** (Self-service)
2. **Portal Admin** (Manajemen lengkap)
3. **Portal Teknisi** (Field support)
4. **Portal Agen** (Sales & pembayaran)
5. **Portal Kolektor** (Approval pembayaran)
6. **Portal Finance** (Laporan keuangan)
7. **Billing & Invoicing** (Tagihan otomatis)
8. **MikroTik Integration** (PPPoE, Hotspot, Voucher)
9. **GenieACS Integration** (Manajemen CPE/ONU)
10. **OLT PON Management** (SNMP-based)
11. **WhatsApp Automation** (Baileys)
12. **Payment Gateway** (Midtrans, Tripay, Xendit, Duitku)
13. **GIS Mapping** (Peta pelanggan & ODP)
14. **Inventory Management** (Gudang)
15. **Ticketing System** (Support)
16. **Built-in TR-069 ACS** (Lightweight, tanpa GenieACS eksternal)

---

## 2. ARSITEKTUR SISTEM

### 2.1 Struktur Direktori
```
billing-B481/
├── app-customer.js              ← Entry point utama
├── config/                      ← Konfigurasi sistem
│   ├── database.js             (SQLite initialization)
│   ├── logger.js               (Logging - Winston & Pino)
│   ├── settingsManager.js      (Kelola settings.json)
│   ├── settingsValidator.js    (Validasi konfigurasi)
│   ├── genieacs.js             (GenieACS API connector)
│   ├── genieacs-commands.js    (GenieACS command builder)
│   ├── i18n.js                 (Internationalization)
│   ├── customerTag.js          (Customer tagging logic)
│   └── settingsEncryption.js   (Encryption helpers)
├── services/                    ← Business logic (27 files)
│   ├── billingService.js       (Invoice generation, promo, prorata)
│   ├── customerService.js      (CRUD pelanggan)
│   ├── adminService.js         (Admin management)
│   ├── mikrotikService.js      (RouterOS API)
│   ├── oltService.js           (OLT/SNMP management)
│   ├── onuProvisionService.js  (ONU provisioning)
│   ├── telegramBot.js          (Telegram integration)
│   ├── cronService.js          (Task scheduling)
│   ├── paymentService.js       (Payment gateways)
│   ├── voucherPaymentService.js (E-voucher)
│   ├── monitoringService.js    (Health check)
│   └── ...17 services lainnya
├── routes/                      ← API endpoints & page rendering
│   ├── customerPortal.js       (Customer login, profile, billing)
│   ├── adminPortal.js          (Admin panel)
│   ├── techPortal.js           (Teknisi portal)
│   ├── agentPortal.js          (Agen sales & pembayaran)
│   ├── collectorPortal.js      (Kolektor approval)
│   ├── financePortal.js        (Finance reports)
│   ├── voucherPaymentAPI.js    (Voucher API)
│   ├── settingsAPI.js          (Settings management API)
│   └── admin/                  (Admin sub-routes)
├── middleware/                  ← Middleware Express
│   ├── errorHandler.js         (Error handling)
│   ├── settingsMiddleware.js   (Settings injection)
│   └── attendanceUpload.js     (Attendance upload)
├── views/                       ← EJS Templates (78 files)
│   ├── customer/               (Customer portal pages)
│   ├── admin/                  (Admin portal pages)
│   ├── tech/                   (Teknisi pages)
│   ├── agent/                  (Agen pages)
│   ├── collector/              (Kolektor pages)
│   ├── partials/               (Reusable components)
│   └── ...public pages
├── public/                      ← Static files
│   ├── css/                    (Bootstrap, custom styles)
│   ├── img/                    (Logo, heroes)
│   ├── js/                     (Frontend logic)
│   ├── uploads/                (QRIS, payment proof, tickets)
│   ├── sw.js                   (Service worker PWA)
│   └── manifest.webmanifest    (PWA manifest)
├── database/                    ← SQLite database
│   └── billing.db              (Main database file)
├── scripts/                     ← Utility scripts
│   ├── fix-database.sh         (Database migration)
│   ├── verify-database.js      (Database check)
│   └── ...test & migration scripts
├── locales/                     ← i18n translations
│   ├── en.json                 (English)
│   └── id.json                 (Indonesian)
├── settings.json               ← Application configuration
├── package.json                ← Dependencies
└── .env                        ← Environment variables (optional)
```

### 2.2 Flow Aplikasi

**Startup Process:**
1. `node app-customer.js` → Load `app-customer.js`
2. Inisialisasi database SQLite (`config/database.js`)
3. Load settings dari `settings.json`
4. Setup middleware (session, CSRF, i18n)
5. Mount portals (customer, admin, tech, agent, collector)
6. Start cron jobs (billing, isolir, pengingat tagihan)
7. Listen pada port `settings.json.server_port`

**Request Flow (Contoh: Customer Login):**
```
GET /customer/login
  ↓ (Express routing)
  ↓ (Session middleware)
  ↓ (i18n middleware)
  ↓ (customerPortal.js router)
  ↓ (No auth required - render login page)
  ↓ (EJS template rendering)
  ← Response: HTML page
```

**POST Login Flow:**
```
POST /customer/login
  ↓ (Body parsing middleware)
  ↓ (CSRF check via Referer/Origin)
  ↓ (customerPortal.js - findCustomerProfileByLoginId)
  ↓ (Database query: SELECT * FROM customers WHERE id/email/phone = ?)
  ↓ (Verify kredensial)
  ↓ (Set session.userId)
  ↓ (Redirect ke /customer/dashboard)
  ← Response: 302 redirect
```

---

## 3. DATABASE & SCHEMA

### 3.1 Karakteristik Database
- **Type:** SQLite (better-sqlite3)
- **File Location:** `database/billing.db`
- **Journal Mode:** WAL (Write-Ahead Logging)
- **Foreign Keys:** Enabled
- **Timezone Function:** NOW_LOCAL() berdasarkan setting `timezone`

### 3.2 Tabel Utama
Berdasarkan `config/database.js`, tabel yang di-initialize:

1. **Konfigurasi & Settings**
   - `settings` (key-value store untuk pengaturan runtime)
   - `expense_categories` (kategori pengeluaran)

2. **Master Data**
   - `packages` (Paket layanan - name, price, speed_down, speed_up)
   - `customers` (Pelanggan - phone, email, paket, PPPoE, GenieACS tag)
   - `routers` (MikroTik router - host, user, password, port)
   - `olts` (OLT devices - host, community SNMP, port, brand)
   - `odps` (ODP - Optical Distribution Point - koordinat, lokasi)

3. **Billing & Invoicing**
   - `invoices` (Tagihan - customer_id, period_year, period_month, amount, status)
   - `payments` (Pembayaran - invoice_id, amount, method, gateway, proof)
   - `payment_approvals` (Approval kolektor - pending approval)

4. **PPPoE Management**
   - `pppoe_users` (User PPPoE - username, secret, speed profile)
   - `pppoe_traffic_samples` (Traffic monitoring - bytes in/out, timestamp)

5. **Hotspot**
   - `hotspot_users` (User hotspot - username, password)
   - `hotspot_sessions` (Session aktif)

6. **Voucher**
   - `voucher_batches` (Batch voucher - name, quantity, amount, price)
   - `vouchers` (Individual vouchers - code, batch_id, status)

7. **GenieACS & TR-069**
   - `acsdevices` atau `genieacs_devices` (Daftar perangkat ACS)
   - `acs_sessions` (Session TR-069)

8. **OLT & ONU**
   - `onu_mapping` (Pemetaan ONU ke pelanggan - olt_id, onu_port)
   - `onu_provision` (Status provisioning ONU)

9. **Operasional**
   - `audit_trail` (Log audit untuk aktivitas sensitif)
   - `expenses` (Catatan pengeluaran)
   - `cash_in` (Catatan pemasukan)
   - `technicians` (Daftar teknisi + login)
   - `cashiers` (Daftar kasir)
   - `agents` (Daftar agen)
   - `collectors` (Daftar kolektor)
   - `tickets` (Tiket support)
   - `inventory_items` (Item gudang)
   - `attendance` (Kehadiran karyawan)
   - `digiflazz_transactions` (Pulsa/data digital transaksi)
   - `vomit_log` (Log webhook pembayaran)

### 3.3 Skema Relasi
```
customers (1) ──→ (N) invoices
            ├─→ (N) payments
            ├─→ (N) pppoe_users
            ├─→ (N) tickets
            └─→ (1) packages

packages (1) ──→ (N) customers
           └─→ (N) pppoe_profiles

routers (1) ──→ (N) pppoe_users
        └─→ (N) hotspot_users

olts (1) ──→ (N) onu_mapping
    ├─→ (N) onu_provision
    └─→ (1) odps

voucher_batches (1) ──→ (N) vouchers
agents (1) ──→ (N) payments (via agent commission)
```

---

## 4. ENDPOINTS & ROUTES

### 4.1 Portal Pelanggan (/customer)
**File:** `routes/customerPortal.js`

**Authentication Routes:**
| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/customer/login` | Form login pelanggan |
| POST | `/customer/login` | Proses login (ID/email/phone) |
| GET | `/customer/logout` | Logout & destroy session |
| GET | `/customer/register` | Form registrasi pelanggan baru |
| POST | `/customer/register` | Proses registrasi |
| POST | `/customer/login-with-otp` | Login dengan OTP (jika enabled) |

**Dashboard & Info:**
| GET | `/customer/dashboard` | Dashboard utama pelanggan |
| GET | `/customer/billing` | Riwayat tagihan |
| GET | `/customer/payment` | Halaman pembayaran |
| GET | `/customer/invoice/:id` | Detail invoice (cetak) |
| GET | `/customer/terms` | Syarat & ketentuan |
| GET | `/customer/privacy` | Kebijakan privasi |

**CPE/Device Management:**
| GET | `/customer/device/:id` | Detail perangkat (SSID, password) |
| POST | `/customer/device/:id/reboot` | Reboot CPE |
| POST | `/customer/device/:id/wifi-change` | Ubah SSID/password Wi-Fi |
| POST | `/customer/device/:id/identify` | Identify perangkat (blink LED) |

**Support & Ticketing:**
| GET | `/customer/tickets` | Daftar tiket pelanggan |
| POST | `/customer/tickets/create` | Buat tiket baru |
| POST | `/customer/tickets/:id/reply` | Reply tiket |

**Payments:**
| POST | `/customer/pay` | Initiate pembayaran (gateway) |
| GET | `/customer/payment/callback` | Callback payment gateway |
| POST | `/api/webhook/v1/payment-notif` | Webhook pembayaran generik |

**Voucher:**
| GET | `/customer/voucher` | Halaman beli voucher |
| POST | `/customer/voucher/buy` | Beli voucher hotspot |

### 4.2 Portal Admin (/admin)
**File:** `routes/adminPortal.js`

**Authentication:**
| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/admin/login` | Form login admin |
| POST | `/admin/login` | Proses login admin |
| GET | `/admin/logout` | Logout admin |

**Dashboard & Reporting:**
| GET | `/admin/dashboard` | Dashboard ringkasan |
| GET | `/admin/reports` | Report keuangan/agregasi |
| GET | `/admin/billing/report` | Laporan billing |
| GET | `/admin/agents/report` | Laporan agen |

**Pelanggan Management:**
| GET | `/admin/customers` | Daftar pelanggan |
| GET | `/admin/customers/search` | Search pelanggan |
| GET | `/admin/customers/:id` | Detail pelanggan |
| POST | `/admin/customers` | Tambah pelanggan |
| PUT | `/admin/customers/:id` | Edit pelanggan |
| DELETE | `/admin/customers/:id` | Hapus pelanggan |
| POST | `/admin/customers/:id/isolate` | Isolir pelanggan |
| POST | `/admin/customers/:id/unisolate` | Buka isolir |
| POST | `/admin/customers/reset-promo` | Reset siklus promo |
| GET | `/admin/customers/import` | Form impor pelanggan |
| POST | `/admin/customers/import` | Upload & impor Excel |
| GET | `/admin/customers/export` | Export daftar pelanggan |

**Billing & Invoicing:**
| GET | `/admin/billing/invoices` | Daftar invoice |
| GET | `/admin/billing/invoices/:id` | Detail invoice |
| POST | `/admin/billing/generate` | Generate tagihan bulanan |
| POST | `/admin/billing/generate-single` | Generate untuk 1 pelanggan |
| POST | `/admin/billing/unpay` | Batalkan pembayaran |
| POST | `/admin/billing/prorata-susulan` | Prorata bulan pasang |
| GET | `/admin/billing/print/:id` | Cetak invoice |

**Pembayaran & Gateway:**
| GET | `/admin/payments` | Daftar pembayaran |
| POST | `/admin/payments/verify` | Verifikasi pembayaran |
| GET | `/admin/payments/webhook-logs` | Log webhook pembayaran |
| POST | `/admin/payments/process` | Manual bayar invoice |
| GET | `/admin/settings/gateways` | Konfigurasi payment gateway |

**Paket Layanan:**
| GET | `/admin/packages` | Daftar paket |
| POST | `/admin/packages` | Tambah paket |
| PUT | `/admin/packages/:id` | Edit paket |
| DELETE | `/admin/packages/:id` | Hapus paket |

**MikroTik Management:**
| GET | `/admin/mikrotik/routers` | Daftar router |
| POST | `/admin/mikrotik/routers` | Tambah router |
| PUT | `/admin/mikrotik/routers/:id` | Edit router |
| POST | `/admin/mikrotik/test-connection` | Test koneksi router |
| GET | `/admin/mikrotik/pppoe/profiles` | Profil PPPoE |
| GET | `/admin/mikrotik/pppoe/users` | Daftar user PPPoE |
| GET | `/admin/mikrotik/pppoe/active-sessions` | Sesi PPPoE aktif |
| GET | `/admin/mikrotik/hotspot/users` | User hotspot |
| GET | `/admin/mikrotik/hotspot/active` | Sesi hotspot aktif |
| GET | `/admin/mikrotik/voucher/batches` | Batch voucher |
| POST | `/admin/mikrotik/voucher/generate` | Generate voucher |
| POST | `/admin/mikrotik/voucher/print` | Cetak voucher |
| GET | `/admin/mikrotik/voucher/export` | Export voucher CSV |

**GenieACS & CPE:**
| GET | `/admin/genieacs/devices` | Daftar perangkat |
| GET | `/admin/genieacs/devices/:id` | Detail perangkat |
| POST | `/admin/genieacs/devices/:id/set-ssid` | Ubah SSID massal |
| POST | `/admin/genieacs/devices/:id/reboot` | Reboot perangkat |
| POST | `/admin/genieacs/devices/:id/provision` | Provision parameter |

**OLT & ONU Management:**
| GET | `/admin/olts` | Daftar OLT |
| POST | `/admin/olts` | Tambah OLT |
| PUT | `/admin/olts/:id` | Edit OLT |
| GET | `/admin/olts/:id/onuses` | ONU per OLT |
| POST | `/admin/olts/:id/onu-reboot` | Reboot ONU |
| POST | `/admin/olts/:id/onu-authorize` | Otorisasi ONU |
| POST | `/admin/olts/:id/onu-rename` | Rename ONU |

**Peta & Geografis:**
| GET | `/admin/map` | Peta interaktif pelanggan & ODP |
| GET | `/admin/map/customer-data` | JSON data pelanggan untuk peta |
| POST | `/admin/map/save-route` | Simpan jalur kabel |

**Agen Management:**
| GET | `/admin/agents` | Daftar agen |
| POST | `/admin/agents` | Tambah agen |
| PUT | `/admin/agents/:id` | Edit agen |
| POST | `/admin/agents/:id/topup` | Top-up saldo agen |
| GET | `/admin/agents/:id/transactions` | Transaksi agen |
| GET | `/admin/agents/digiflazz` | Dashboard Digiflazz |

**Tiket & Support:**
| GET | `/admin/tickets` | Daftar tiket |
| GET | `/admin/tickets/:id` | Detail tiket |
| POST | `/admin/tickets/:id/assign` | Assign ke teknisi |
| POST | `/admin/tickets/:id/close` | Tutup tiket |

**Pengguna Internal:**
| GET | `/admin/users/technicians` | Daftar teknisi |
| POST | `/admin/users/technicians` | Tambah teknisi |
| PUT | `/admin/users/technicians/:id` | Edit teknisi |
| GET | `/admin/users/cashiers` | Daftar kasir |
| POST | `/admin/users/cashiers` | Tambah kasir |
| GET | `/admin/users/collectors` | Daftar kolektor |

**WhatsApp & Notifikasi:**
| GET | `/admin/whatsapp/status` | Status koneksi WhatsApp |
| POST | `/admin/whatsapp/auth` | Otorisasi WhatsApp (QR code) |
| POST | `/admin/whatsapp/logout` | Logout WhatsApp |
| GET | `/admin/whatsapp/broadcast` | Form broadcast massal |
| POST | `/admin/whatsapp/broadcast/send` | Kirim broadcast |
| POST | `/admin/whatsapp/broadcast/pause` | Pause broadcast |
| POST | `/admin/whatsapp/test-notification` | Test notifikasi |

**Inventory & Maintenance:**
| GET | `/admin/inventory` | Daftar inventory |
| POST | `/admin/inventory` | Tambah item |
| PUT | `/admin/inventory/:id` | Edit item |
| POST | `/admin/inventory/:id/adjust` | Adjustment stok |

**Backup & Settings:**
| GET | `/admin/backup` | Halaman backup |
| POST | `/admin/backup/create` | Buat backup |
| POST | `/admin/backup/restore` | Restore backup |
| POST | `/admin/backup/delete` | Hapus backup file |
| GET | `/admin/settings` | Halaman settings |
| POST | `/admin/settings/save` | Simpan settings |
| POST | `/admin/settings/test-connection` | Test koneksi berbagai service |

**Audit & Monitoring:**
| GET | `/admin/audit-logs` | Riwayat audit |
| GET | `/admin/monitoring` | Status sistem |

### 4.3 Portal Teknisi (/tech)
**File:** `routes/techPortal.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/tech/login` | Login teknisi |
| POST | `/tech/login` | Proses login |
| GET | `/tech/dashboard` | Dashboard teknisi |
| GET | `/tech/tickets` | Pool tiket untuk teknisi |
| POST | `/tech/tickets/:id/take` | Ambil tiket |
| POST | `/tech/tickets/:id/update` | Update progress tiket |
| POST | `/tech/tickets/:id/complete` | Selesaikan tiket |
| GET | `/tech/map` | Peta pelanggan & rute |
| GET | `/tech/customers/new` | Input pelanggan baru |
| POST | `/tech/customers/new` | Submit pelanggan baru |
| GET | `/tech/devices` | Daftar perangkat GenieACS |
| GET | `/tech/monitoring` | Monitoring sistem |
| POST | `/tech/attendance/check-in` | Check-in kehadiran (GPS) |
| POST | `/tech/attendance/check-out` | Check-out kehadiran |

### 4.4 Portal Agen (/agent)
**File:** `routes/agentPortal.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/agent/login` | Login agen |
| POST | `/agent/login` | Proses login agen |
| GET | `/agent/dashboard` | Dashboard agen |
| GET | `/agent/billing/check` | Cek tagihan pelanggan |
| POST | `/agent/billing/pay` | Bayar tagihan (saldo agen) |
| GET | `/agent/voucher` | Halaman jual voucher |
| POST | `/agent/voucher/buy` | Beli voucher dari stok |
| POST | `/agent/voucher/print` | Cetak struk transaksi |
| GET | `/agent/digiflazz` | Dashboard produk digital |
| POST | `/agent/digiflazz/buy` | Beli pulsa/data |
| GET | `/agent/digiflazz/status` | Cek status transaksi |
| GET | `/agent/balance` | Saldo akun agen |
| GET | `/agent/transactions` | Riwayat transaksi |

### 4.5 Portal Kolektor (/collector)
**File:** `routes/collectorPortal.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/collector/login` | Login kolektor |
| POST | `/collector/login` | Proses login |
| GET | `/collector/dashboard` | Dashboard kolektor |
| GET | `/collector/billing/check` | Cek tagihan pelanggan |
| POST | `/collector/billing/request` | Buat request pembayaran |
| GET | `/collector/requests` | Daftar request pending |
| GET | `/collector/history` | Riwayat approval |

### 4.6 Portal Finance (/finance)
**File:** `routes/financePortal.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/finance/dashboard` | Dashboard keuangan |
| GET | `/finance/summary` | Ringkasan pemasukan/pengeluaran |
| GET | `/finance/expenses` | Laporan pengeluaran |
| POST | `/finance/expenses` | Catat pengeluaran |
| GET | `/finance/cashflow` | Laporan arus kas |

### 4.7 Public Routes (Tanpa Login)
| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/` | Redirect ke `/customer/login` |
| GET | `/login` | Alias singkat customer login |
| GET | `/isolated` | Halaman isolir statis (redirect MikroTik) |
| GET | `/isolated/status` | Polling status pelanggan isolir |
| GET | `/public/check-billing` | Cek tagihan tanpa login |
| GET | `/public/voucher` | Halaman beli voucher publik |
| GET | `/qris/static.jpg` | QRIS statis untuk pembayaran |
| GET | `/uploads/qris/:filename` | Download QRIS image |
| GET | `/health` | Health check endpoint |
| POST | `/webhook/digiflazz` | Webhook Digiflazz callback |
| POST | `/acs` | Built-in TR-069 ACS endpoint |

### 4.8 Settings & Configuration API
**File:** `routes/settingsAPI.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/api/settings` | Ambil settings (cached) |
| POST | `/api/settings` | Update settings |
| POST | `/api/settings/test-genieacs` | Test koneksi GenieACS |
| POST | `/api/settings/test-mikrotik` | Test koneksi MikroTik |
| POST | `/api/settings/test-tripay` | Test koneksi Tripay |
| POST | `/api/settings/test-midtrans` | Test koneksi Midtrans |
| GET | `/api/backup/list` | Daftar backup files |

### 4.9 Voucher Payment API
**File:** `routes/voucherPaymentAPI.js`

| Method | Endpoint | Fitur |
|--------|----------|-------|
| GET | `/api/voucher/available` | List voucher tersedia |
| POST | `/api/voucher/purchase` | Beli voucher (JSON API) |
| GET | `/api/voucher/status/:code` | Cek status voucher |

---

## 5. FITUR-FITUR UTAMA

### 5.1 Billing & Invoicing
**Service:** `services/billingService.js`

**Fitur:**
- ✅ Generate tagihan bulanan otomatis (trigger: 1 bulan 00:01)
- ✅ Harga Promo: Diskon N siklus pertama per pelanggan
- ✅ Prorata: Tagihan proportional untuk bulan pasang
- ✅ Susulan Prorata: Tambahan tagihan untuk menutup bulan pasang
- ✅ Status Invoice: Draft → Pending → Paid → Overdue → Cancelled
- ✅ Reset Promo Cycles: Admin dapat reset ulang harga promo
- ✅ Cetak Invoice: PDF-ready HTML format

**Database Tables:**
- `invoices` (id, customer_id, period_year, period_month, amount, status, notes)
- `payments` (id, invoice_id, amount, method, gateway, proof, timestamp)
- `payment_approvals` (id, payment_id, approver_id, status)

### 5.2 MikroTik Integration
**Service:** `services/mikrotikService.js`

**Fitur:**
- ✅ Multi-router support (multiple MikroTik instances)
- ✅ RouterOS 7 compatible
- ✅ PPPoE: Profil, user/secret, sesi aktif, monitor trafik
- ✅ Hotspot: Profil, user, sesi aktif
- ✅ Jam Kalong: Ganti profil malam/siang otomatis (cron 00:00 & 06:00)
- ✅ FUP (Fair Usage Policy): Monitor GB & ganti profil turun kecepatan
- ✅ Usage Tracking: Sinkron pemakaian setiap 10 menit dari sesi aktif
- ✅ Voucher: Generate batch, sinkron, cetak, export CSV
- ✅ Backup Konfigurasi: Download backup dari router

**Supported Operations:**
- Add/Remove PPPoE user
- Monitor active sessions
- Change profile (traffic shaping)
- Generate voucher codes
- Export/import configuration

### 5.3 GenieACS & TR-069
**Services:**
- `services/acsServerService.js` (Built-in lightweight ACS)
- `services/customerDeviceService.js` (CPE/ONU device management)
- `routes/acsPortal.js` (GenieACS REST API integration)

**Fitur:**
- ✅ Built-in ACS server (lightweight, tanpa GenieACS eksternal opsional)
- ✅ Multi-ACS support (fallback ke GenieACS eksternal jika built-in disabled)
- ✅ Device discovery & provisioning otomatis
- ✅ Change SSID/password Wi-Fi
- ✅ Reboot CPE
- ✅ Parameter provisioning
- ✅ Monitor RX Power (optical signal strength)
- ✅ Bulk SSID update

**Configuration:**
```json
{
  "use_builtin_acs": true,
  "genieacs_url": "http://192.168.x.x:7557",
  "genieacs_monitoring_enabled": true,
  "genieacs_rxpower_threshold": -27
}
```

**ACS URL untuk ONU:**
- `http://[IP-SERVER]:[PORT]/acs`
- Contoh: `http://192.168.1.100:3001/acs`

### 5.4 OLT & ONU Management
**Service:** `services/oltService.js`, `services/onuProvisionService.js`

**Fitur:**
- ✅ Multi-OLT support (Telnet, SNMP, REST API)
- ✅ SNMP monitoring: Statistik ONU per port
- ✅ Telnet: Konfigurasi ZTE OLT (OMCI)
- ✅ REST API: go-api-c320 untuk ZTE (VLAN/Bridge)
- ✅ ONU Actions:
  - Reboot ONU
  - Rename ONU
  - Otorisasi ONU baru
  - Konfigurasi WAN (Telnet/OMCI/TR069/REST)
  - Konfigurasi VLAN & Bridge

**OLT Brands Supported:**
- ZTE C-series (Telnet, REST)
- Huawei
- FiberHome
- VSOL
- C-Data
- China Mobile, Telecom, Unicom

### 5.5 GIS Mapping & Geografis
**Services:** `routes/admin/maps.js`, `routes/tech/map`

**Frontend Library:** Leaflet + OpenStreetMap/Google Hybrid

**Fitur:**
- ✅ Peta interaktif dengan marker pelanggan & ODP
- ✅ Garis hubung pelanggan ke ODP
- ✅ Polyline jalur kabel per pelanggan (simpan/load)
- ✅ Popup detail: status, paket, trafik real-time
- ✅ Basemap toggle: OSM & Satelit
- ✅ GPS lokasi teknisi (peta teknisi)
- ✅ Rute Google Maps integration
- ✅ WhatsApp chat button di popup
- ✅ Drag-drop lokasi pelanggan baru

**Koordinat Default:**
```json
{
  "office_lat": "-6.252118625253105",
  "office_lng": "107.9205270612316"  ← Titik acuan peta
}
```

### 5.6 WhatsApp Automation (Baileys)
**Service:** `services/telegramBot.js` (typo filename, actually WhatsApp)

**Fitur:**
- ✅ Koneksi WhatsApp via Baileys (login QR code)
- ✅ Broadcast massal dengan jeda/antrian
- ✅ Notifikasi tagihan pembayaran otomatis
- ✅ Pengingat H-1 isolir (cron 09:00)
- ✅ Admin commands (menu, billing tools, pulsa Digiflazz)
- ✅ Agent commands (beli pulsa, cek saldo)
- ✅ Jeda/pause/stop broadcast
- ✅ Reset autentikasi session
- ✅ Variasi pesan otomatis (randomize)

**Commands:**
```
Admin:
  /admin       → Menu admin
  /billing     → Billing tools
  /mikrotik    → MikroTik tools
  /digiflazz   → Cek saldo Digiflazz
  /topup       → Top-up saldo agen

Agent:
  /buy         → Beli pulsa Digiflazz
  /status      → Cek status transaksi
```

### 5.7 Payment Gateways
**Service:** `services/paymentService.js`

**Supported Gateways:**
- ✅ **Midtrans** (Verifone): Snap, QRIS, e-wallet
- ✅ **Tripay**: Bank transfer, e-wallet, QRIS
- ✅ **Xendit**: Invoice API
- ✅ **Duitku**: Bank transfer, QRIS
- ✅ **Generic Webhook**: Endpoint `POST /api/webhook/v1/payment-notif`

**Fitur Payment:**
- ✅ Multi-gateway routing
- ✅ QRIS dinamis per invoice
- ✅ QRIS statis untuk pembayaran umum
- ✅ Kode unik per invoice (automatic)
- ✅ Webhook callback notification
- ✅ Payment verification & auto-settle
- ✅ Automatic WhatsApp notification
- ✅ Offline/manual payment entry (kasir)
- ✅ Payment proof upload (foto struk)

**Configuration:**
```json
{
  "default_gateway": "tripay",
  "midtrans_enabled": true,
  "tripay_enabled": false,
  "xendit_enabled": true,
  "duitku_enabled": true
}
```

### 5.8 Agen & Sales Management
**Services:** `services/agentService.js`, Digiflazz integration

**Fitur:**
- ✅ Multi-agen support
- ✅ Saldo agen (top-up oleh admin)
- ✅ Bayar tagihan pelanggan dari saldo agen
- ✅ Jual voucher hotspot
- ✅ Transaksi pulsa/data digital Digiflazz
- ✅ Laporan transaksi agen
- ✅ Harga khusus per agen
- ✅ Commission tracking

**Digiflazz Integration:**
- ✅ Webhook untuk update status transaksi
- ✅ Sync produk (kategori, brand, nominal)
- ✅ Cek saldo Digiflazz
- ✅ Admin dashboard Digiflazz
- ✅ Signature-based authentication

### 5.9 Ticketing System
**Service:** `services/ticketService.js`

**Fitur:**
- ✅ Pelanggan bisa buat tiket
- ✅ Teknisi assign tiket dari pool
- ✅ Update progress tiket
- ✅ Lampiran foto tiket
- ✅ Reply & follow-up
- ✅ Close tiket dengan resolusi

### 5.10 Inventory & Warehouse
**Service:** `services/inventoryService.js`

**Fitur:**
- ✅ CRUD kategori & item
- ✅ Tracking stok
- ✅ Adjustment & penyesuaian
- ✅ Alert stok rendah
- ✅ Riwayat transaksi inventory

### 5.11 Monitoring & Health Check
**Services:** `services/monitoringService.js`, `services/diagnosticsService.js`

**Fitur:**
- ✅ CPU, RAM, Disk usage
- ✅ Konektivitas ke GenieACS
- ✅ Konektivitas ke MikroTik
- ✅ Konektivitas ke OLT
- ✅ Database size
- ✅ Public endpoint: `GET /health` (lightweight)

### 5.12 Cron Jobs (Otomasi Terjadwal)
**Service:** `services/cronService.js`

**Jadwal:**
| Waktu | Fitur | Command |
|-------|-------|---------|
| **1 bulan, 00:01** | Generate tagihan bulanan | `generateMonthlyInvoices()` |
| **Setiap hari 02:00** | Isolir otomatis pelanggan jatuh tempo | `autoIsolatePlansExpired()` |
| **Setiap hari 09:00** | Pengingat tagihan H-1 via WhatsApp | `sendBillingReminders()` |
| **00:00 & 06:00** | Jam Kalong (ganti profil PPPoE) | `handleTimeBasedProfileChange()` |
| **Setiap 10 menit** | Sinkron usage PPPoE | `syncUsageTracking()` |
| **Setiap jam** | FUP check & profile tuning | `checkFUPQuota()` |

### 5.13 Backup & Restoration
**Service:** `services/backupService.js`

**Fitur:**
- ✅ Backup database (SQLite)
- ✅ Backup settings.json
- ✅ Backup kombinasi (database + settings)
- ✅ Restore dari backup file
- ✅ Auto-cleanup backup lama (retention policy)
- ✅ Scheduled backup (opsional)

### 5.14 Audit Trail & Logging
**Services:** `services/auditTrailService.js`, logging via Winston/Pino

**Fitur:**
- ✅ Log aktivitas sensitif (login, pembayaran, settings)
- ✅ Timestamp + user + action
- ✅ Cleanup audit trail otomatis (default 90 hari)
- ✅ Export audit log

### 5.15 Attendance & Geofencing
**Service:** `services/attendanceService.js`

**Fitur:**
- ✅ Check-in/check-out dengan GPS
- ✅ Geofencing: validasi radius dari kantor (default 100m)
- ✅ Foto kehadiran upload
- ✅ Riwayat kehadiran per karyawan
- ✅ Report kehadiran

**Configuration:**
```json
{
  "attendance_geofencing": true,
  "attendance_radius": 100,
  "office_lat": "-6.252118625253105",
  "office_lng": "107.9205270612316"
}
```

---

## 6. KEAMANAN & OTENTIKASI

### 6.1 Authentication Methods
1. **Session-based (Express-session)**
   - Session secret: `settings.json.session_secret` (HARUS diganti)
   - Storage: Memory (upgrade ke Redis untuk production)
   - TTL: Configurable

2. **Role-based Access Control (RBAC)**
   - Super Admin (unrestricted)
   - Admin (most features)
   - Kasir (payment-only)
   - Teknisi (support tasks)
   - Kolektor (approval-only)
   - Agen (sales-only)
   - Pelanggan (self-service)

3. **OTP Login (Opsional)**
   - via WhatsApp atau SMS
   - `settings.json.login_otp_enabled` = true

### 6.2 CSRF Protection
**Implementasi:** Referer/Origin checking (middleware di app-customer.js)
- Hanya untuk POST/PUT/DELETE
- Check header referer/origin terhadap domain lokal
- Aman untuk production tanpa perlu CSRF token di EJS

### 6.3 Encryption & Secrets
- **Database encryption:** opsional di `config/settingsEncryption.js`
- **Session secret:** `settings.json.session_secret` (HARUS random)
- **API keys:** Stored di `settings.json` (recommended: external .env atau secrets manager)
- **Password:** TODO implement bcrypt hashing (current: plaintext risky!)

### 6.4 Security Best Practices (TODO)
⚠️ **Recommendations for Production:**
1. ✅ Session secret → random string (24+ characters)
2. ✅ HTTPS everywhere (reverse proxy: nginx)
3. ✅ Rate limiting (brute force protection)
4. ✅ Input validation & sanitization
5. ❌ Password hashing → Implement bcrypt
6. ❌ CORS → Restrict allowed origins
7. ❌ API authentication → Token-based (JWT)
8. ❌ Audit logging → Already implemented
9. ❌ Admin API key → Currently weak, use strong random key
10. ❌ Settings encryption → For sensitive data (credentials)

---

## 7. FRONTEND & UI

### 7.1 Template Engine
- **EJS:** 78 template files total

### 7.2 Frontend Framework
- **Bootstrap 5.x** (CDN atau local)
- **Bootstrap Icons** (bi bi-*)
- **jQuery** (minimal usage)
- **Chart.js / Apex Charts** (untuk grafik)
- **Leaflet** (untuk peta)

### 7.3 View Structure (78 files)
```
views/
├── admin/           (Admin portal pages)
├── agent/           (Agen portal pages)
├── collector/       (Kolektor portal pages)
├── customer/        (Pelanggan portal pages)
├── tech/            (Teknisi portal pages)
├── partials/        (Reusable components)
├── login.ejs        (Default login)
├── dashboard.ejs    (Dashboard template)
├── isolated.ejs     (Halaman isolir)
└── ...public pages
```

### 7.4 CSS & Styling
- **Bootstrap 5 utility classes** (primary framework)
- **Custom CSS:** `public/css/style.css`, `public/css/admin.css`
- **Responsive design** (mobile-first)
- **Dark mode:** opsional (implementasi partial)

### 7.5 Frontend Features
- ✅ Lazy loading (CSS, images, icons)
- ✅ Service Worker (PWA) - `public/sw.js`
- ✅ PWA manifest - `public/manifest.webmanifest`
- ✅ Offline caching (limited)
- ✅ Real-time peta (Leaflet, WebSocket opsional)
- ✅ Form validation (client + server)
- ✅ Responsive tables (horizontal scroll pada mobile)

---

## 8. INTERNATIONALIZATION (i18n)

**Configuration:** `config/i18n.js`

**Supported Languages:**
- 🇮🇩 Indonesian (id) - default
- 🇬🇧 English (en) - alternative

**Translation Files:**
- `locales/id.json` (Indonesian UI strings)
- `locales/en.json` (English UI strings)

**Usage:**
```
GET /lang/en → Set session language to English
GET /?lang=en → Query parameter override
```

**Template Usage:**
```ejs
<%= i18n.t('key_name') %>
```

---

## 9. CONFIGURATION & SETTINGS

### 9.1 settings.json Structure
```json
{
  // GenieACS
  "genieacs_url": "http://...",
  "genieacs_username": "...",
  "genieacs_password": "...",
  "genieacs_monitoring_enabled": true,
  "genieacs_rxpower_threshold": -27,

  // Company Info
  "company_header": "ALIJAYA NET",
  "company_manager": "ALIJAYA NET",
  "company_phone": "6281947215703",
  "company_email": "...",
  "company_address": "...",

  // Server
  "server_port": 3001,
  "server_host": "localhost",
  "timezone": "Asia/Jakarta",

  // Security
  "session_secret": "change-this-to-random-secret-key",
  "admin_username": "admin",
  "admin_password": "admin123",
  "admin_api_key": "admin-api-key-change-this",

  // MikroTik
  "mikrotik_host": "192.168.8.1",
  "mikrotik_user": "admin",
  "mikrotik_password": "admin",
  "mikrotik_port": 8728,

  // Billing
  "isolir_day": 20,

  // Payment Gateways
  "default_gateway": "tripay",
  "tripay_enabled": false,
  "tripay_api_key": "...",
  "midtrans_enabled": true,
  "midtrans_server_key": "...",
  "xendit_enabled": true,
  "duitku_enabled": true,

  // WhatsApp
  "whatsapp_enabled": true,
  "whatsapp_broadcast_delay": 60,

  // Geographic
  "office_lat": "-6.252...",
  "office_lng": "107.920...",
  "attendance_geofencing": true,
  "attendance_radius": 100,

  // Features
  "login_otp_enabled": false,
  "telegram_enabled": false,
  "use_builtin_acs": true,
  "auto_backup_enabled": false
}
```

### 9.2 Environment Variables (.env)
- `NODE_ENV` (development/production)
- `MY_WEBHOOK_SECRET` (generic webhook security)
- Optional: sensitive credentials

### 9.3 Settings Management API
**Endpoints:**
- `GET /api/settings` → Get cached settings
- `POST /api/settings` → Update settings (admin only)
- `POST /api/settings/test-*` → Test connectivity

---

## 10. DEPENDENCIES & LIBRARIES

### 10.1 Production Dependencies
```json
{
  "express": "^4.18.2",           // Web framework
  "express-session": "^1.18.1",   // Session management
  "ejs": "^3.1.10",               // Template engine
  "better-sqlite3": "^11.3.0",    // SQLite driver
  "multer": "^2.1.1",             // File upload
  "axios": "^1.6.7",              // HTTP client
  "node-cron": "^4.2.1",          // Task scheduling
  "dotenv": "^16.3.1",            // ENV file loading
  "@whiskeysockets/baileys": "^6.7.21",  // WhatsApp API
  "net-snmp": "^3.26.1",          // SNMP protocol
  "ssh2": "^1.15.0",              // SSH/Telnet
  "winston": "^3.8.2",            // Logging
  "pino": "^9.6.0",               // Logger alternative
  "node-telegram-bot-api": "^0.66.0",  // Telegram bot
  "qrcode": "^1.5.4",             // QR code generation
  "routeros-client": "^1.1.1",    // MikroTik API
  "jimp": "^1.6.1",               // Image manipulation
  "jsqr": "^1.4.0",               // QR code reading
  "@zxing/library": "^0.21.3",    // Barcode library
  "qrcode-terminal": "^0.12.0",   // Terminal QR display
  "xlsx": "^0.20.1"               // Excel parsing
}
```

### 10.2 Dev Dependencies
```json
{
  "nodemon": "^3.1.14"            // Auto-restart on file change
}
```

### 10.3 Version Constraints
- **Node.js:** ≥20.0.0 (modern features)
- **NPM:** ≥9.0.0 (recommended)
- **Overrides:** Specific fixed versions untuk security patches

---

## 11. OPERATIONAL REQUIREMENTS

### 11.1 Prerequisites
- ✅ Node.js 20+
- ✅ Linux/Ubuntu, Armbian, Windows, atau macOS
- ✅ Network access ke: GenieACS, MikroTik, OLT, Internet (untuk CDN/gateways)
- ✅ Port availability: 3001 (configurable)

### 11.2 Installation
```bash
git clone https://github.com/alijayanet/billing-rtrw.git
cd billing-rtrw
cp env-example.txt .env
npm install
```

### 11.3 Running Aplikasi

**Development:**
```bash
npm run dev
```

**Production (Manual):**
```bash
npm start
```

**Production (PM2 - Recommended):**
```bash
npm install -g pm2
pm2 start app-customer.js --name billing-rtrw
pm2 startup
pm2 save
```

### 11.4 Database Migration
Jika error "no such column: hotspot_username":

**Opsi 1 (Auto-fix):**
```bash
bash scripts/fix-database.sh
```

**Opsi 2 (Manual verify):**
```bash
node scripts/verify-database.js
```

### 11.5 Backup Execution
**Auto-backup (jika enabled):**
```json
{
  "auto_backup_enabled": true
}
```

**Manual backup:**
- Via Admin Panel → Backup → Create
- Atau: `POST /api/backup/create`

---

## 12. MONITORING & TROUBLESHOOTING

### 12.1 Health Check
- **Endpoint:** `GET /health` (public)
- **Response:** `{ status: 'ok', timestamp, database, services }`

### 12.2 Logging
- **Log files:** Konfigurasi via Winston/Pino
- **Location:** `logs/` directory (opsional)
- **Level:** info, warn, error
- **Console output:** Development mode

### 12.3 Common Issues & Solutions

**Issue: Aplikasi crash saat startup**
- Solusi 1: Cek `settings.json` valid JSON
- Solusi 2: Database corrupted → Hapus `database/billing.db`, restart
- Solusi 3: Port 3001 sudah digunakan → Ganti di `settings.json`

**Issue: Database locked error**
- Solusi: SQLite WAL mode conflict → Restart aplikasi
- Atau: Hapus `database/billing.db-shm` dan `database/billing.db-wal`

**Issue: GenieACS connection failed**
- Solusi: Cek URL di `settings.json`
- Verifikasi: `POST /api/settings/test-genieacs`

**Issue: MikroTik tidak terhubung**
- Solusi: Cek kredensial & API port (default 8728)
- Verifikasi: `POST /api/settings/test-mikrotik`

**Issue: WhatsApp tidak terkoneksi**
- Solusi: Login ulang via QR code
- Admin Panel → WhatsApp → Logout → Auth again

**Issue: Payment gateway error**
- Solusi: Cek API key & secret
- Verifikasi: `POST /api/settings/test-[gateway]`

---

## 13. PRODUCTION CHECKLIST

### 13.1 Pre-Deployment

**Security:**
- ✅ Ganti `session_secret` dengan random string 32+ char
- ✅ Ganti `admin_password` dengan password kuat
- ✅ Ganti `admin_api_key` dengan API key random
- ✅ Implementasi bcrypt untuk password hashing
- ✅ Enable HTTPS (reverse proxy: nginx)
- ✅ Setup firewall rules
- ✅ Restrict access ke admin panel (/admin)
- ✅ Remove debug logging pada production

**Configuration:**
- ✅ Set `NODE_ENV=production`
- ✅ Konfigurasi semua payment gateways
- ✅ Setup WhatsApp authentication
- ✅ Setup backup folder (auto-backup enabled)
- ✅ Configure timezone sesuai lokasi
- ✅ Setup OLT & GenieACS credentials

**Database:**
- ✅ Run full database verification
- ✅ Setup automated backup (cron job)
- ✅ Test restore backup process
- ✅ Monitor database size

**Monitoring:**
- ✅ Setup error logging & alerts
- ✅ Setup uptime monitoring (healthcheck)
- ✅ Setup database backup verification
- ✅ Setup audit trail cleanup (cron)

### 13.2 Post-Deployment

**Verification:**
- ✅ Test semua portal (customer, admin, tech, agent, collector)
- ✅ Test billing generation
- ✅ Test payment webhook
- ✅ Test WhatsApp notification
- ✅ Test MikroTik integration
- ✅ Test GenieACS/ONU management
- ✅ Test backup & restore

**Monitoring:**
- ✅ Monitor error logs untuk first 24 hours
- ✅ Monitor database growth
- ✅ Monitor CPU/RAM usage
- ✅ Monitor connectivity to external services

---

## 14. PERFORMANCE OPTIMIZATION

### 14.1 Already Implemented
- ✅ Lazy loading CSS & Bootstrap Icons
- ✅ Parallel database queries
- ✅ Service Worker caching
- ✅ Hotspot users cache (15 seconds)
- ✅ Settings cache (in-memory)
- ✅ Database indexes (better-sqlite3 auto-indexes)

### 14.2 Recommendations
- ⚠️ Setup Redis untuk session store (replace memory store)
- ⚠️ Enable database query caching
- ⚠️ Implement CDN untuk static assets
- ⚠️ Setup load balancing (PM2 cluster mode atau nginx upstream)
- ⚠️ Optimize large dataset queries dengan pagination
- ⚠️ Monitor & cleanup old audit trails regularly

---

## 15. FILE SIZE & STATISTICS

### 15.1 Codebase Statistics
- **Total Template Files:** 78 EJS files
- **Total Service Files:** 27 service modules
- **Total Route Files:** 12 router modules
- **Configuration Files:** 10 config modules
- **Database File Size:** ~5-50 MB (depends on data volume)

### 15.2 Directory Sizes (approximate)
```
views/              ~500 KB (78 EJS templates)
public/             ~1-2 MB (static assets)
database/           ~5-50 MB (SQLite + WAL)
node_modules/       ~200-300 MB (dependencies)
scripts/            ~50 KB (utility scripts)
```

---

## 16. DOKUMENTASI & RESOURCES

### 16.1 Official Resources
- GitHub: https://github.com/alijayanet/billing-rtrw
- License: ISC
- Author: Ali Jaya Net (081947215703)

### 16.2 Key Documentation Files
- `README.md` - Overview fitur & instalasi
- `OLT_OID_REFERENCE.md` - OLT SNMP OID reference
- `env-example.txt` - Environment variables example
- `scripts/fix-database.sh` - Database migration helper

### 16.3 Configuration Examples
- `settings.json` - Main configuration (DOCUMENTED above)
- `package.json` - Dependencies & scripts

---

## 17. FITUR LANJUTAN & INTEGRASI

### 17.1 TR-069 Built-in ACS (Lightweight)
**Keuntungan:**
- Tanpa GenieACS eksternal yang mahal
- Berjalan di process yang sama dengan aplikasi billing
- Lightweight: hanya ~50-100 MB RAM
- Kompatibel dengan berbagai brand ONU

**Setup ONU:**
```
ACS URL: http://[IP-SERVER]:3001/acs
Periodic Inform: 300-600 detik
```

### 17.2 Multi-language Support
- Indonesian (id) - Primary
- English (en) - Secondary
- Extensible untuk bahasa lain

### 17.3 PWA (Progressive Web App)
- Service Worker: `public/sw.js`
- Manifest: `public/manifest.webmanifest`
- Offline support (limited)
- Installable pada mobile

### 17.4 Advanced Payment Integration
- Multiple gateway failover
- Webhook signature verification
- Auto-settlement on payment received
- Manual payment entry untuk offline/bank transfer

### 17.5 GIS & Location Services
- Real-time customer location
- Technician GPS tracking
- Route optimization (Google Maps integration)
- Distance-based metrics

---

## 18. KESIMPULAN AUDIT

### 18.1 Status Kesehatan Aplikasi
✅ **PRODUCTION-READY** dengan catatan:

### 18.2 Kekuatan Sistem
1. ✅ Comprehensive feature set (billing → network management)
2. ✅ Multi-portal architecture (flexibility per role)
3. ✅ Robust integration ecosystem (MikroTik, GenieACS, OLT, payment)
4. ✅ Lightweight & efficient (SQLite, no external dependencies)
5. ✅ Good code organization (services, routes, middleware pattern)
6. ✅ Automation via cron jobs (billing, isolir, reminders)
7. ✅ Internationalization support (i18n ready)

### 18.3 Areas for Improvement
1. ⚠️ **Security hardening:**
   - Implement bcrypt untuk password storage
   - Add rate limiting
   - Enhance CORS configuration
   - JWT-based API authentication

2. ⚠️ **Performance optimization:**
   - Redis untuk session store
   - Database query caching
   - CDN untuk static assets
   - Load balancing setup

3. ⚠️ **Testing coverage:**
   - Unit tests (services)
   - Integration tests (routes)
   - API tests (endpoints)

4. ⚠️ **Documentation:**
   - API documentation (Swagger/OpenAPI)
   - Database schema documentation
   - Deployment guide (Docker, K8s)

5. ⚠️ **Code quality:**
   - ESLint configuration
   - Code style guidelines
   - Input validation framework

### 18.4 Rekomendasi Immediate Actions
1. ✅ DONE: Generate audit documentation (file ini)
2. ⏳ NEXT: Backup aplikasi & database
3. ⏳ NEXT: Test semua fitur di staging environment
4. ⏳ NEXT: Setup monitoring & alerting
5. ⏳ NEXT: Create runbook operasional

### 18.5 Long-term Roadmap
- [ ] Modernize dengan TypeScript
- [ ] Add comprehensive testing suite
- [ ] Containerize dengan Docker
- [ ] Setup CI/CD pipeline
- [ ] Add API documentation (Swagger)
- [ ] Enhance security (OAuth2, JWT)
- [ ] Performance monitoring (APM)

---

**Audit Date:** Juni 2026  
**Audit Status:** ✅ COMPLETE  
**Document Version:** 1.0  
**Last Updated:** 2026-06-19

**Jangan lupa:** Simpan backup dokumentasi ini di lokasi aman!

