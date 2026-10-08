#!/usr/bin/env node
/**
 * Script untuk menambahkan tabel promo_slides ke database existing
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/billing.db');

try {
  const db = new Database(dbPath);
  
  console.log('[Script] Opening database:', dbPath);
  
  // Cek apakah table sudah ada
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='promo_slides'
  `).get();
  
  if (tableExists) {
    console.log('[Script] ✓ Table promo_slides sudah ada');
    db.close();
    process.exit(0);
  }
  
  // Buat table jika belum ada
  console.log('[Script] Creating table promo_slides...');
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      image_path TEXT NOT NULL,
      url TEXT DEFAULT '',
      open_in_new_tab INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      start_date DATE,
      end_date DATE,
      created_at DATETIME DEFAULT (CURRENT_TIMESTAMP),
      updated_at DATETIME DEFAULT (CURRENT_TIMESTAMP)
    );
  `);
  
  console.log('[Script] ✓ Table promo_slides berhasil dibuat');
  
  // Verifikasi table
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='promo_slides'
  `).get();
  
  if (result) {
    console.log('[Script] ✓ Verifikasi berhasil: table promo_slides ada di database');
  }
  
  db.close();
  console.log('[Script] ✓ Selesai! Database updated successfully.');
  process.exit(0);
  
} catch (e) {
  console.error('[Script] ✗ Error:', e.message);
  process.exit(1);
}
