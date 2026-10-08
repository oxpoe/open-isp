# RINGKASAN APLIKASI - RTRWNET BILLING & MANAGEMENT SYSTEM
**Status:** ✅ FULLY EXPLORED & DOCUMENTED  
**Tanggal:** 14 Agustus 2026  
**Format:** Quick Reference untuk understanding aplikasi

---

## 🎯 APLIKASI OVERVIEW

### What is RTRWNET?
**RTRWNET** adalah sistem manajemen terintegrasi untuk **ISP/RTRW** yang mengelola:
- ✅ Billing & invoicing otomatis
- ✅ Manajemen pelanggan & paket
- ✅ Jaringan fisik (MikroTik, OLT, ODP, cable routing)
- ✅ Device management (CPE/ONU via TR-069/GenieACS)
- ✅ Payment gateway integration (Midtrans, Tripay, Xendit, Duitku)
- ✅ Agent/reseller management
- ✅ WhatsApp automation
- ✅ Support ticketing
- ✅ Peta jaringan & GIS
- ✅ Monitoring & health check

**Single Platform:** Satu dashboard untuk admin, teknisi, agen, dan pelanggan.

---

## 📚 PORTAL UTAMA

| Portal | URL | User | Fungsi Utama |
|--------|-----|------|--------------|
| **Customer** | `/customer` | Pelanggan | Cek tagihan, bayar, ubah Wi-Fi, lihat status |
| **Admin** | `/admin` | Admin | Dashboard, billing, customer, MikroTik, settings |
| **Teknisi** | `/tech` | Teknisi | Tiket, peta, device monitoring, support |
| **Agen** | `/agent` | Reseller/Agent | Bayar tagihan pelanggan, jual voucher, jual pulsa |
| **Kolektor** | `/collector` | Collector | Cek & ajukan pembayaran (pending approval) |
| **Finance** | `/finance` | Admin/Finance | Laporan keuangan & pengeluaran |
| **Public** | `/` | Publik | Cek tagihan tanpa login, halaman info |

---

## 🏗️ ARSITEKTUR TEKNIS

### Backend Services (34 services)
```
1. billingService.js          → Invoice generation, promo, prorata
2. customerService.js          → CRUD customer, paket, isolir
3. mikrotikService.js         → PPPoE, hotspot, firewall, monitoring
4. oltService.js              → OLT management via SNMP
5. whatsappService.js         → WhatsApp gateway (Baileys)
6. paymentService.js          → Payment gateway integration
7. voucherPaymentService.js   → E-voucher & payment methods
8. agentService.js            → Agent & Digiflazz integration
9. cronService.js             → Scheduled tasks automation
10. monitoringService.js      → System health & metrics
11. ticketService.js          → Support ticketing
12. inventoryService.js       → Stock & asset management
13. auditTrailService.js      → Action logging
14. backupService.js          → Database backup
15. onuProvisionService.js    → ONU TR-069 provisioning
... + 19 services lainnya (acsServerService, radiusServerService, dll)
```

### Database (SQLite)
```
Total: 50+ tables

Kategori:
- Master: packages, customers, routers, olts, odps
- Billing: invoices, payments, payment_approvals
- Network: pppoe_users, hotspot_users, vouchers
- Device: acs_devices, onu_mapping
- Internal: technicians, agents, collectors, audit_trail
- Other: expenses, cash_in, tickets, inventory_items
```

### Routes/Endpoints (250+ endpoints)
```
/customer/*         → Customer portal (login, billing, device)
/admin/*           → Admin panel (all management)
/tech/*            → Technician portal (tickets, map, devices)
/agent/*           → Agent portal (payment, voucher, pulsa)
/collector/*       → Collector portal (approval workflow)
/finance/*         → Finance reporting
/acs/*             → Built-in TR-069 ACS server
/api/webhook/*    → Payment webhooks
```

