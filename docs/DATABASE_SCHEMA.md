# DATABASE SCHEMA - Aplikasi Billing B481

**Database Type:** SQLite 3 (better-sqlite3)  
**Location:** `database/billing.db`  
**Journal Mode:** WAL (Write-Ahead Logging)  
**Foreign Keys:** Enabled

---

## Schema Overview

### 1. Configuration & Settings
- `settings` - Key-value store untuk runtime configuration
- `expense_categories` - Master kategori pengeluaran

### 2. Master Data
- `packages` - Paket layanan ISP
- `customers` - Data pelanggan
- `routers` - MikroTik router configuration
- `olts` - OLT devices
- `odps` - ODP distribution points

### 3. Billing & Payment
- `invoices` - Tagihan pelanggan
- `payments` - Pembayaran/transaksi
- `payment_approvals` - Approval workflow kolektor

### 4. Network Management (PPPoE)
- `pppoe_users` - User PPPoE list
- `pppoe_profiles` - Speed profile PPPoE
- `pppoe_traffic_samples` - Traffic monitoring samples
- `pppoe_sessions` - Active PPPoE sessions

### 5. Hotspot Management
- `hotspot_users` - Hotspot user list
- `hotspot_profiles` - Hotspot speed profiles
- `hotspot_sessions` - Active hotspot sessions

### 6. Voucher Management
- `voucher_batches` - Batch voucher grouping
- `vouchers` - Individual voucher codes

### 7. Device Management (ACS/TR-069)
- `acsdevices` - Daftar perangkat ACS (ONU/CPE)
- `acs_sessions` - TR-069 session tracking
- `acs_device_params` - Device parameters per ONU

### 8. OLT & ONU Management
- `onu_mapping` - Pemetaan ONU ke customer
- `onu_provision` - Status provisioning ONU
- `olu_ports` - OLT port information

### 9. Operational Data
- `audit_trail` - Log aktivitas sensitif
- `expenses` - Catatan pengeluaran operasional
- `cash_in` - Catatan pemasukan uang
- `technicians` - Data teknisi + login
- `cashiers` - Data kasir
- `agents` - Data agen penjualan
- `collectors` - Data kolektor
- `inventory_items` - Item gudang
- `attendance` - Kehadiran karyawan
- `tickets` - Tiket support pelanggan

### 10. Payment & Digital
- `digiflazz_transactions` - Transaksi pulsa/data Digiflazz
- `vomit_log` - Log webhook pembayaran (generic)

---

## Detailed Table Structures

### settings
```sql
CREATE TABLE settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  type TEXT DEFAULT 'string',
  created_at DATETIME DEFAULT (NOW_LOCAL()),
  updated_at DATETIME DEFAULT (NOW_LOCAL())
);
```

**Purpose:** Store dynamic settings without restart  
**Examples:**
- `company_name`, `company_phone`, `company_email`
- `billing_day`, `isolir_day`
- Feature flags: `whatsapp_enabled`, `login_otp_enabled`

---

### packages
```sql
CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  price INTEGER NOT NULL DEFAULT 0,        -- Harga reguler (Rp)
  promo_price INTEGER DEFAULT NULL,        -- Harga promo (Rp)
  promo_cycles INTEGER DEFAULT 0,          -- Jumlah siklus promo
  speed_down INTEGER DEFAULT 0,            -- Kecepatan download (Mbps)
  speed_up INTEGER DEFAULT 0,              -- Kecepatan upload (Mbps)
  description TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  jam_kalong_enabled INTEGER DEFAULT 0,    -- Night profile feature
  jam_kalong_profile_malam TEXT,           -- Night profile name
  fup_enabled INTEGER DEFAULT 0,           -- Fair Usage Policy
  fup_limit INTEGER DEFAULT 0,             -- GB limit
  fup_profile_turun TEXT,                  -- Degraded profile
  is_hotspot INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

**Purpose:** Define service packages offered  
**Example:**
```
id=1, name='Premium 10Mbps', price=100000, speed_down=10, speed_up=5
```

---

### customers
```sql
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  no_pelanggan TEXT UNIQUE NOT NULL,       -- Customer ID
  nama_pelanggan TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  alamat TEXT,
  paket_id INTEGER REFERENCES packages(id),
  pppoe_user TEXT UNIQUE,                  -- PPPoE username
  pppoe_secret TEXT,                       -- PPPoE password
  password_wifi TEXT,                      -- Wi-Fi password
  install_date DATE,                       -- Installation date
  latitude REAL,                           -- GPS coordinate
  longitude REAL,
  odp_id INTEGER REFERENCES odps(id),      -- ODP location
  router_id INTEGER REFERENCES routers(id), -- MikroTik router
  genieacs_tag TEXT,                       -- GenieACS device tag
  status TEXT DEFAULT 'active',            -- active, suspended, inactive
  isolir_date DATE,                        -- Isolate date
  hari_isolir INTEGER DEFAULT 20,          -- Day to isolate
  isolir_otomatis INTEGER DEFAULT 1,       -- Auto-isolate flag
  tipe_koneksi TEXT DEFAULT 'pppoe',       -- pppoe, hotspot, onu
  promo_cycles_used INTEGER DEFAULT 0,     -- Promo cycle counter
  last_payment_date DATE,
  notes TEXT,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

