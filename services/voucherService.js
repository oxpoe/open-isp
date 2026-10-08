'use strict';
/**
 * voucherService.js — Voucher diskon registrasi.
 * Voucher: berlaku selamanya (tanpa kedaluwarsa), hanya batas nominal.
 * type 'nominal' = potongan Rp; 'percent' = % dengan batas maksimal (max_discount).
 */
const db = require('../config/database');

function list() {
  return db.prepare('SELECT * FROM discount_vouchers ORDER BY id DESC').all();
}
function getByCode(code) {
  const c = String(code || '').trim();
  if (!c) return null;
  return db.prepare('SELECT * FROM discount_vouchers WHERE code = ? COLLATE NOCASE').get(c);
}
function getById(id) {
  return db.prepare('SELECT * FROM discount_vouchers WHERE id = ?').get(Number(id));
}
function computeDiscount(v, amount) {
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (!v || !v.active) return 0;
  if (Number(v.max_uses) > 0 && Number(v.used_count) >= Number(v.max_uses)) return 0;
  if (Number(v.min_purchase) > 0 && amt < Number(v.min_purchase)) return 0;
  let d;
  if (v.type === 'percent') {
    d = Math.round(amt * (Number(v.value) || 0) / 100);
    if (Number(v.max_discount) > 0) d = Math.min(d, Number(v.max_discount));
  } else {
    d = Number(v.value) || 0;
  }
  return Math.max(0, Math.min(d, amt));
}
function validate(code, amount) {
  const v = getByCode(code);
  if (!v) return { ok: false, message: 'Kode voucher tidak ditemukan.' };
  if (!v.active) return { ok: false, message: 'Kode voucher tidak aktif.' };
  if (Number(v.max_uses) > 0 && Number(v.used_count) >= Number(v.max_uses)) return { ok: false, message: 'Kode voucher sudah habis dipakai.' };
  const amt = Math.max(0, Math.round(Number(amount) || 0));
  if (Number(v.min_purchase) > 0 && amt < Number(v.min_purchase)) {
    return { ok: false, message: 'Minimal tagihan Rp ' + Number(v.min_purchase).toLocaleString('id-ID') + ' untuk memakai voucher ini.' };
  }
  const discount = computeDiscount(v, amt);
  return { ok: true, voucher: v, discount: discount, message: 'Voucher diterapkan: -Rp ' + discount.toLocaleString('id-ID') };
}
function create(data) {
  const code = String(data.code || '').trim().toUpperCase();
  if (!code) throw new Error('Kode voucher wajib diisi');
  const type = data.type === 'percent' ? 'percent' : 'nominal';
  const value = Math.max(0, parseInt(data.value, 10) || 0);
  if (value <= 0) throw new Error('Nilai voucher harus lebih dari 0');
  const maxDiscount = Math.max(0, parseInt(data.max_discount, 10) || 0);
  const minPurchase = Math.max(0, parseInt(data.min_purchase, 10) || 0);
  const maxUses = Math.max(0, parseInt(data.max_uses, 10) || 0);
  const active = Number(data.active) === 0 ? 0 : 1;
  const exists = getByCode(code);
  if (exists) throw new Error('Kode voucher sudah ada');
  const r = db.prepare(`INSERT INTO discount_vouchers (code, type, value, max_discount, min_purchase, active, max_uses, note) VALUES (?,?,?,?,?,?,?,?)`)
    .run(code, type, value, maxDiscount, minPurchase, active, maxUses, String(data.note || ''));
  return getById(r.lastInsertRowid);
}
function update(id, data) {
  const v = getById(id); if (!v) throw new Error('Voucher tidak ditemukan');
  const code = data.code != null ? String(data.code).trim().toUpperCase() : v.code;
  if (!code) throw new Error('Kode voucher wajib diisi');
  const dup = getByCode(code);
  if (dup && Number(dup.id) !== Number(id)) throw new Error('Kode voucher sudah dipakai voucher lain');
  const type = (data.type === 'percent') ? 'percent' : (data.type === 'nominal' ? 'nominal' : v.type);
  const value = data.value != null ? Math.max(0, parseInt(data.value, 10) || 0) : v.value;
  const maxDiscount = data.max_discount != null ? Math.max(0, parseInt(data.max_discount, 10) || 0) : v.max_discount;
  const minPurchase = data.min_purchase != null ? Math.max(0, parseInt(data.min_purchase, 10) || 0) : v.min_purchase;
  const maxUses = data.max_uses != null ? Math.max(0, parseInt(data.max_uses, 10) || 0) : v.max_uses;
  const active = data.active != null ? (Number(data.active) === 1 ? 1 : 0) : v.active;
  const note = data.note != null ? String(data.note) : v.note;
  db.prepare(`UPDATE discount_vouchers SET code=?, type=?, value=?, max_discount=?, min_purchase=?, active=?, max_uses=?, note=? WHERE id=?`)
    .run(code, type, value, maxDiscount, minPurchase, active, maxUses, note, Number(id));
  return getById(id);
}
function remove(id) {
  return db.prepare('DELETE FROM discount_vouchers WHERE id=?').run(Number(id));
}
function incrementUse(code) {
  const c = String(code || '').trim();
  if (!c) return;
  db.prepare('UPDATE discount_vouchers SET used_count = used_count + 1 WHERE code = ? COLLATE NOCASE').run(c);
}
module.exports = { list, getByCode, getById, computeDiscount, validate, create, update, remove, incrementUse };