### Frontend (EJS Templates)
```
18 main views + partials:
- customer/         → 6 views (billing, device, voucher, etc)
- admin/           → Subdirectory dengan main routes
- tech/            → 3 views (dashboard, tickets, monitoring)
- agent/           → 3 views
- collector/       → 2 views
- Public pages     → login, register, check_billing, tos, privacy
```

---

## 💰 FITUR BILLING

### Invoice Cycle
```
1. Otomatis: Cron @ 1 Jan setiap bulan jam 00:01
   - Generate invoice untuk semua customer
   - Kalkulasi promo price (jika applicable)
   - Kalkulasi prorata (bulan pertama)
   - Kalkulasi tax (PPN 11%)
   - Status: 'unpaid'

2. Notifikasi WhatsApp otomatis ke customer

3. Customer bayar via:
   - Payment gateway (Midtrans, Tripay, Xendit, Duitku)
   - QRIS static (QR fixed dengan nominal unik)
   - Manual via admin/agen
   - Kolektor (pending approval)

4. Status berubah: 'unpaid' → 'paid'

5. Notifikasi paid + auto-unisolir jika dalam suspend

6. Late payment → Auto-isolir @ hari yang ditentukan
```

### Promo & Prorata
```
Promo:
- Paket A: Rp 350rb/bulan, promo Rp 250rb (3 siklus)
- Pelanggan baru: dapat promo 3 bulan pertama
- Counter ditrack di customer.promo_cycles_used
- Reset otomatis saat ganti paket

Prorata:
- Tanggal pasang: 15 Agustus
- Invoice pertama: Rp 350rb * (16 hari / 31 hari) = Rp 180rb
- Bulan berikutnya: Rp 350rb penuh
```

### Payment Gateway
```
Aktif (bisa kombinasi):
- Midtrans    → CC, Transfer, E-wallet
- Tripay      → Bank Transfer, QRIS, E-wallet
- Xendit      → Virtual Account, QR
- Duitku      → Aggregator
- QRIS Static → Fixed QR code

Webhook Generic:
- Endpoint: POST /api/webhook/v1/payment-notif
- Accept dari bank/e-wallet apapun
- Auto-match nominal → mark paid
- Log semua untuk audit
```

---

## 👥 CUSTOMER MANAGEMENT

### Data per Customer
```
Identitas:
- Nama, HP, Email, NIK, Alamat
- GPS Latitude/Longitude
- Area/Kabupaten

Jaringan:
- Paket (Starter/Pro/Premium)
- MikroTik Router assign
- PPPoE username
- Hotspot username (optional)
- Static IP (optional)
- OLT & ONU Port
- GenieACS Tag

Status & Billing:
- Status: active/suspended/inactive
- Isolir day (tanggal isolir otomatis)
- Auto-isolir enable/disable
- Promo cycles used
```

### Isolir Workflow
```
Manual Isolir:
1. Admin klik "Isolir" di customer detail
2. Sistem hapus/disable PPPoE user di MikroTik
3. Status berubah: active → suspended
4. Redirect ke page /isolated (jika online)

Auto-Isolir:
1. Cron job setiap hari jam 02:00
2. Cek customer: status=active + unpaid invoices + today >= isolate_day
3. Suspend PPPoE ke MikroTik
4. Notifikasi WhatsApp

Unisolir:
1. Pelanggan bayar
2. Admin klik "Buka Isolir"
3. Restore PPPoE user
4. Status: suspended → active
5. Customer online lagi
```

---

## 🌐 MIKROTIK INTEGRATION

### PPPoE Workflow
```
1. Create customer dengan PPPoE username
2. Sistem generate PPPoE secret (password)
3. Connect ke MikroTik Router API
4. Add user ke PPPoE service
5. Customer bisa login dengan username/password

Live Monitoring:
- View active sessions
- Bytes in/out per session
- Session duration
- IP address

FUP (Fair Usage Policy):
- Paket: limit 100GB/bulan
- Cron setiap jam cek usage
- Jika > 100GB: ganti profile ke 1Mbps
- Reset 1 Jan bulan berikutnya

Night Mode (Jam Kalong):
- 00:00 - 06:00: Speed 20Mbps
- 06:00 - 00:00: Speed 10Mbps
- Cron @ 00:00 & 06:00 switch profile
```