**Indexes:** 
- `no_pelanggan` (UNIQUE)
- `pppoe_user` (UNIQUE)
- `email`
- `phone`

**Foreign Keys:**
- `paket_id` → `packages(id)`
- `odp_id` → `odps(id)`
- `router_id` → `routers(id)`

---

### invoices
```sql
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  period_year INTEGER NOT NULL,            -- 2026
  period_month INTEGER NOT NULL,           -- 1-12
  amount INTEGER NOT NULL,                 -- Total Rp
  amount_paid INTEGER DEFAULT 0,           -- Sudah dibayar Rp
  status TEXT DEFAULT 'pending',           -- pending, paid, overdue, cancelled
  due_date DATE,                           -- Jatuh tempo
  payment_date DATE,                       -- Tanggal pembayaran
  payment_method TEXT,                     -- cash, transfer, qris
  payment_gateway TEXT,                    -- midtrans, tripay, manual
  qris_code TEXT,                          -- QRIS payload
  qris_unique_id TEXT UNIQUE,              -- Kode unik untuk matching
  notes TEXT,                              -- AUTO: promo siklus X, AUTO: prorata
  created_at DATETIME DEFAULT (NOW_LOCAL()),
  updated_at DATETIME DEFAULT (NOW_LOCAL())
);
```

**Indexes:**
- `customer_id, period_year, period_month` (UNIQUE composite)
- `status`
- `due_date`

---

### payments
```sql
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount INTEGER NOT NULL,                 -- Jumlah bayar Rp
  method TEXT DEFAULT 'cash',              -- cash, transfer, ewallet
  gateway TEXT,                            -- midtrans, tripay, xendit, manual
  gateway_ref_id TEXT UNIQUE,              -- Reference ID dari gateway
  proof_image_url TEXT,                    -- Bukti transfer (foto)
  status TEXT DEFAULT 'pending',           -- pending, verified, failed
  notes TEXT,
  recorded_by_user TEXT,                   -- User yang input
  recorded_by_role TEXT,                   -- admin, kasir, agen
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### routers (MikroTik)
```sql
CREATE TABLE routers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  port INTEGER DEFAULT 8728,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,            -- Default router
  notes TEXT,
  last_connection_test DATETIME,
  connection_status TEXT DEFAULT 'unknown',
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### olts (OLT Devices)
```sql
CREATE TABLE olts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  host TEXT NOT NULL,
  snmp_community TEXT DEFAULT 'public',
  snmp_port INTEGER DEFAULT 161,
  snmp_version TEXT DEFAULT '2c',
  brand TEXT,                              -- ZTE, Huawei, FiberHome
  model TEXT,
  web_user TEXT,                           -- Web interface login
  web_password TEXT,
  telnet_port INTEGER,                    -- Telnet untuk command
  telnet_password TEXT,
  telnet_enable_password TEXT,             -- ZTE enable password
  api_base_url TEXT,                       -- go-api-c320 endpoint
  is_active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### odps (ODP - Distribution Points)
```sql
CREATE TABLE odps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  port_count INTEGER DEFAULT 8,            -- Banyak port fiber
  port_used INTEGER DEFAULT 0,
  address TEXT,
  olt_id INTEGER REFERENCES olts(id),
  is_active INTEGER DEFAULT 1,
  notes TEXT,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### pppoe_users
```sql
CREATE TABLE pppoe_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  router_id INTEGER NOT NULL REFERENCES routers(id),
  username TEXT NOT NULL UNIQUE,
  secret TEXT NOT NULL,
  profile_name TEXT NOT NULL,              -- Speed profile
  status TEXT DEFAULT 'active',            -- active, inactive, disabled
  date_added DATE,
  last_seen DATETIME,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### invoices (dengan fields lengkap)
```sql
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  
  -- Period
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL,
  due_date DATE,
  
  -- Amount
  amount INTEGER NOT NULL,
  amount_paid INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending',
  payment_date DATE,
  
  -- Payment Method
  payment_method TEXT,                     -- cash, transfer, qris
  payment_gateway TEXT,                    -- midtrans, tripay, xendit
  qris_code TEXT,
  qris_unique_id TEXT UNIQUE,
  gateway_ref_id TEXT,
  
  -- Metadata
  notes TEXT,
  created_at DATETIME DEFAULT (NOW_LOCAL()),
  updated_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### pppoe_traffic_samples
```sql
CREATE TABLE pppoe_traffic_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pppoe_user_id INTEGER NOT NULL REFERENCES pppoe_users(id),
  bytes_in INTEGER DEFAULT 0,
  bytes_out INTEGER DEFAULT 0,
  timestamp DATETIME DEFAULT (NOW_LOCAL())
);
```

**Purpose:** Track data usage per session  
**Auto-cleanup:** Runs every 10 minutes via cron

