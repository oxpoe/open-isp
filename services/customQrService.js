'use strict';
/**
 * customQrService.js — QR nominal bebas (di luar billing) dengan kode unik 20 menit.
 * Status: pending -> paid | expired -> warning | rejected
 */
const crypto = require('crypto');
const db = require('../config/database');
const { isQrisAmountTaken } = require('./invoiceQrisService');
const { logger } = require('../config/logger');
const { getSetting } = require('../config/settingsManager');

const DURATION_MINUTES = 20;

function isReady() {
  try {
    const enabled = getSetting('qris_static_enabled', true);
    const off = enabled === false || enabled === 'false' || enabled === 0 || enabled === '0';
    const payload = String(getSetting('qris_static_payload', '') || '').trim();
    return !off && payload.length > 0;
  } catch (e) { return false; }
}

function nowIso() { return new Date().toISOString(); }

function sweepExpired() {
  try {
    db.prepare("UPDATE custom_qr_payments SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at < ?").run(nowIso());
  } catch (e) {}
}

function isTaken(amount, excludeId) {
  if (isQrisAmountTaken(amount, { excludeCustomQrId: excludeId || 0 })) return true;
  try {
    const row = db.prepare("SELECT id FROM custom_qr_payments WHERE status IN ('pending','expired') AND amount_unique=? AND id!=? LIMIT 1").get(amount, Number(excludeId) || 0);
    return !!(row && row.id);
  } catch (e) { return false; }
}

function create({ title, category, amount, note, createdBy }) {
  if (!isReady()) throw new Error('QRIS Statis (Semi-Otomatis) belum aktif/berisi payload. Atur dulu di Pengaturan → QRIS.');
  const base = Math.max(1, Math.floor(Number(amount) || 0));
  if (!title || !String(title).trim()) throw new Error('Judul wajib diisi.');
  if (!base) throw new Error('Nominal wajib diisi.');

  let code = 0;
  let amountUnique = 0;
  for (let i = 0; i < 60; i++) {
    const c = 1 + Math.floor(Math.random() * 999);
    if (!isTaken(base + c)) { code = c; amountUnique = base + c; break; }
  }
  if (!amountUnique) {
    for (let c = 1; c <= 999; c++) {
      if (!isTaken(base + c)) { code = c; amountUnique = base + c; break; }
    }
  }
  if (!amountUnique) throw new Error('Gagal membuat kode unik (slot 1-999 penuh).');

  const token = crypto.randomBytes(12).toString('hex');
  const expiresAt = new Date(Date.now() + DURATION_MINUTES * 60 * 1000).toISOString();
  const r = db.prepare(`
    INSERT INTO custom_qr_payments (title, category, amount, unique_code, amount_unique, status, share_token, note, created_by, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
  `).run(String(title).trim(), String(category || '').trim(), base, code, amountUnique, token, String(note || '').trim(), String(createdBy || ''), expiresAt);

  return getById(Number(r.lastInsertRowid));
}

function getById(id) {
  sweepExpired();
  return db.prepare('SELECT * FROM custom_qr_payments WHERE id=?').get(Number(id) || 0);
}

function getByToken(token) {
  sweepExpired();
  return db.prepare('SELECT * FROM custom_qr_payments WHERE share_token=?').get(String(token || ''));
}

function list(limit = 100) {
  sweepExpired();
  return db.prepare('SELECT * FROM custom_qr_payments ORDER BY id DESC LIMIT ?').all(Math.max(1, Math.min(500, Number(limit) || 100)));
}

function stats() {
  sweepExpired();
  const paid = db.prepare("SELECT COUNT(*) c, COALESCE(SUM(amount_unique),0) t FROM custom_qr_payments WHERE status='paid'").get();
  const pending = db.prepare("SELECT COUNT(*) c FROM custom_qr_payments WHERE status='pending'").get();
  const warning = db.prepare("SELECT COUNT(*) c FROM custom_qr_payments WHERE status='warning'").get();
  const rejected = db.prepare("SELECT COUNT(*) c FROM custom_qr_payments WHERE status='rejected'").get();
  return {
    paidCount: Number(paid.c || 0),
    paidTotal: Number(paid.t || 0),
    pendingCount: Number(pending.c || 0),
    warningCount: Number(warning.c || 0),
    rejectedCount: Number(rejected.c || 0)
  };
}

function candidatesByAmount(amount) {
  sweepExpired();
  return db.prepare("SELECT * FROM custom_qr_payments WHERE amount_unique=? AND status IN ('pending','expired') ORDER BY id DESC LIMIT 2").all(Number(amount) || 0);
}