### Hotspot
```
Similar ke PPPoE:
- Create user dengan limit (uptime/data)
- Monitor active sessions
- Bandwidth limiting
```

### Voucher Hotspot
```
1. Admin create batch (qty 100, validity 30 hari)
2. Sistem generate 100 kode voucher unik
3. Sync ke MikroTik hotspot
4. Customer pakai untuk login hotspot portal
5. Agent bisa jual voucher ke pelanggan
6. Track status: created/active/used/expired
```

---

## 🎛️ GENIEACS & TR-069

### Built-in ACS
```
Aplikasi punya ACS internal (lightweight):
- Tidak perlu GenieACS eksternal
- Support ZTE, Huawei, FiberHome, dll
- Auto-detect device properties
- Port: 7547 (configurable)
```

### Device Management
```
Features:
- List semua ONU/CPE
- View device status (online/offline)
- Change SSID / Wi-Fi password
- Bulk SSID change
- Reboot device
- Provision WAN (VLAN, bridge, PPPoE)
- View device logs
- Parameter configuration
```

### Workflow
```
1. ONU/CPE boot → connect ke ACS server
2. Sistem auto-detect device properties
3. Admin bisa configure via panel
4. Change SSID → send ke device via TR-069
5. Device update config otomatis
6. Customer notif via WhatsApp
```

---

## 🔌 OLT & ONU MANAGEMENT

### OLT Setup
```
Konfigurasi:
- IP address OLT
- SNMP community string
- Telnet credentials (untuk config WAN)
- Web interface credentials

Multi-OLT:
- Bisa manage banyak OLT sekaligus
- Per pelanggan assign ke OLT mana
```

### ONU Monitoring
```
Via SNMP query:
- Status (online/offline)
- Serial number
- Optical signal (dBm)
- Distance ke OLT
- RX/TX power

Operations:
- Reboot ONU
- Rename (friendly name)
- Authorize ONU (EPON)
- Configure WAN (via Telnet/TR-069/REST API)
```

---

## 💳 PAYMENT FLOW

### Customer Bayar Invoice
```
1. Customer login portal
2. Lihat tagihan belum bayar
3. Click "Bayar"
4. Pilih metode pembayaran (dari gateway aktif)
5. Redirect ke payment gateway
6. Customer input data (CC/transfer/etc)
7. Gateway proses
8. Success → Webhook ke aplikasi
9. Aplikasi verify amount & signature
10. Mark invoice PAID
11. Send WhatsApp confirmation
12. Auto-unisolir jika customer dalam suspend
13. Dashboard terupdate
```

### Webhook Payment
```
Generic endpoint untuk bank/e-wallet:
POST /api/webhook/v1/payment-notif

Bisa terima dari:
- Bank (SMS gateway → webhook)
- E-wallet (API callback)
- QRIS (bank QRIS provider)

Sistem:
- Parse amount dari notifikasi
- Find invoice / voucher dengan nominal cocok
- Verify jika nominal sudah digunakan (duplikasi)
- Mark as PAID
- Log untuk audit
```

---

## 🗺️ GIS MAPPING

### Peta Admin
```
Features:
- Leaflet map (OpenStreetMap + Satellite)
- Marker customer (warna: hijau/merah/biru)
- Marker ODP (orange)
- Draw cable path (customer → ODP)
- Popup detail (klik marker)
- Zoom/pan/locate

Interaksi:
- Click customer → detail + isolir button
- Click ODP → info + available ports
- Draw polyline → cable path (simpan)
- Real-time PPPoE traffic graph
- Google Maps route (untuk tech)
```

### Cable Path
```
Simpan rute dari customer ke ODP:
- Array of [lat, lng] coordinates
- Calculate distance (KM)
- Description (aerial/underground/etc)
- Edit/delete existing path
```

