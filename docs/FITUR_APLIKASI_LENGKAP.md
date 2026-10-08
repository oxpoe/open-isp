# DOKUMENTASI FITUR APLIKASI - RTRWNET BILLING & MANAGEMENT SYSTEM
**Status:** ✅ COMPREHENSIVE FEATURE DOCUMENTATION  
**Tanggal:** 14 Agustus 2026  
**Tujuan:** Complete reference for all built-in features & functionality

---

## 📑 DAFTAR ISI

1. [Overview Sistem](#overview-sistem)
2. [Portal & Akses](#portal--akses)
3. [Fitur Billing & Invoicing](#fitur-billing--invoicing)
4. [Fitur Manajemen Pelanggan](#fitur-manajemen-pelanggan)
5. [Fitur MikroTik Integration](#fitur-mikrotik-integration)
6. [Fitur GenieACS & TR-069](#fitur-genieacs--tr-069)
7. [Fitur OLT & ONU Management](#fitur-olt--onu-management)
8. [Fitur Payment Gateway](#fitur-payment-gateway)
9. [Fitur GIS & Mapping](#fitur-gis--mapping)
10. [Fitur WhatsApp & Telegram](#fitur-whatsapp--telegram)
11. [Fitur Inventory & Logistics](#fitur-inventory--logistics)
12. [Fitur Ticketing & Support](#fitur-ticketing--support)
13. [Fitur Agent & Sales](#fitur-agent--sales)
14. [Fitur Monitoring & Health](#fitur-monitoring--health)
15. [Fitur Automation & Cron](#fitur-automation--cron)
16. [Fitur Internal User Management](#fitur-internal-user-management)

---

## 📊 OVERVIEW SISTEM

### Informasi Dasar
- **Nama:** RTRWNET Management & Billing System
- **Versi:** 1.0.0
- **Runtime:** Node.js ≥20.0.0
- **Database:** SQLite (better-sqlite3)
- **Main File:** `app-customer.js`
- **Port Default:** 3001 (dapat diubah di settings.json)
- **License:** Terbuka (lihat LICENSE file)

### Target User
1. **Admin/Manajemen ISP** - Pengelola bisnis & konfigurasi sistem
2. **Teknisi Lapangan** - Support & maintenance perangkat pelanggan
3. **Operator Billing** - Penagihan & administrasi keuangan
4. **Agent/Mitra Penjualan** - Penjualan paket & pembayaran
5. **Pelanggan** - Portal self-service
6. **Kolektor** - Approval pembayaran tertangguh

### Tech Stack Utama
```javascript
- Express.js 4.18.2        // Web framework
- SQLite (better-sqlite3)  // Database ringan & reliable
- EJS 3.1.10              // Template engine
- Bootstrap 5              // CSS framework
- Leaflet                  // Map/GIS
- Baileys 6.7.21          // WhatsApp unofficial
- node-routeros-client    // MikroTik API
- net-snmp                // OLT SNMP
- Axios                   // HTTP client
- node-cron              // Task scheduling
```

---

## 🚪 PORTAL & AKSES

### 1. Portal Pelanggan (Public/Private)
**URL:** `http://localhost:3001/customer`

**Sub-Fitur:**
- ✅ Login/Registrasi (dengan opsi OTP)
- ✅ Dashboard - ringkasan tagihan & status
- ✅ Cek tagihan (tanpa login via `/customer/check-billing`)
- ✅ Riwayat invoice & pembayaran
- ✅ Grafik traffic PPPoE real-time
- ✅ Ubah SSID/Password Wi-Fi
- ✅ Reboot CPE/ONU
- ✅ Beli voucher hotspot
- ✅ Buat tiket support
- ✅ Profil & setting pribadi

**Authentication:** Session-based + OTP optional

**Views:**
```
views/customer/
├── dashboard.ejs          // Halaman utama
├── billing.ejs           // Riwayat tagihan
├── topup.ejs            // Pembayaran online
├── register.ejs         // Registrasi
├── device.ejs           // Manajemen Wi-Fi
├── ppob.ejs            // Pembelian voucher
├── tickets.ejs         // Support tickets
```

---

### 2. Portal Admin
**URL:** `http://localhost:3001/admin`

**Sub-Fitur:**
- ✅ Dashboard - statistik & ringkasan
- ✅ Manajemen pelanggan (CRUD)
- ✅ Manajemen paket & harga
- ✅ Billing & invoice generation
- ✅ MikroTik configuration & monitoring
- ✅ GenieACS device management
- ✅ OLT/ONU management
- ✅ Peta jaringan (GIS) dengan Leaflet
- ✅ Whatsapp administration
- ✅ Manajemen agent/agen
- ✅ Laporan keuangan
- ✅ Inventory management
- ✅ Settings & configuration
- ✅ Audit trail & logs
- ✅ Backup & restore
- ✅ Multi-language support

**Authentication:** Session admin-only

**Main Routes:**
```
/admin/login              → Admin login
/admin                    → Dashboard
/admin/customers         → Manajemen pelanggan
/admin/packages          → Paket layanan
/admin/invoices          → Tagihan
/admin/mikrotik          → MikroTik tools
/admin/genieacs          → Device management
/admin/olts              → OLT management
/admin/map               → Peta jaringan
/admin/whatsapp          → WhatsApp config
/admin/agents            → Manajemen agen
/admin/reports           → Laporan
/admin/inventory         → Gudang
/admin/settings          → Pengaturan
```

---

### 3. Portal Teknisi (Field Support)
**URL:** `http://localhost:3001/tech`

**Sub-Fitur:**
- ✅ Dashboard teknis
- ✅ Pool tiket (ticket queue)
- ✅ Peta lokasi pelanggan & ODP
- ✅ Chat WhatsApp integration
- ✅ GPS tracking teknisi
- ✅ Input pelanggan baru (lapangan)
- ✅ Device monitoring (GenieACS)
- ✅ Performance monitoring (CPU, RAM, disk)
- ✅ Riwayat tiket & penanganan

**Authentication:** Session tech-only

**Features:**
```
/tech/                   → Dashboard
/tech/tickets            → Daftar tiket
/tech/tickets/:id        → Detail tiket
/tech/map                → Peta jaringan
/tech/devices/:id        → Detail device
/tech/monitoring         → System monitoring
```

---

### 4. Portal Agen (Agent/Sales)
**URL:** `http://localhost:3001/agent`

**Sub-Fitur:**
- ✅ Login & dashboard
- ✅ Pembayaran tagihan pelanggan (dari saldo agen)
- ✅ Pembelian voucher hotspot
- ✅ Penjualan pulsa & data (Digiflazz)
- ✅ Cetak struk transaksi
- ✅ Riwayat & laporan transaksi
- ✅ Manajemen saldo

**Authentication:** Session agent-only

**Payment Methods:**
- Direct payment dari saldo agen
- E-voucher purchase
- Digital product (pulsa, data, dll via Digiflazz)

---

### 5. Portal Kolektor (Payment Collector)
**URL:** `http://localhost:3001/collector`

**Sub-Fitur:**
- ✅ Login & dashboard
- ✅ Cek tagihan pelanggan per area
- ✅ Buat pengajuan pembayaran
- ✅ Riwayat pengajuan
- ✅ Approval workflow

**Authentication:** Session collector-only

**Workflow:**
```
1. Kolektor cek tagihan pelanggan
2. Kolektor buat pengajuan pembayaran
3. Admin/Kasir approve pengajuan
4. Sistem catat pembayaran
5. Pelanggan dapat notifikasi via WhatsApp
```

---

### 6. Portal Finance (Keuangan)
**URL:** `http://localhost:3001/finance`

**Sub-Fitur:**
- ✅ Laporan pendapatan
- ✅ Kategori pengeluaran
- ✅ Entry pengeluaran operasional
- ✅ Cash in/out tracking
- ✅ Financial dashboard
- ✅ Export laporan

**Authentication:** Admin-only access

---

### 7. Portal Public (Publik)
**Tanpa Login:**
- ✅ Cek tagihan tanpa login: `/customer/check-billing`
- ✅ Halaman status isolated: `/isolated`
- ✅ QRIS static payment: `/qris/static.ejs`
- ✅ Public voucher info: `/public/voucher`
- ✅ TOS/Privacy/About/Contact pages

---

## 💰 FITUR BILLING & INVOICING

### 1. Invoice Generation

**Jenis Billing:**
- ✅ Bulanan otomatis (automatic monthly billing)
- ✅ Per pelanggan (single customer)
- ✅ Massal (bulk billing)
- ✅ Prorata (untuk bulan pertama)

**Komponen Invoice:**
```javascript
{
  id: number,
  customer_id: number,
  period_month: number,      // 1-12
  period_year: number,        // 2026
  amount: number,             // Total tagihan
  status: 'unpaid'|'paid'|'cancelled',
  qris_amount_unique: number, // QRIS nominal unik
  notes: string,              // Promo & prorata info
  created_at: datetime,
  due_date: datetime,
  paid_at: datetime,
  payment_method: string      // 'admin', 'agent', 'tripay', dll
}
```

**Fitur Promo & Prorata:**
```
Promo:
- Paket bisa set harga promo untuk N siklus pertama
- Setiap pelanggan track promo_cycles_used
- Promo berakhir → kembali ke harga normal

Prorata:
- Jika tanggal pasang (install_date) = bulan tagihan
- Invoice pertama dihitung per hari (proporsi bulan)
- Otomatis di-apply berdasarkan paket setting
```

**Contoh Workflow:**
```
1. Admin generate invoice untuk periode 08/2026
2. Sistem hitung nominal per pelanggan:
   - Status promo? → gunakan promo_price
   - Paket punya FUP? → cek kuota bulanan
   - Bulan pertama & prorata aktif? → hitung prorata
3. Invoice di-create dengan status 'unpaid'
4. Notifikasi WhatsApp ke pelanggan
5. Pelanggan bayar (online atau manual)
6. Sistem update status menjadi 'paid'
7. Notifikasi paid ke pelanggan
8. Isolir otomatis jika lewat due date
```

---

### 2. Payment Gateway Integration

**Gateway Terintegasi:**
```javascript
1. Midtrans (Snap API)
   - Status: Aktif/Nonaktif di settings
   - Fitur: Multiple payment methods (CC, transfer, GCash, etc)

2. Tripay
   - Status: Aktif/Nonaktif
   - Fitur: Bank transfer, E-wallet, QRIS

3. Xendit
   - Status: Aktif/Nonaktif
   - Fitur: Invoice, VA, QR codes

4. Duitku
   - Status: Aktif/Nonaktif
   - Fitur: Aggregator pembayaran

5. QRIS Static (Built-in)
   - QR code fixed untuk donasi/pembayaran unik
   - Nominal unik auto-assign per invoice
   - Mudah match payment dari notifikasi bank
```

**Payment Flow:**
```
Customer → Choose Payment Method
         → Redirect to Gateway
         → Process Payment
         → Gateway Webhook/Callback
         → Mark Invoice as PAID
         → Send WhatsApp confirmation
```

**Webhook Payment Generic:**
```
Endpoint: POST /api/webhook/v1/payment-notif
Fitur:
- Generic webhook untuk bank/e-wallet notification
- Auto-match nominal dengan invoice
- Auto-mark paid jika cocok
- Log semua webhook untuk audit
- Manual cleanup jika perlu
```

---

### 3. Pembayaran Manual & Offline

**Tipe Pembayaran Manual:**
```javascript
1. Admin bayar (dari panel)
   - Pilih invoice
   - Catat nominal pembayaran
   - Catat metode pembayaran
   - Mark as paid
   - Otomatis kirim notifikasi WhatsApp

2. Agent bayar (dari saldo agen)
   - Agent login
   - Pilih pelanggan
   - Cek tagihan
   - Bayar dari saldo agen
   - Struk otomatis print/download

3. Kolektor ajukan (pending approval)
   - Kolektor input pembayaran
   - Pending approval (admin/kasir)
   - Approval → mark as paid
   - Rejection → return ke pending

4. Kasir bayar (kasir portal)
   - Kasir login
   - Input pembayaran
   - Mark paid
   - Print bukti
```

---

### 4. Invoice Management

**Fitur:**
```
- ✅ Lihat daftar invoice (admin/customer)
- ✅ Cetak invoice (PDF via pdfKit)
- ✅ Export invoice list (CSV/Excel)
- ✅ Batalkan pembayaran (unpay) - jika ada kesalahan
- ✅ Reschedule due date
- ✅ Bulk action (multiple invoices)
- ✅ Invoice status tracking
- ✅ Payment reminder via WhatsApp
```

**Invoice Status Flow:**
```
unpaid → (payment received) → paid
      ↓
    cancelled (oleh admin)

Isolir status linked ke unpaid invoices
Auto-isolir trigger jika lewat due date
```

---

## 👥 FITUR MANAJEMEN PELANGGAN

### 1. CRUD Pelanggan

**Data Pelanggan:**
```javascript
{
  id: number,
  name: string,                    // Nama pelanggan
  phone: string,                   // Nomor HP
  email: string,                   // Email
  address: string,                 // Alamat fisik
  latitude: float,                 // Koordinat GPS
  longitude: float,
  
  // Network
  package_id: number,              // Paket yang digunakan
  router_id: number,               // MikroTik router
  pppoe_username: string,          // Username PPPoE
  pppoe_secret: string,            // Password PPPoE
  hotspot_username: string,        // Username hotspot
  static_ip: string,               // IP statis (jika ada)
  
  // Device
  olt_id: number,                  // OLT yang digunakan
  onu_port: number,               // Port ONU
  genieacs_tag: string,           // Tag di GenieACS
  
  // Location
  odp_id: number,                 // ODP terdekat
  area: string,                   // Area/kabupaten
  
  // Status & Billing
  status: 'active'|'suspended'|'inactive',
  install_date: date,             // Tanggal pasang
  isolate_day: number,            // Tanggal isolir otomatis (1-31)
  auto_isolate: boolean,          // Enable isolir otomatis
  
  // Promo
  promo_cycles_used: number,      // Berapa siklus promo sudah dipakai
  
  // Other
  nik: string,                    // No ID pelanggan
  notes: string,                  // Catatan
  created_at: datetime,
  updated_at: datetime
}
```

**Operasi:**
```
- ✅ Tambah pelanggan baru
- ✅ Edit data pelanggan
- ✅ Hapus pelanggan (soft delete)
- ✅ Import pelanggan dari Excel
- ✅ Export pelanggan list
- ✅ Bulk action (status change, package change, dll)
- ✅ Search & filter (by name, phone, area, status)
```

---

### 2. Isolir / Suspend Customer

**Isolir Manual:**
```
Admin klik "Isolir" di halaman pelanggan
  ↓
Sistem suspend ke MikroTik:
  - PPPoE: hapus user atau disable
  - Hotspot: suspend user
  - Static IP: redirect ke "Isolated" page
  ↓
Status pelanggan: 'suspended'
  ↓
Pelanggan kembali online setelah bayar + admin buka isolir
```

**Isolir Otomatis (Cron):**
```
Cron job berjalan setiap hari jam 2 pagi
  ↓
Cek semua pelanggan:
  - Status = 'active'
  - auto_isolate = true
  - Tanggal hari ini >= isolate_day
  - Ada unpaid invoices
  ↓
Trigger isolir otomatis
  ↓
Notifikasi WhatsApp ke pelanggan
```

**Buka Isolir (Unisolir):**
```
Admin klik "Buka Isolir" setelah pembayaran
  ↓
Sistem restore di MikroTik:
  - PPPoE: tambah kembali user atau enable
  - Hotspot: reactivate user
  ↓
Status pelanggan: 'active'
  ↓
Pelanggan bisa online lagi
  ↓
Notifikasi WhatsApp konfirmasi
```

---

### 3. Manajemen Paket Layanan

**Data Paket:**
```javascript
{
  id: number,
  name: string,                    // Nama paket (Starter, Pro, Premium)
  description: string,
  price: number,                   // Harga reguler per bulan
  promo_price: number,            // Harga promo (opsional)
  promo_cycles: number,           // N siklus pertama dapat promo
  
  // Speed
  speed_down: number,             // Download Mbps
  speed_up: number,               // Upload Mbps
  
  // FUP (Fair Usage Policy)
  use_fup: boolean,               // Enable FUP?
  fup_limit_gb: number,           // Limit data per bulan (GB)
  fup_profile_name: string,       // Profile MikroTik saat FUP
  
  // Night Mode (Jam Kalong)
  use_night_mode: boolean,        // Enable night mode?
  night_profile_name: string,     // Profile MikroTik malam (23:00-06:00)
  
  // Tax
  use_ppn: boolean,               // Charge PPN?
  ppn_percentage: number,         // % PPN (default 11%)
  
  // Prorata
  prorate_first_invoice: boolean, // Prorata invoice pertama?
  
  is_active: boolean,
  created_at: datetime
}
```

**Operasi:**
```
- ✅ Tambah paket
- ✅ Edit paket
- ✅ Hapus paket
- ✅ Set promo per paket
- ✅ Set night mode profile
- ✅ Set FUP limit & profile
```

---

## 🌐 FITUR MIKROTIK INTEGRATION

### 1. Koneksi & Konfigurasi

**Setup MikroTik:**
```
1. Admin setting:
   - Host: 192.168.8.1
   - Username: billing
   - Password: password123
   - Port: 8711
   
2. Di MikroTik router:
   - Enable API service
   - Create user 'billing' dengan permission
   - Whitelist IP aplikasi

3. Tes koneksi dari panel admin
```

**Multi-Router Support:**
```
- Aplikasi bisa kelola banyak MikroTik router
- Per pelanggan assign ke router mana
- Cron job sinkron ke router tersesuai
- Fallback ke default router jika tidak specify
```

---

### 2. PPPoE Management

**PPPoE User:**
```javascript
{
  username: string,           // PPPoE username
  secret: string,            // PPPoE password
  password_hashed: string,   // Disimpan via PPPoE protocol
  profile: string,           // Bandwidth profile
  disabled: boolean,
  created_at: datetime
}
```

**Operasi:**
```
- ✅ Create PPPoE user
- ✅ Change secret/password
- ✅ Disable/enable user
- ✅ View active sessions
- ✅ Monitor traffic (bytes in/out)
- ✅ Set speed profile
- ✅ Delete user
```

**Traffic Monitoring:**
```
Real-time:
- ✅ Monitor sesi PPPoE aktif
- ✅ Grafik traffic per session
- ✅ Bytes sent/received
- ✅ Session duration
- ✅ IP address

Historical:
- ✅ Store pemakaian per hari/bulan
- ✅ Aggregate data per customer
- ✅ Usage history dashboard
```

---

### 3. Hotspot Management

**Hotspot User:**
```javascript
{
  name: string,              // Hotspot username
  password: string,
  profile: string,          // Speed profile
  limit_uptime: number,     // Session time limit
  limit_bytes_total: number, // Data limit
  limit_bytes_down: number,  // Download limit
  limit_bytes_up: number,    // Upload limit
  disabled: boolean
}
```

**Fitur:**
```
- ✅ Create/edit hotspot user
- ✅ Active session monitoring
- ✅ View real-time data usage
- ✅ Disconnect session
- ✅ Set speed & data limits
```

---

### 4. Voucher Hotspot

**Voucher System:**
```
Workflow:
1. Admin create voucher batch
2. Sistem generate N kode voucher
3. Kode disimpan di database & MikroTik
4. Customer bisa gunakan di hotspot portal
5. Agent bisa jual voucher ke customer
6. Pelanggan bayar → dapat voucher code
```

**Voucher Batch:**
```javascript
{
  id: number,
  name: string,              // Nama batch
  quantity: number,          // Jumlah voucher
  profile_name: string,      // Speed profile
  validity: number,          // Hari berlaku
  price: number,            // Harga jual per voucher
  status: 'pending'|'created'|'synced',
  qty_created: number,      // Berapa sudah dibuat
  qty_failed: number,       // Berapa gagal
  created_at: datetime
}
```

**Fitur:**
```
- ✅ Generate batch voucher
- ✅ Sync ke MikroTik
- ✅ Print voucher code
- ✅ Export CSV
- ✅ Track status (created/active/used/expired)
- ✅ Delete batch
- ✅ Sell via agent portal
- ✅ Sell via customer portal
```

---

### 5. Firewall & Rate Limiting

**Built-in Firewall Setup:**
```
Admin bisa setup firewall rules:
- Rate limiting per user
- Block ports tertentu
- Whitelist IP
- Queue management
- Priority traffic (VoIP, dst)
```

---

### 6. Bandwidth Profile (Jam Kalong)

**Night Mode Automation:**
```
Setup:
- Paket A: default 10Mbps, night 20Mbps (more speed at night)
- Paket B: default 5Mbps, night 2Mbps (throttle at night)

Cron:
- 00:00 (midnight): Switch ke night profile
- 06:00 (pagi): Switch ke day profile

Fitur:
- ✅ Set profile per paket
- ✅ Custom time (tidak harus fixed 00:00-06:00)
- ✅ Override manual per user
- ✅ Log profile changes
```

---

### 7. Backup MikroTik

**Fitur:**
```
- ✅ Backup konfigurasi MikroTik dari panel
- ✅ Schedule backup otomatis
- ✅ Download backup file
- ✅ Restore dari backup
- ✅ Version history
```

---

## 🎛️ FITUR GENIEACS & TR-069

### 1. Built-in ACS (Auto Configuration Server)

Aplikasi memiliki ACS internal ringan untuk TR-069 tanpa perlu GenieACS eksternal.

**Keuntungan:**
```
✅ Lightweight - langsung di Node.js
✅ Tidak perlu MongoDB/Redis
✅ Hemat resource VPS
✅ Support banyak brand ONU (ZTE, Huawei, FiberHome, dll)
✅ Auto-detect device properties
✅ Provision WAN & VLAN otomatis
```

**Setting:**
```json
{
  "use_builtin_acs": true|false,
  "acs_port": 7547         // TR-069 port
}
```

---

### 2. ONU/CPE Management

**Device List:**
```javascript
{
  id: number,
  device_id: string,              // Identifier unik (MAC/Serial)
  manufacturer: string,           // Brand (ZTE, Huawei, dll)
  model: string,
  serial_number: string,
  firmware_version: string,
  
  // Customer Link
  customer_id: number,
  customer_name: string,
  customer_phone: string,
  
  // Status
  status: 'online'|'offline'|'error',
  last_contact: datetime,
  
  // Wi-Fi
  ssid: string,                   // Wi-Fi name
  password: string,              // Wi-Fi password
  
  // VLAN
  vlan_id: number,
  management_ip: string,
  
  created_at: datetime
}
```

---

### 3. Device Operations

**Fitur:**
```
- ✅ View device list (dengan search & filter)
- ✅ Device detail (parameter, status, logs)
- ✅ Change SSID / Password Wi-Fi
- ✅ Bulk SSID change (multiple devices sekaligus)
- ✅ Reboot device
- ✅ View device logs & history
- ✅ Parameter configuration
- ✅ Provision WAN (VLAN, bridge, etc)
```

**SSID Change Workflow:**
```
1. Admin/Tech buka device detail
2. Edit SSID & Password baru
3. Click "Update SSID"
4. Sistem send perintah via TR-069
5. Device update Wi-Fi config
6. Notifikasi customer via WhatsApp
7. Log activity di audit trail
```

---

### 4. GenieACS Integration (Optional)

Jika gunakan GenieACS eksternal:

**Konfigurasi:**
```json
{
  "genieacs_url": "http://192.168.8.189:7557",
  "genieacs_username": "admin",
  "genieacs_password": "admin",
  "genieacs_timeout": 30000,
  "genieacs_monitoring_enabled": true,
  "genieacs_monitoring_interval": 6,     // Jam
  "genieacs_rxpower_threshold": -27      // dBm
}
```

**Fitur:**
```
- ✅ Sync device dari GenieACS ke aplikasi
- ✅ View GenieACS parameters
- ✅ Kirim command (SSID, reboot, dll)
- ✅ Monitor RX power (signal strength)
- ✅ Alert jika signal lemah
- ✅ Bulk operation
```

---

## 🔌 FITUR OLT & ONU MANAGEMENT

### 1. OLT Configuration

**OLT Data:**
```javascript
{
  id: number,
  name: string,              // Nama OLT (OLT-1, OLT-Jakarta, dll)
  host: string,             // IP address
  snmp_community: string,   // SNMP community string
  snmp_port: number,        // SNMP port (161)
  brand: string,            // Brand (HIOSO, ZTE, Huawei, dll)
  model: string,
  
  // Telnet (untuk konfigurasi WAN)
  telnet_host: string,
  telnet_port: number,
  telnet_username: string,
  telnet_password: string,
  telnet_enable_password: string,
  
  // Web interface
  web_url: string,
  web_username: string,
  web_password: string,
  
  // API (untuk ZTE C320)
  api_base_url: string,
  
  is_active: boolean,
  created_at: datetime
}
```

---

### 2. ONU Status & Monitoring

**ONU Info:**
```javascript
{
  olt_id: number,
  port: number,             // Port OLT (1-128 tergantung OLT)
  onu_index: number,
  
  // Hardware
  sn: string,               // Serial number
  model: string,
  firmware_version: string,
  mac_address: string,
  
  // Status
  status: 'online'|'offline'|'dying_gasp'|'error',
  admin_state: 'enable'|'disable',
  optical_signal: number,   // dBm
  
  // Customer link
  customer_id: number,
  customer_name: string,
  
  // Distance
  distance: number,         // KM to OLT
  
  // Last contact
  last_contact: datetime
}
```

---

### 3. ONU Operations

**Fitur:**
```
- ✅ View ONU list per port
- ✅ View ONU statistics (signal strength, status)
- ✅ Reboot ONU
- ✅ Rename ONU (friendly name)
- ✅ Authorize ONU (EPON)
- ✅ Configure WAN (VLAN, bridge, PPPoE)
- ✅ View ONU logs
- ✅ Bulk operation
```

**Configure WAN Methods:**
```
1. Telnet (OMCI commands)
   - For ZTE, Huawei, FiberHome
   - Direksi jalankan commands Telnet

2. TR-069 (GenieACS)
   - If GenieACS configured
   - Use parameter modification

3. REST API (go-api-c320)
   - For ZTE C320 specifically
   - Direct API call to OLT

4. Web Interface
   - Manual via OLT web UI
   - Backup method jika automation gagal
```

---

### 4. OLT Port Management

**Port Info:**
```javascript
{
  olt_id: number,
  port_number: number,      // 1-N
  port_type: 'EPON'|'GPON'|'hybrid',
  
  // Capacity
  total_onus: number,       // Max ONU di port ini
  active_onus: number,      // ONU yang online
  
  // Status
  status: 'up'|'down'|'error',
  admin_state: 'enable'|'disable',
  
  // Statistics
  bytes_rx: number,
  bytes_tx: number,
  packets_rx: number,
  packets_tx: number,
  errors: number,
  
  // Monitoring
  optical_power: number,
  temperature: number
}
```

---

## 💳 FITUR PAYMENT GATEWAY

### 1. Multi-Gateway Architecture

**Supported Gateways:**
```
1. Midtrans (Snap API)
   Status: Enable/Disable di settings
   Methods: CC, Transfer, GCash, Gopay, OVO, Dana
   
2. Tripay
   Status: Enable/Disable
   Methods: Bank Transfer, Ewallet, QRIS
   
3. Xendit
   Status: Enable/Disable
   Methods: Virtual Account, QR, Invoice
   
4. Duitku
   Status: Enable/Disable
   Methods: Aggregator pembayaran
   
5. QRIS Static (Built-in)
   Status: Always available
   Methods: QR Code fixed
```

---

### 2. Payment Integration Flow

**Customer Bayar Invoice:**
```
1. Customer lihat invoice di portal
2. Click "Bayar"
3. Pilih payment method dari gateway aktif
4. Redirect ke payment gateway
5. Customer input data pembayaran
6. Gateway proses pembayaran
7. Success/Failure notification
8. Aplikasi terima webhook dari gateway
9. Verify payment amount & signature
10. Mark invoice as PAID (jika success)
11. Send WhatsApp confirmation
12. Customer notif pembayaran berhasil
```

---

### 3. Payment Verification

**Verification Process:**
```javascript
function verifyPayment(invoice, payment) {
  // 1. Check nominal cocok
  if (payment.amount !== invoice.amount) {
    return false;
  }
  
  // 2. Check signature (tergantung gateway)
  const signature = crypto.createHmac('sha256', secretKey)
    .update(payment.order_id + payment.amount)
    .digest('hex');
  if (signature !== payment.signature) {
    return false;
  }
  
  // 3. Check status (sudah dibayar di gateway)
  if (payment.status !== 'success' && payment.status !== 'paid') {
    return false;
  }
  
  // 4. Check duplikasi (jangan bayar 2x)
  const existing = findPaymentByExternalId(payment.gateway_id);
  if (existing) {
    return false;
  }
  
  return true;
}
```

---

### 4. Webhook Handling

**Generic Webhook:**
```
Endpoint: POST /api/webhook/v1/payment-notif
Header: Authorization: Bearer MY_WEBHOOK_SECRET

Fitur:
- ✅ Accept webhook dari bank/e-wallet apapun
- ✅ Parse notifikasi pembayaran
- ✅ Match nominal dengan invoice/voucher
- ✅ Auto-mark paid jika cocok
- ✅ Log semua webhook (audit trail)
- ✅ Manual review & cleanup di admin
```

**Webhook Log:**
```javascript
{
  id: number,
  service: string,           // "bank_abc", "ewallet_xyz"
  content: string,          // Raw webhook content
  parsed_amount: number,    // Parsed dari notifikasi
  parsed_ok: boolean,       // Berhasil di-parse?
  matched_invoice: number,  // Invoice ID yang matched
  matched_voucher: number,  // Voucher ID yang matched
  ip: string,              // Source IP
  user_agent: string,
  created_at: datetime,
  status: 'pending'|'processed'|'error'
}
```

---

### 5. Payment Report

**Fitur:**
```
- ✅ Daily transaction report
- ✅ Gateway settlement report
- ✅ Payment method breakdown
- ✅ Failed payment report
- ✅ Refund tracking
- ✅ Revenue trending
```

---

## 🗺️ FITUR GIS & MAPPING

### 1. Peta Admin (`/admin/map`)

**Fitur Dasar:**
```
- ✅ Leaflet map dengan OpenStreetMap
- ✅ Hybrid view (satellite + road)
- ✅ Zoom in/out
- ✅ Locate kantor (center point dari office_lat/office_lng)
```

**Marker & Layer:**
```
1. Customer Marker
   - Merah: offline/suspended
   - Hijau: online
   - Biru: pending
   - Click → popup detail customer
   
2. ODP Marker
   - Orange icon
   - Click → ODP info & available ports
   
3. Cable Path (Polyline)
   - Garis dari customer ke ODP
   - Bisa edit/draw manually
   - Simpan rute untuk setiap customer
```

**Popup Info:**
```
Customer Popup:
- Name, phone, email
- Paket, status, speed
- IP address (PPPoE/hotspot)
- Unpaid invoices count
- Traffic graph (PPPoE real-time)
- Action buttons: isolir, edit, view detail

ODP Popup:
- ODP name
- Available ports
- Customers connected
- Port status summary
```

**Interactive Fitur:**
```
- ✅ Draw cable path (customer to ODP)
- ✅ Save cable route
- ✅ Edit customer location (via location picker)
- ✅ Bulk action dari peta (select multiple customers)
- ✅ Real-time PPPoE traffic graph
```

---

### 2. Peta Teknisi (`/tech/map`)

**Fitur:**
```
- ✅ Sama seperti admin map (read-only untuk tech)
- ✅ View customer & ODP locations
- ✅ Click customer → show WhatsApp chat button
- ✅ Open route di Google Maps
- ✅ GPS tracking teknisi (optional)
- ✅ Nearby customers (dalam radius tertentu)
```

**Tech GPS Tracking:**
```
Setting:
- Aktifkan attendance_geofencing di settings
- Radius perimeter kantor (attendance_radius meter)

Fitur:
- Tech login di mobile portal
- Sistem track GPS lokasi tech
- Visualisasi di peta
- Geofence alert (keluar/masuk area)
```

---

### 3. Location Picker (Form Customer)

**Fitur:**
```
- ✅ Modal dengan peta satellite view
- ✅ Click di peta → set customer location
- ✅ Drag marker untuk adjust posisi
- ✅ Coordinate display (lat/lng)
- ✅ Address lookup (reverse geocoding jika ada)
- ✅ Done → save ke form
```

---

### 4. Cable Path Management

**Data:**
```javascript
{
  customer_id: number,
  olt_id: number,
  odp_id: number,
  
  // Polyline coordinates
  path: [                    // Array of [lat, lng]
    [-6.2521, 107.9205],
    [-6.2522, 107.9206],
    [-6.2523, 107.9207]
  ],
  
  length_km: number,        // Calculated distance
  description: string,      // Cable detail (aerial/underground, etc)
  
  created_at: datetime,
  updated_at: datetime
}
```

**Operasi:**
```
- ✅ Draw path (click-click di peta)
- ✅ Edit existing path
- ✅ Delete path
- ✅ Calculate distance automatically
- ✅ Save to database
```

---

## 💬 FITUR WHATSAPP & TELEGRAM

### 1. WhatsApp Integration (Baileys)

**Setup:**
```
Setting di settings.json:
{
  "whatsapp_enabled": true,
  "whatsapp_auth_folder": "auth_info_baileys",
  "whatsapp_admin_numbers": ["081947215703", "087820851413"],
  "company_phone": "6287820851413"
}
```

**Authentication:**
```
1. Admin login ke /admin/whatsapp
2. Sistem tampilkan QR code
3. Scan QR code dengan WhatsApp app
4. Verifikasi di WhatsApp
5. Bot siap mengirim pesan
```

---

### 2. WhatsApp Features

**Incoming Message Handler:**
```
Admin/authorized nomor bisa kirim command:

1. BILLING
   - List unpaid invoices
   - Customer status
   - Payment info
   
2. MIKROTIK
   - Active users
   - Session info
   - Bandwidth status
   
3. PULSA (Digiflazz)
   - Check balance
   - Buy pulsa
   - Transaction status
   
4. TOPUP AGENT
   - Top-up saldo agent
   - Check agent balance
```

**Incoming Command Examples:**
```
From admin:
"billing" → Kirim laporan billing hari ini

"pppoe" → List active PPPoE sessions

"balance" → Cek saldo Digiflazz

"topup 1000000" → Top-up agen Rp 1jt

"saldo" → Cek saldo agent
```

---

### 3. WhatsApp Automated Messages

**Invoice Notification:**
```
When:
- Invoice created (otomatis kirim ke customer)
- Invoice paid (kirim konfirmasi)
- Invoice due (reminder H-1 isolir)

Content:
"Tagihan Internet RTRWnet
Periode: Agustus 2026
Nominal: Rp 350.000
Due: 10 Agustus 2026

Bayar di: [link portal]

Isolir jika belum bayar: 10 Agustus 2026"
```

**Payment Confirmation:**
```
When: Invoice marked as paid

Content:
"✅ Pembayaran Anda diterima!

Tagihan: Rp 350.000
Tanggal: 05 Agustus 2026
Status: LUNAS

Terima kasih atas pembayaran Anda.
Layanan Anda tetap aktif.

- RTRWnet Admin"
```

**Isolir Notice:**
```
When: Isolir automatic atau manual

Content:
"⚠️ PEMBERITAHUAN ISOLIR

Layanan internet Anda telah diputus
Alasan: Tagihan belum dibayar

Tagihan: Rp 350.000
Due date: 10 Agustus 2026

Hubungi: [support number]

Buka isolir setelah pembayaran"
```

---

### 4. WhatsApp Broadcast

**Fitur:**
```
- ✅ Select customer list
- ✅ Create message (dengan template variable)
- ✅ Schedule send time
- ✅ Set delay antar message (untuk hindari spam)
- ✅ View delivery status
- ✅ Pause/resume/stop broadcast
- ✅ Retry failed messages
```

**Broadcast Example:**
```
Template:
"Halo {{customer_name}},
Tagihan internet bulan ini sudah siap.
Nominal: {{amount_idr}}
Bayar di: {{payment_link}}"

Broadcast:
1. Select customers: Area Bekasi (200 customer)
2. Template: "Tagihan Bulanan"
3. Schedule: 09:00 (9 pagi)
4. Delay: 3 detik antar pesan
5. Total: 200 pesan dalam 10 menit
6. Status: Sent 198, Failed 2, Pending 0
```

---

### 5. WhatsApp Live Chat

**Fitur (Upcoming):**
```
- ✅ Inbox untuk semua chat masuk/keluar
- ✅ Reply message dari admin panel
- ✅ Chat history per customer
- ✅ Quick reply template
- ✅ Attachment support
```

---

### 6. Telegram Integration (Optional)

**Setup:**
```json
{
  "telegram_enabled": true|false,
  "telegram_bot_token": "xxx:yyy",
  "telegram_admin_id": "123456789"
}
```

**Fitur:**
```
- ✅ Bot untuk admin (same as WhatsApp commands)
- ✅ Alert notifications
- ✅ Daily report
- ✅ System monitoring
```

---

## 📦 FITUR INVENTORY & LOGISTICS

### 1. Inventory System

**Kategori Inventory:**
```
- Perangkat ONU/CPE (stock)
- Kabel & Connector
- Power Supply
- Accessories (splitter, dll)
- Tools & Equipment
```

**Item Data:**
```javascript
{
  id: number,
  category_id: number,
  name: string,             // Product name
  sku: string,             // SKU code
  description: string,
  unit: string,            // 'pcs', 'meter', 'kg', dll
  quantity: number,        // Current stock
  minimum_qty: number,     // Alert jika stock < ini
  unit_cost: number,       // Cost per unit
  supplier: string,
  location: string,        // Lokasi di gudang
  created_at: datetime
}
```

---

### 2. Inventory Operation

**Fitur:**
```
- ✅ Add item ke inventory
- ✅ Adjust stock (add/remove)
- ✅ Stock transfer
- ✅ Low stock alert
- ✅ Item history
- ✅ Search & filter
- ✅ Export inventory list
```

**Stock Alert:**
```
When stock < minimum_qty:
- Dashboard alert
- Email notification (jika ada)
- Request PO (Purchase Order)
```

---

### 3. Asset Tracking

**Asset Assignment:**
```
Teknisi bisa assign asset ke task:
- Ticket → use ONU
- Installation → use cable x10m
- Repair → use power supply 1pc
```

**Asset History:**
```
Track item dari stock → assignment → return
- What item used
- When used
- Who used
- For what task
- Status (used/returned/lost)
```

---

## 🎫 FITUR TICKETING & SUPPORT

### 1. Ticket System

**Ticket Data:**
```javascript
{
  id: number,
  
  // Customer & Technician
  customer_id: number,
  customer_name: string,
  customer_phone: string,
  customer_email: string,
  
  technician_id: number,
  technician_name: string,
  
  // Content
  subject: string,         // Judul keluhan
  message: string,         // Deskripsi masalah
  
  // Status
  status: 'open'|'in_progress'|'resolved'|'closed',
  
  // Details
  priority: 'low'|'medium'|'high'|'urgent',
  category: string,        // 'billing', 'technical', 'general'
  
  // Attachments
  customer_photos: string, // JSON array of file paths
  customer_photo_metadata: string, // Photo GPS/timestamp
  technician_photos: string,
  technician_notes: string,
  
  // Timeline
  created_at: datetime,
  updated_at: datetime,
  resolved_at: datetime
}
```

---

### 2. Ticket Workflow

**Open (Customer):**
```
1. Customer buka portal
2. Click "Buat Tiket"
3. Input subject, deskripsi, foto (optional)
4. Submit
5. Ticket created dengan status 'open'
6. Notifikasi ke admin & teknisi via WhatsApp
```

**Assign (Admin):**
```
1. Admin lihat daftar open tickets
2. Assign ke teknisi
3. Ticket status: 'open' → tidak berubah (tunggu teknisi accept)
```

**In Progress (Technician):**
```
1. Tech buka portal
2. Lihat pool tickets (assigned to tech)
3. Click "Ambil Tiket" (take ticket)
4. Ticket status: 'open' → 'in_progress'
5. Tech bisa input notes & foto
6. Status update ke customer via WhatsApp
```

**Resolve (Technician):**
```
1. Tech selesaikan pekerjaan
2. Input resolution notes
3. Upload foto (before/after)
4. Click "Selesai"
5. Ticket status: 'in_progress' → 'resolved'
6. Notifikasi ke customer
```

**Close (Customer/Admin):**
```
1. Customer lihat resolved ticket
2. Click "Tutup Tiket" (jika puas)
3. Ticket status: 'resolved' → 'closed'
4. Customer optional bisa rate 1-5
5. Feedback saved untuk quality control
```

---

### 3. Ticket Features

**Admin Panel:**
```
- ✅ Dashboard tickets (open, in_progress, resolved, closed)
- ✅ Assign tickets ke technician
- ✅ Reassign jika perlu
- ✅ View ticket history
- ✅ Add internal notes
- ✅ Override status
- ✅ Filter by status/category/tech
- ✅ Ticket aging report
- ✅ SLA tracking
```

**Tech Portal:**
```
- ✅ Pool tiket (tickets assigned to me)
- ✅ View ticket detail
- ✅ Take ticket
- ✅ Upload photos
- ✅ Add resolution notes
- ✅ Mark resolved
- ✅ View ticket history
```

**Customer Portal:**
```
- ✅ Create ticket
- ✅ View my tickets
- ✅ View ticket status
- ✅ Add comment/photo
- ✅ Mark resolved (jika tech bilang done)
- ✅ Rate satisfaction
- ✅ View ticket history
```

---

## 👔 FITUR AGENT & SALES

### 1. Agent Management

**Agent Data:**
```javascript
{
  id: number,
  username: string,         // Login username
  password_hash: string,   // Hashed password
  name: string,            // Agent name
  phone: string,
  email: string,
  area: string,            // Area operasi
  status: 'active'|'inactive',
  
  // Financial
  balance: number,         // Saldo agent (Rp)
  commission_percent: number, // Komisi %
  
  // Reference
  id_number: string,       // KTP/ID number
  bank_account: string,
  bank_name: string,
  
  created_at: datetime
}
```

---

### 2. Agent Portal

**Fitur:**
```
Dashboard:
- ✅ Total balance
- ✅ Today's transaction
- ✅ Commission earned
- ✅ Top customers

Pembayaran:
- ✅ Cari customer by name/phone
- ✅ Lihat unpaid invoices
- ✅ Pilih invoice → bayar dari saldo agent
- ✅ Print struk pembayaran
- ✅ Kirim struk ke customer (WhatsApp/Email)

Voucher:
- ✅ Lihat inventory voucher
- ✅ Pilih voucher untuk dijual
- ✅ Customer bayar → agent terima stok
- ✅ Print voucher code
- ✅ Track voucher sale

Digiflazz:
- ✅ Browse produk (pulsa, data, dll)
- ✅ Category → Brand → Nominal flow
- ✅ Buy produk (debit saldo agent)
- ✅ Manual input customer nomor
- ✅ Delivery otomatis
- ✅ Webhook status update
```

---

### 3. Admin Agent Management

**Fitur:**
```
- ✅ Add agent (create account)
- ✅ Edit agent (name, area, commission)
- ✅ Deactivate agent
- ✅ Top-up agent balance (from admin)
- ✅ View agent transaction history
- ✅ Set special price per agent
- ✅ View agent commission report
- ✅ Agent performance dashboard
```

**Top-up Agent:**
```
Admin:
1. Open agent list
2. Click "Top-up" pada agent
3. Input amount (Rp 1.000.000)
4. Mark as "top-up" in cash_in table
5. Agent balance += amount
6. Notifikasi ke agent via WhatsApp
```

---

### 4. Special Price Management

**Fitur:**
```
Admin bisa set special price per agent:

Paket A: Normal price Rp 350.000
- Agent A commission: Rp 30.000 (jadi agent harus charge min 350k)
- Agent B commission: Rp 50.000 (better agent)

atau

Special pricing:
- Agent A harga khusus: Rp 320.000/bulan
- Agent A komisi: Rp 20.000
- Total untuk agent: Rp 340.000
```

---

### 5. Digiflazz Integration

**Setup:**
```json
{
  "digiflazz_username": "your_account",
  "digiflazz_api_key": "api_key_xxx",
  "digiflazz_webhook_secret": "webhook_secret",
  "digiflazz_markup": 0    // Markup % (0-100)
}
```

**Flow:**
```
1. Agent login → menu "Beli Produk"
2. Pilih kategori (Pulsa, Data, dll)
3. Pilih brand (Telkomsel, Indosat, dll)
4. Pilih nominal (Rp 5rb, 10rb, dll)
5. Input customer nomor
6. Confirm & bayar
7. Sistem kirim ke Digiflazz API
8. Produk dikirim otomatis
9. Webhook notif status
10. Status di-update di aplikasi
11. Agent terima notif
```

**Product Display:**
```
[Telkomsel] [Indosat] [XL] [3] [Smartfren]
   ↓
[Rp 5rb] [Rp 10rb] [Rp 20rb] [Rp 50rb] [Rp 100rb]
   ↓
Input nomor → Konfirm → Proses
```

---

## 📊 FITUR MONITORING & HEALTH

### 1. System Monitoring

**Metrics:**
```
Real-time:
- CPU Usage (%)
- Memory Usage (%)
- Disk Usage (%)
- Process uptime
- Load average

Database:
- Connection status
- Table count
- Database size
- WAL status

Services:
- MikroTik connectivity
- GenieACS connectivity
- Payment gateway status
- WhatsApp connection status
- OLT SNMP status
```

---

### 2. Monitoring Dashboard

**Views:**
```
Admin Portal (/admin/monitoring):
- System metrics card
- Graph history (CPU, RAM, Disk)
- Service status indicators
- Alert log

Tech Portal (/tech/monitoring):
- Same as admin (read-only)
```

---

### 3. Health Check Endpoint

**Endpoint:**
```
GET /health

Response:
{
  "status": "healthy",
  "timestamp": "2026-08-14T10:30:00Z",
  "services": {
    "database": "ok",
    "mikrotik": "ok",
    "payment_gateway": "ok",
    "whatsapp": "connected"
  }
}
```

---

### 4. Alert System

**Alert Types:**
```
- ✅ High CPU (> 80%)
- ✅ Low disk space (< 10%)
- ✅ Memory warning (> 85%)
- ✅ Service disconnected
- ✅ Failed backup
- ✅ Unpaid invoices threshold
```

**Alert Delivery:**
```
- Dashboard alert badge
- Email notification
- WhatsApp notification (admin)
- Telegram notification (jika aktif)
```

---

## ⚙️ FITUR AUTOMATION & CRON

### 1. Cron Jobs Schedule

**1. Auto Invoice Generation**
```
Schedule: 1 Jan, Feb, Mar, ... Dec @ 00:01
Action: Generate monthly invoices untuk semua customer
Config: Automatic di app startup
Detail:
- Hitung promo price / regular price
- Hitung prorata jika bulan pertama
- Hitung tax/PPN jika applicable
- Create invoice record
- Notify customer via WhatsApp
```

**2. Auto Isolir**
```
Schedule: Every day @ 02:00
Action: Isolir customers yang lewat due date
Config: Otomatis
Detail:
- Cek semua customer dengan status 'active'
- Cek auto_isolate flag = true
- Cek tanggal hari ini >= isolate_day
- Cek ada unpaid invoices
- Suspend ke MikroTik (PPPoE/hotspot)
- Notif customer via WhatsApp
```

**3. WhatsApp Reminder**
```
Schedule: Every day @ 09:00
Action: Send billing reminder (H-1 isolir)
Config: Enable whatsapp_auto_billing_enabled = true
Detail:
- Cek customers yg isolir besok
- Send reminder message
- Template: tagihan amount, due date, payment link
- Delay 3-5 detik antar pesan (hindari spam)
```

**4. Night Mode Switch (Jam Kalong)**
```
Schedule: 00:00 (midnight) & 06:00 (pagi)
Action: Ganti PPPoE profile malam/siang
Config: Per paket, if use_night_mode = true
Detail:
- 00:00: Switch ke night_profile (contoh: 20Mbps)
- 06:00: Switch ke day_profile (contoh: 10Mbps)
- Custom time possible
```

**5. FUP Check (Fair Usage Policy)**
```
Schedule: Every hour @ 00 (00:00, 01:00, 02:00, ...)
Action: Check monthly data usage vs FUP limit
Config: Per paket, if use_fup = true
Detail:
- Cek total data used bulan ini
- Jika > fup_limit_gb: switch ke fup_profile
- Profile FUP usually slower (contoh: 1Mbps)
- Revert ke normal profile next month (1 Jan)
```

**6. Usage Sync**
```
Schedule: Every 10 minutes
Action: Sync PPPoE traffic dari MikroTik
Config: Enable usage_tracking_enabled = true
Detail:
- Query sesi PPPoE aktif dari MikroTik
- Aggregate bytes_in/out
- Store di customer_usage table
- Accumulate untuk FUP checking
```

**7. Backup Database**
```
Schedule: Daily @ 02:00 (configurable)
Action: Backup database billing.db
Config: Enable auto_backup_enabled = true
Detail:
- Copy database/billing.db → backups/
- Timestamp: billing-YYYYMMDD-HHMMSS.db
- Keep latest N backups (retention_days)
- Delete old backup automatically
```

---

### 2. Manual Trigger

**Admin bisa manual trigger:**
```
/admin/billing/generate-invoices  → Generate now
/admin/isolate-customers          → Run isolir check
/admin/whatsapp/send-reminder     → Send broadcast
/admin/backup/create              → Backup now
```

---

## 👨‍💼 FITUR INTERNAL USER MANAGEMENT

### 1. User Roles

**Role Hierarchy:**
```
1. Super Admin (Tertinggi)
   - Full access semua fitur
   - User management
   - Settings & configuration
   - Audit trail access
   
2. Admin
   - Customer management
   - Billing & payment
   - MikroTik & device management
   - WhatsApp administration
   - Limited setting access
   
3. Kasir (Cashier)
   - Payment recording only
   - Invoice marking (paid/unpaid)
   - Report viewing (finance)
   
4. Teknisi (Technician)
   - Ticket management
   - Device configuration
   - Customer support
   - Map & location
   - No payment/billing access
   
5. Kolektor (Collector)
   - View customer billing
   - Create payment requests
   - No payment mark (approval flow)
   
6. Agent/Agen (Sales)
   - Pembayaran dari saldo agent
   - Voucher sales
   - Pulsa/data sales
   - No admin/config access
```

---

### 2. User Data

**User Record:**
```javascript
{
  id: number,
  username: string,
  password_hash: string,
  role: 'superadmin'|'admin'|'kasir'|'tech'|'collector'|'agent',
  name: string,
  email: string,
  phone: string,
  area: string,                // For tech/collector scope
  is_active: boolean,
  created_at: datetime,
  last_login: datetime
}
```

---

### 3. Access Control

**Portal Restrictions:**
```
Superadmin:
- /admin (all features)
- /finance (all features)
- /settings (system settings)
- /audit-trail

Admin:
- /admin (except system settings)
- /finance (reports only)
- /settings (limited)

Kasir:
- /admin/invoices
- /admin/payments
- /finance (read-only)

Teknisi:
- /tech (all features)
- /admin/tickets (read-write)

Kolektor:
- /collector (all features)

Agent:
- /agent (all features)

Pelanggan:
- /customer (self-service)
```

---

### 4. Audit Trail

**Logged Actions:**
```
Sensitive actions logged:
- User login/logout
- Invoice mark as paid
- Customer isolir/unisolir
- Payment manual input
- SSID/password change
- Settings modification
- Backup creation
- User creation/modification
- Bulk operations
```

**Audit Record:**
```javascript
{
  id: number,
  user_id: number,
  user_role: string,
  action: string,           // 'invoice_paid', 'customer_isolir', dll
  resource_type: string,    // 'invoice', 'customer', 'device'
  resource_id: number,
  changes: object,          // Before/after data
  timestamp: datetime,
  ip_address: string,
  status: 'success'|'fail'
}
```

---

## 📱 FITUR MULTI-LANGUAGE (i18n)

**Supported Languages:**
```
- English (en)
- Indonesian (id)
```

**Implementation:**
```
config/i18n.js:
- Load translation files from locales/
- locales/en.json
- locales/id.json

Usage:
- Query parameter: ?lang=id
- Route: /lang/id (set session)
- Session key: req.session.lang
- Template helper: res.locals.t('key', 'fallback')
```

**EJS Usage:**
```ejs
<!-- In template -->
<h1><%= t('welcome_message') %></h1>
<button><%= t('pay_invoice') %></button>

<!-- Result dengan lang=id -->
<h1>Selamat Datang</h1>
<button>Bayar Tagihan</button>
```

---

## 🔧 TECHNOLOGY STACK DETAIL

### Backend
```
- Express.js 4.18.2
- Node.js runtime
- Better-sqlite3 (database)
- node-cron (scheduling)
```

### Frontend
```
- EJS template engine
- Bootstrap 5.x
- Bootstrap Icons
- Leaflet (mapping)
- Chart.js / D3 (charts)
- jQuery (minimal)
```

### Integration
```
- routeros-client (MikroTik API)
- net-snmp (OLT management)
- axios (HTTP requests)
- Baileys (WhatsApp unofficial)
- node-telegram-bot-api (Telegram)
- Various payment gateway SDKs
```

### Security
```
- Session management (express-session)
- Password hashing (crypto)
- CSRF protection (basic via Referer)
- Rate limiting (express-rate-limit)
```

### Utilities
```
- pino (logging)
- winston (application logging)
- jimp (image processing)
- qrcode (QR generation)
- xlsx (spreadsheet import)
- pdfkit (PDF generation)
```

---

## 📋 SUMMARY

Aplikasi RTRWNET Billing & Management System adalah sistem ISP yang **comprehensive** dengan fitur-fitur lengkap untuk:

✅ Billing & Invoice management  
✅ Customer lifecycle management  
✅ Network equipment management (MikroTik, OLT, GenieACS)  
✅ Payment processing (multiple gateways)  
✅ Field support & ticketing  
✅ Sales & agent management  
✅ Mapping & GIS visualization  
✅ Automation & scheduled tasks  
✅ Monitoring & health checks  
✅ Multi-user portal & access control  

Sistem ini **sudah production-ready** untuk ISP/RTRW yang ingin manage billing, network, dan customer dalam satu platform terpadu.

---

**Dokumentasi ini comprehensive & siap untuk:**
- On-boarding tim baru
- Training & knowledge transfer
- Development reference
- Feature planning
- Troubleshooting guide

Untuk detail lebih lanjut per fitur, lihat file-file:
- AUDIT_LENGKAP.md (technical deep dive)
- DATABASE_SCHEMA.md (data structure)
- QUICK_REFERENCE.md (quick commands)
