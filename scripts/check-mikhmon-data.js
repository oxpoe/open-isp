/**
 * Script untuk memeriksa data Mikhmon di database
 */
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../database/billing.db');
const db = new Database(dbPath);

console.log('=== MEMERIKSA DATA MIKHMON DI DATABASE ===\n');

// Cari profiles dengan Mikhmon
const profiles = db.prepare(`
  SELECT name, onLogin 
  FROM hotspot_profiles 
  WHERE onLogin LIKE '%rem%' 
  LIMIT 10
`).all();

console.log(`Ditemukan ${profiles.length} profile dengan Mikhmon:\n`);

if (profiles.length === 0) {
  console.log('Tidak ada profile dengan Mikhmon di database.');
} else {
  profiles.forEach((p, i) => {
    console.log(`--- Profile ${i + 1}: ${p.name} ---`);
    console.log('onLogin:', p.onLogin ? p.onLogin.substring(0, 150) + (p.onLogin.length > 150 ? '...' : '') : 'null');
    console.log('');
  });
}

// Cek semua profiles
const allProfiles = db.prepare('SELECT name, onLogin FROM hotspot_profiles LIMIT 20').all();
console.log(`\nTotal profiles di database: ${allProfiles.length}`);

db.close();