### Tech GPS (Optional)
```
- Tech login portal dengan mobile
- Sistem track GPS lokasi tech
- Geofence alert (keluar/masuk area kantor)
- Nearby customers di radius tertentu
- Chat WhatsApp dari peta
```

---

## 💬 WHATSAPP AUTOMATION

### Setup
```
1. Admin buka /admin/whatsapp
2. Scan QR code dengan WhatsApp app
3. Verify & approve
4. Bot siap mengirim pesan

Gateway:
- Baileys (Unofficial WebSocket)
- Meta Cloud API (Official, jika setup)
```

### Automated Messages
```
Invoice Created:
"Tagihan Anda bulan ini siap!
Nominal: Rp 350.000
Bayar di: [link]
Due: 10 Agustus"

Invoice Paid:
"✅ Pembayaran diterima!
Tagihan Rp 350.000 LUNAS
Terima kasih!"

Isolir Reminder (H-1):
"⚠️ Reminder: Jatuh tempo BESOK
Tagihan Rp 350.000
Bayar untuk hindari isolir"

Isolir Notice:
"⚠️ Layanan Anda DIPUTUS
Penyebab: Tagihan belum dibayar
Hubungi [support]"

Unisolir:
"✅ Layanan Anda kembali AKTIF
Terima kasih pembayarannya!"
```

### Admin Commands (via WhatsApp)
```
"BILLING" → Send laporan billing hari ini
"PPPOE" → List active PPPoE sessions
"BALANCE" → Cek saldo Digiflazz
"TOPUP 1000000" → Top-up agent
"INVOICE" → List unpaid invoices
```

### Broadcast
```
Select customers → Create message → Schedule → Send
- Set delay antar pesan (3-5 detik)
- Track delivery status
- Pause/resume/stop anytime
- Retry failed messages
```

---

## 👔 AGENT MANAGEMENT

### Agent Fitur
```
Dashboard:
- Total saldo (Rp)
- Today's transaction
- Commission earned
- Top customers

Pembayaran:
- Cari pelanggan
- Lihat unpaid invoices
- Bayar dari saldo agent
- Print struk

Voucher:
- Lihat inventory
- Jual ke customer
- Print code
- Track sale

Digiflazz (Pulsa/Data):
- Browse produk (Telkomsel, Indosat, dll)
- Category → Brand → Nominal
- Buy untuk customer
- Webhook status update
```

### Admin Agent Control
```
- Create/edit agent
- Top-up balance
- Set commission %
- View transaction history
- Special pricing per agent
- Performance report
```

---

## 🎫 TICKETING SYSTEM

### Ticket Status Flow
```
open → in_progress → resolved → closed

Open:
- Customer create di portal
- Auto-assign ke admin/tech

In Progress:
- Tech ambil ticket
- Add notes/photos
- Update status

Resolved:
- Tech mark selesai
- Notif ke customer

Closed:
- Customer confirm selesai
- Optional: give rating (1-5)
```

### Admin Features
```
- Dashboard tickets (count per status)
- Assign ke technician
- Reassign jika perlu
- View ticket history
- SLA tracking
- Performance report
```

### Tech Features
```
- Pool tickets (assigned to me)
- View detail
- Take ticket
- Upload photos (before/after)
- Add resolution notes
- Mark resolved
```

### Customer Features
```
- Create ticket
- View my tickets
- See status update
- Add comment/photo
- Rate satisfaction
```

---

## ⚙️ AUTOMATION (CRON JOBS)

| Waktu | Tugas | Detail |
|-------|-------|--------|
| 1 Jan @ 00:01 | Generate invoices | Monthly billing untuk semua customer |
| Setiap hari @ 02:00 | Auto-isolir | Suspend customer overdue |
| Setiap hari @ 09:00 | Reminder tagihan | WhatsApp reminder H-1 isolir |
| 00:00 & 06:00 | Night mode | Ganti profile PPPoE malam/siang |
| Setiap jam | FUP check | Check usage vs limit, ganti profile |
| Setiap 10 menit | Usage sync | Sinkron PPPoE traffic dari MikroTik |
| Setiap hari @ 02:00 | Database backup | Auto-backup dengan retention |

