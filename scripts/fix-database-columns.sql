-- Script SQL untuk menambahkan kolom yang hilang di tabel customers
-- Aman dijalankan berkali-kali (akan skip jika kolom sudah ada)

-- Kolom Hotspot
ALTER TABLE customers ADD COLUMN hotspot_username TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN hotspot_password TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN hotspot_profile TEXT DEFAULT '';

-- Kolom Connection Type
ALTER TABLE customers ADD COLUMN mac_address TEXT;
ALTER TABLE customers ADD COLUMN connection_type TEXT DEFAULT 'pppoe';
ALTER TABLE customers ADD COLUMN static_ip TEXT;

-- Kolom Auto Isolate
ALTER TABLE customers ADD COLUMN auto_isolate INTEGER DEFAULT 1;
ALTER TABLE customers ADD COLUMN isolate_day INTEGER DEFAULT 10;

-- Kolom Email
ALTER TABLE customers ADD COLUMN email TEXT DEFAULT '';

-- Kolom Router & OLT
ALTER TABLE customers ADD COLUMN router_id INTEGER REFERENCES routers(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN olt_id INTEGER REFERENCES olts(id) ON DELETE SET NULL;
ALTER TABLE customers ADD COLUMN pon_port TEXT DEFAULT '';
ALTER TABLE customers ADD COLUMN odp_id INTEGER REFERENCES odps(id) ON DELETE SET NULL;

-- Kolom Lokasi
ALTER TABLE customers ADD COLUMN lat TEXT;
ALTER TABLE customers ADD COLUMN lng TEXT;
ALTER TABLE customers ADD COLUMN cable_path TEXT;

-- Kolom Promo
ALTER TABLE customers ADD COLUMN promo_cycles_used INTEGER DEFAULT 0;
