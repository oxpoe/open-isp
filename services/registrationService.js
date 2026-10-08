'use strict';
/**
 * registrationService.js — Perhitungan biaya awal pendaftaran (prorata, acuan tgl 5).
 * biaya pasang + prorata paket − diskon voucher = total bayar awal.
 *
 * Aturan acuan tgl 5:
 *  - daftar SEBELUM tgl 5  → paket dihitung dari tgl daftar sampai tgl 5 BULAN INI
 *  - daftar tgl 5 atau SESUDAH → dihitung sampai tgl 5 BULAN DEPAN
 */
const { getSetting } = require('../config/settingsManager');
const voucherService = require('./voucherService');

function localParts(date) {
  const tz = getSetting('timezone', 'Asia/Jakarta');
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const o = {};
    fmt.formatToParts(date).forEach(p => { o[p.type] = p.value; });
    return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
  } catch (e) {
    return { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() };
  }
}
function pad(n) { return String(n).padStart(2, '0'); }

function computeBill(pkgPrice, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const { y, m, d } = localParts(now);
  const price = Math.max(0, Math.round(Number(pkgPrice) || 0));
  const installFee = Math.max(0, Math.round(Number(opts.installFee != null ? opts.installFee : getSetting('registration_install_fee', 0)) || 0));

  let dueY = y, dueM = m;
  if (d >= 5) {
    if (m === 12) { dueY = y + 1; dueM = 1; } else { dueM = m + 1; }
  }
  const start = new Date(y, m - 1, d);
  const due = new Date(dueY, dueM - 1, 5);
  const diffDays = Math.max(1, Math.round((due.getTime() - start.getTime()) / 86400000));
  const daysInMonth = new Date(dueY, dueM, 0).getDate();
  const costPerDay = price / daysInMonth;
  const prorata = Math.round(diffDays * costPerDay);
  const gross = prorata + installFee;

  let discount = 0;
  let voucher = null;
  if (opts.voucherCode) {
    const v = voucherService.getByCode(opts.voucherCode);
    if (v) {
      const chk = voucherService.validate(opts.voucherCode, gross);
      if (chk.ok) { discount = chk.discount; voucher = v; }
    }
  }
  const total = Math.max(0, gross - discount);

  return {
    price,
    installFee,
    startDate: `${y}-${pad(m)}-${pad(d)}`,
    dueDate: `${dueY}-${pad(dueM)}-05`,
    diffDays,
    daysInMonth,
    costPerDay: Math.round(costPerDay),
    prorata,
    gross,
    discount,
    total,
    voucherCode: voucher ? voucher.code : '',
    voucherValid: !!voucher
  };
}

module.exports = { computeBill, localParts };
