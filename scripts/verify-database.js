/**
 * Script untuk memverifikasi dan memperbaiki struktur database
 * Menambahkan kolom yang hilang jika diperlukan
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/billing.db');
console.log('Memeriksa database:', dbPath);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// Fungsi untuk cek apakah kolom ada
function columnExists(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some(col => col.name === columnName);
}

// Daftar kolom yang harus ada di tabel customers
const requiredColumns = [
  { name: 'hotspot_username', type: 'TEXT DEFAULT \'\'', description: 'Username Hotspot' },
  { name: 'hotspot_password', type: 'TEXT DEFAULT \'\'', description: 'Password Hotspot' },
  { name: 'hotspot_profile', type: 'TEXT DEFAULT \'\'', description: 'Profile Hotspot' },
  { name: 'mac_address', type: 'TEXT', description: 'MAC Address' },
  { name: 'connection_type', type: 'TEXT DEFAULT \'pppoe\'', description: 'Tipe Koneksi' },
  { name: 'static_ip', type: 'TEXT', description: 'Static IP' },
  { name: 'auto_isolate', type: 'INTEGER DEFAULT 1', description: 'Auto Isolir' },
  { name: 'isolate_day', type: 'INTEGER DEFAULT 10', description: 'Hari Isolir' },
  { name: 'email', type: 'TEXT DEFAULT \'\'', description: 'Email' },
  { name: 'router_id', type: 'INTEGER REFERENCES routers(id) ON DELETE SET NULL', description: 'Router ID' },
  { name: 'olt_id', type: 'INTEGER REFERENCES olts(id) ON DELETE SET NULL', description: 'OLT ID' },
  { name: 'pon_port', type: 'TEXT DEFAULT \'\'', description: 'PON Port' },
  { name: 'odp_id', type: 'INTEGER REFERENCES odps(id) ON DELETE SET NULL', description: 'ODP ID' },
  { name: 'lat', type: 'TEXT', description: 'Latitude' },
  { name: 'lng', type: 'TEXT', description: 'Longitude' },
  { name: 'cable_path', type: 'TEXT', description: 'Cable Path' },
  { name: 'promo_cycles_used', type: 'INTEGER DEFAULT 0', description: 'Promo Cycles Used' }
];

console.log('\n=== VERIFIKASI TABEL CUSTOMERS ===\n');

let missingColumns = [];
let existingColumns = [];

for (const col of requiredColumns) {
  const exists = columnExists('customers', col.name);
  if (exists) {
    existingColumns.push(col.name);
    console.log(`✓ Kolom '${col.name}' sudah ada`);
  } else {
    missingColumns.push(col);
    console.log(`✗ Kolom '${col.name}' TIDAK ADA`);
  }
}

console.log(`\n=== RINGKASAN ===`);
console.log(`Total kolom yang diperiksa: ${requiredColumns.length}`);
console.log(`Kolom yang sudah ada: ${existingColumns.length}`);
console.log(`Kolom yang hilang: ${missingColumns.length}`);

if (missingColumns.length > 0) {
  console.log(`\n=== MENAMBAHKAN KOLOM YANG HILANG ===\n`);
  
  for (const col of missingColumns) {
    try {
      const sql = `ALTER TABLE customers ADD COLUMN ${col.name} ${col.type}`;
      console.log(`Menambahkan: ${col.name} (${col.description})`);
      db.exec(sql);
      console.log(`✓ Berhasil menambahkan kolom '${col.name}'`);
    } catch (e) {
      console.error(`✗ Gagal menambahkan kolom '${col.name}':`, e.message);
    }
  }
  
  console.log(`\n=== SELESAI ===`);
  console.log(`Silakan restart aplikasi untuk menerapkan perubahan.`);
} else {
  console.log(`\n✓ Semua kolom sudah lengkap!`);
}

db.close();
