/**
 * customerIdService.js — ID Pelanggan PERMANEN (tidak bisa di-regenerate).
 *
 * Format: <PREFIX>-<angka>  contoh: SKY-48213
 *  - Hanya ANGKA setelah tanda hubung (tanpa huruf).
 *  - Dibuat otomatis sekali saat pelanggan dibuat, lalu melekat permanen.
 *  - Unik (dicek ke DB, tanpa duplikat).
 *  - Prefix & jumlah digit diatur di Pengaturan (customer_id_prefix / customer_id_digits).
 */
const crypto = require('crypto');
const db = require('../config/database');
const { getSetting } = require('../config/settingsManager');

const DEFAULT_PREFIX = 'ISP';
const DEFAULT_DIGITS = 5;

function sanitizePrefix(p) {
  return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}
function sanitizeDigits(d) {
  const n = parseInt(d, 10);
  if (!Number.isFinite(n)) return DEFAULT_DIGITS;
  return Math.min(Math.max(n, 4), 10);
}
function randomDigits(n) {
  let out = '';
  for (let i = 0; i < n; i++) out += String(crypto.randomInt(0, 10));
  return out;
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Format baru yang berlaku: <PREFIX>-<angka> (minimal 4 digit).
// Sengaja TIDAK bergantung nilai prefix saat ini → mengubah prefix tidak
// akan membuat kode lama ikut ter-regenerate (permanen).
function isNewFormat(code) {
  return /^[A-Z0-9]+-\d{4,10}$/.test(String(code || ''));
}

function generateCustomerCode() {
  const prefix = sanitizePrefix(getSetting('customer_id_prefix', DEFAULT_PREFIX)) || DEFAULT_PREFIX;
  const digits = sanitizeDigits(getSetting('customer_id_digits', DEFAULT_DIGITS));
  const check = db.prepare('SELECT 1 FROM customers WHERE customer_code = ? LIMIT 1');
  for (let i = 0; i < 60; i++) {
    const code = prefix + '-' + randomDigits(digits);
    if (!check.get(code)) return code;
  }
  // Ruang hampir penuh → tambah 1 digit agar tetap unik
  return prefix + '-' + randomDigits(digits + 1);
}

// Isi yang kosong + migrasi sekali untuk format lama (bukan PREFIX-angka).
// Kode yang sudah sesuai format baru TIDAK akan diubah (permanen).
function backfillCustomerCodes() {
  try {
    const rows = db.prepare('SELECT id, customer_code FROM customers').all()
      .filter((r) => !r.customer_code || !isNewFormat(r.customer_code));
    if (!rows.length) return 0;
    const upd = db.prepare('UPDATE customers SET customer_code = ? WHERE id = ?');
    const run = db.transaction((list) => { for (const r of list) upd.run(generateCustomerCode(), r.id); });
    run(rows);
    return rows.length;
  } catch (e) {
    return -1;
  }
}

module.exports = { generateCustomerCode, backfillCustomerCodes, isNewFormat, sanitizePrefix, sanitizeDigits };