function markManualPaid(id, actor, note) {
  const row = getById(id);
  if (!row) throw new Error('Data tidak ditemukan.');
  if (row.status === 'paid') return row;
  db.prepare("UPDATE custom_qr_payments SET status='paid', paid_at=NOW_LOCAL(), paid_by=?, resolution_note=? WHERE id=?")
    .run(String(actor || 'Admin'), String(note || 'Manual pay'), row.id);
  return getById(id);
}

function acceptWarning(id, actor, note) {
  const row = getById(id);
  if (!row) throw new Error('Data tidak ditemukan.');
  if (row.status !== 'warning') throw new Error('Hanya pembayaran berstatus warning yang bisa diselesaikan.');
  db.prepare("UPDATE custom_qr_payments SET status='paid', paid_at=NOW_LOCAL(), paid_by=?, resolved_by=?, resolved_at=NOW_LOCAL(), resolution_note=? WHERE id=?")
    .run(String(actor || 'Admin'), String(actor || 'Admin'), String(note || 'Diterima setelah 20 menit'), row.id);
  return getById(id);
}

function remove(id) {
  const r = db.prepare('DELETE FROM custom_qr_payments WHERE id=?').run(Number(id) || 0);
  return r.changes || 0;
}

function clearAll() {
  const r = db.prepare('DELETE FROM custom_qr_payments').run();
  return r.changes || 0;
}

function regenerate(id, actor) {
  const old = getById(id);
  if (!old) throw new Error('Data tidak ditemukan.');
  if (old.status === 'pending' && !isExpired(old)) throw new Error('QR masih aktif. Tunggu kedaluwarsa atau gunakan QR yang ada.');
  const row = create({
    title: old.title,
    category: old.category,
    amount: old.amount,
    note: old.note,
    createdBy: actor
  });
  return row;
}

function reject(id, actor, note) {
  const row = getById(id);
  if (!row) throw new Error('Data tidak ditemukan.');
  if (row.status === 'rejected') return row;
  db.prepare("UPDATE custom_qr_payments SET status='rejected', resolved_by=?, resolved_at=NOW_LOCAL(), resolution_note=? WHERE id=?")
    .run(String(actor || 'Admin'), String(note || 'Refund / ditolak'), row.id);
  return getById(id);
}

async function notifyAdminPayment(row, isWarning) {
  try {
    const waNotify = require('./waNotifyService');
    const text = isWarning
      ? `⚠️ *PEMBAYARAN QR CUSTOM (LEWAT 20 MENIT)*\n\n` +
        `Judul: ${row.title}\nKategori: ${row.category || '-'}\n` +
        `Nominal: Rp ${Number(row.amount_unique || 0).toLocaleString('id-ID')}\n` +
        `Dibuat: ${row.created_at}\n\n` +
        `Nominal persis masuk setelah batas waktu. Buka menu QR-Custom Payment untuk menyelesaikan atau menolak (refund).`
      : `✅ *PEMBAYARAN QR CUSTOM DITERIMA*\n\n` +
        `Judul: ${row.title}\nKategori: ${row.category || '-'}\n` +
        `Nominal: Rp ${Number(row.amount_unique || 0).toLocaleString('id-ID')}\n\n` +
        `Pembayaran cocok dalam 20 menit.`;
    await waNotify.notifyAdmin(text);
  } catch (e) { logger.warn('[CustomQR] notifyAdmin gagal: ' + e.message); }
}

function markPaidFromWebhook(id, notifId) {
  const row = getById(id);
  if (!row) return null;
  db.prepare("UPDATE custom_qr_payments SET status='paid', paid_at=NOW_LOCAL(), paid_by='Webhook', notif_id=? WHERE id=?")
    .run(notifId || null, row.id);
  const fresh = getById(id);
  notifyAdminPayment(fresh, false).catch(() => {});
  return fresh;
}

function markWarningFromWebhook(id, notifId) {
  const row = getById(id);
  if (!row) return null;
  db.prepare("UPDATE custom_qr_payments SET status='warning', warning_at=NOW_LOCAL(), notif_id=? WHERE id=?")
    .run(notifId || null, row.id);
  const fresh = getById(id);
  notifyAdminPayment(fresh, true).catch(() => {});
  return fresh;
}

function isExpired(row) {
  if (!row || !row.expires_at) return false;
  const t = new Date(row.expires_at).getTime();
  return Number.isFinite(t) && t < Date.now();
}

module.exports = {
  DURATION_MINUTES,
  isReady,
  create,
  list,
  stats,
  getById,
  getByToken,
  candidatesByAmount,
  markManualPaid,
  acceptWarning,
  regenerate,
  remove,
  clearAll,
  reject,
  markPaidFromWebhook,
  markWarningFromWebhook,
  isExpired,
  sweepExpired
};