---

### audit_trail
```sql
CREATE TABLE audit_trail (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,                            -- User ID / username
  user_role TEXT,                          -- admin, kasir, etc
  action TEXT NOT NULL,                    -- login, update_customer, payment
  table_name TEXT,
  record_id INTEGER,
  old_value TEXT,                          -- JSON of old data
  new_value TEXT,                          -- JSON of new data
  ip_address TEXT,
  status TEXT DEFAULT 'success',           -- success, failed
  notes TEXT,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

**Auto-cleanup:** Delete records older than 90 days (configurable)

---

### tickets
```sql
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'open',              -- open, assigned, resolved, closed
  priority TEXT DEFAULT 'normal',          -- low, normal, high
  assigned_to_technician TEXT,             -- Technician ID
  attachment_url TEXT,                     -- Foto bukti
  resolution TEXT,
  created_at DATETIME DEFAULT (NOW_LOCAL()),
  updated_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### agents
```sql
CREATE TABLE agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_agen TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  alamat TEXT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,                  -- MUST use bcrypt!
  saldo_agen INTEGER DEFAULT 0,            -- Saldo Rp
  status TEXT DEFAULT 'active',
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### voucher_batches
```sql
CREATE TABLE voucher_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  nominal INTEGER NOT NULL,                -- Harga voucher
  price_per_unit INTEGER NOT NULL,         -- Harga beli
  router_id INTEGER REFERENCES routers(id),
  status TEXT DEFAULT 'active',
  generated_count INTEGER DEFAULT 0,
  printed_count INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### vouchers
```sql
CREATE TABLE vouchers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES voucher_batches(id),
  code TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'available',         -- available, used, expired
  sold_to_agent TEXT,                      -- Agent ID
  used_by_customer TEXT,
  expiry_date DATE,
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

### digiflazz_transactions
```sql
CREATE TABLE digiflazz_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL REFERENCES agents(id),
  ref_id TEXT NOT NULL UNIQUE,             -- Digiflazz reference ID
  phone_or_code TEXT NOT NULL,             -- Tujuan nomor / kode
  product_sku TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',           -- pending, success, failed
  response_data TEXT,                      -- JSON response
  created_at DATETIME DEFAULT (NOW_LOCAL())
);
```

---

## Query Examples

### Generate Invoice (Monthly)
```sql
SELECT c.id, c.paket_id, p.price, c.promo_cycles_used, p.promo_cycles
FROM customers c
JOIN packages p ON c.paket_id = p.id
WHERE c.status = 'active'
AND NOT EXISTS (
  SELECT 1 FROM invoices 
  WHERE customer_id = c.id 
  AND period_year = 2026 
  AND period_month = 6
);
```

### Get Overdue Invoices
```sql
SELECT c.id, c.nama_pelanggan, i.amount
FROM invoices i
JOIN customers c ON i.customer_id = c.id
WHERE i.status = 'pending'
AND i.due_date < DATE('now')
ORDER BY i.due_date ASC;
```

### Check Customer Usage (Daily)
```sql
SELECT 
  pu.id,
  pu.username,
  SUM(pts.bytes_in) / 1000000 as total_gb_in,
  SUM(pts.bytes_out) / 1000000 as total_gb_out
FROM pppoe_users pu
LEFT JOIN pppoe_traffic_samples pts ON pu.id = pts.pppoe_user_id
WHERE DATE(pts.timestamp) = DATE('now')
GROUP BY pu.id;
```

### Find Payments Pending Verification
```sql
SELECT p.*, i.amount, c.nama_pelanggan
FROM payments p
JOIN invoices i ON p.invoice_id = i.id
JOIN customers c ON i.customer_id = c.id
WHERE p.status = 'pending'
ORDER BY p.created_at DESC;
```

---

## Optimization Tips

1. **Add Indexes for Performance:**
```sql
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_pppoe_users_customer ON pppoe_users(customer_id);
CREATE INDEX idx_audit_trail_action ON audit_trail(action, created_at);
```

2. **Regular Maintenance:**
```sql
-- Cleanup old traffic samples (older than 30 days)
DELETE FROM pppoe_traffic_samples 
WHERE timestamp < datetime('now', '-30 days');

-- Cleanup old audit trail (older than 90 days)
DELETE FROM audit_trail 
WHERE created_at < datetime('now', '-90 days');

-- Vacuum database to reclaim space
VACUUM;
```

3. **Monitor Database Size:**
```bash
ls -lh database/billing.db
```

---

## Backup & Recovery

### Backup
```bash
sqlite3 database/billing.db ".backup 'backup-2026-06-19.db'"
```

### Restore
```bash
sqlite3 database/billing.db ".restore 'backup-2026-06-19.db'"
```

### Manual SQL Backup
```bash
sqlite3 database/billing.db ".dump" > backup.sql
```

### Restore from SQL
```bash
sqlite3 database/billing.db < backup.sql
```

---

**Document Version:** 1.0  
**Last Updated:** Juni 2026