---

## 📊 DATABASE OVERVIEW

### Key Tables
```
customers
├── Identitas (name, phone, email, nik)
├── Jaringan (pppoe_username, hotspot_username, static_ip)
├── Device (olt_id, onu_port, genieacs_tag)
├── Billing (package_id, isolate_day, auto_isolate)
└── Status (status, created_at, updated_at)

invoices
├── Amount (amount, status, qris_amount_unique)
├── Period (period_month, period_year)
├── Payment (paid_at, payment_method)
└── Notes (promo/prorata info)

payments
├── Transaction data (gateway_id, signature, status)
├── Customer info
└── Invoice link

pppoe_users
├── Credentials (username, secret)
├── Profile & limits
└── Session tracking

... + 40+ tables lainnya
```

---

## 🎯 SUMMARY - FITUR UTAMA YANG BERJALAN

✅ **Billing & Invoicing**
- Auto generate bulanan
- Promo cycles tracking
- Prorata bulan pertama
- Multi-gateway payment

✅ **Customer Lifecycle**
- CRUD pelanggan
- Paket management
- Auto-isolir/unisolir
- Status tracking

✅ **Network Management**
- MikroTik PPPoE/Hotspot
- Voucher hotspot
- Firewall & rate limiting
- Night mode automation

✅ **Device Management**
- Built-in TR-069 ACS
- GenieACS integration
- SSID/password change
- Device provisioning

✅ **OLT/ONU Management**
- SNMP monitoring
- Reboot/rename/authorize
- WAN configuration
- Multi-brand support

✅ **Payment Processing**
- 4 payment gateways
- QRIS static
- Generic webhook
- Payment verification

✅ **GIS Mapping**
- Leaflet maps
- Cable path tracking
- GPS tech tracking
- Real-time graphs

✅ **WhatsApp Automation**
- Invoice notification
- Payment reminder
- Isolir notice
- Broadcast messaging

✅ **Agent Management**
- Pembayaran dari saldo
- Voucher sales
- Pulsa/data (Digiflazz)
- Commission tracking

✅ **Support Ticketing**
- Create/assign/resolve
- Photo upload
- Rating system
- History tracking

✅ **Monitoring**
- System health metrics
- Service status
- Alert system
- Performance tracking

✅ **Automation**
- 7 scheduled jobs
- Configurable timing
- Error handling
- Logging

✅ **Multi-Portal**
- Customer self-service
- Admin full control
- Technician field support
- Agent sales
- Collector approval

✅ **Compliance**
- Audit trail logging
- Role-based access
- Session management
- Data validation

---

## 🚀 PRODUCTION STATUS

**Aplikasi ini SUDAH BERJALAN** dan mencakup:
- ✅ Complete billing system
- ✅ Full customer management
- ✅ Network device integration
- ✅ Payment processing
- ✅ Multi-user portals
- ✅ Automation & scheduling
- ✅ Monitoring & health check

**Siap untuk:**
- ✅ Production deployment
- ✅ Scaling operasi ISP
- ✅ Integration ke sistem existing
- ✅ Customization per requirements

---

## 📖 DOKUMENTASI TERSEDIA

1. **FITUR_APLIKASI_LENGKAP.md** ← Dokumentasi ini (16 fitur utama + detail)
2. **AUDIT_LENGKAP.md** (Existing) ← Technical deep dive
3. **DATABASE_SCHEMA.md** (Existing) ← Struktur data lengkap
4. **QUICK_REFERENCE.md** (Existing) ← Common commands
5. **AUDIT_SECURITY_2026.md** (Baru) ← Security audit findings
6. **IMPLEMENTATION_GUIDE_SECURITY.md** (Baru) ← Fix guide
7. **README.md** (Existing) ← Instalasi & setup

---

**Status:** ✅ Aplikasi komprehensif, well-documented, siap production  
**Next Step:** Implementasi security fixes (bcrypt, .env, CSRF) sebelum production
