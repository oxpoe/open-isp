'use strict';
/**
 * invoiceQrisService.js — pastikan kode unik + payload QRIS dinamis untuk sebuah invoice.
 * QRIS dinamis = QRIS statis (settings.qris_static_payload) + nominal (amount + kode unik).
 */
const db = require('../config/database');
const qrisUtil = require('../utils/qrisUtil');
const { getSettings } = require('../config/settingsManager');

/**
 * Cek apakah nominal unik sudah dipakai order lain yang masih menunggu bayar.
 * WAJIB mencakup invoice, voucher, dan donasi: webhook mencocokkan ketiganya
 * sekaligus, jadi nominal yang dipakai dua order berbeda akan dianggap ambigu
 * dan pembayarannya tidak diproses.
 */
function isQrisAmountTaken(amount, opts = {}) {
  const amt = Number(amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const exInv = Number(opts.excludeInvoiceId || 0);
  const exVoucher = Number(opts.excludeVoucherOrderId || 0);
  const exDonation = Number(opts.excludeDonationOrderId || 0);
  const exCustomQr = Number(opts.excludeCustomQrId || 0);
  try {
    const inv = db.prepare('SELECT id FROM invoices WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1').get('unpaid', amt, exInv);
    if (inv && inv.id) return true;
    const voc = db.prepare('SELECT id FROM public_voucher_orders WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1').get('pending', amt, exVoucher);
    if (voc && voc.id) return true;
    const don = db.prepare('SELECT id FROM public_donation_orders WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1').get('pending', amt, exDonation);
    if (don && don.id) return true;
    const cq = db.prepare("SELECT id FROM custom_qr_payments WHERE status IN ('pending','expired') AND amount_unique=? AND id!=? LIMIT 1").get(amt, exCustomQr);
    if (cq && cq.id) return true;
  } catch (e) { /* tabel opsional belum ada */ }
  return false;
}

function ensureInvoiceQris(inv) {
  const settings = getSettings() || {};
  const invId = Number((inv && inv.id) || 0);
  const base = Number((inv && inv.amount) || 0);
  if (!invId || base <= 0) return { uniqueCode: 0, amount: base, payload: '' };

  let code = Number(inv.qris_unique_code || 0);
  let amountUnique = Number(inv.qris_amount_unique || 0);

  if (!(amountUnique > 0 && code > 0 && (amountUnique - code) === base)) {
    let chosen = 0, chosenAmt = 0;
    for (let c = 1; c <= 999; c++) {
      const a = base + c;
      if (!isQrisAmountTaken(a, { excludeInvoiceId: invId })) { chosen = c; chosenAmt = a; break; }
    }
    if (chosen) {
      code = chosen;
      amountUnique = chosenAmt;
      try {
        db.prepare('UPDATE invoices SET qris_unique_code=?, qris_amount_unique=?, qris_assigned_at=(NOW_LOCAL()) WHERE id=?')
          .run(code, amountUnique, invId);
      } catch (e) {}
    }
  }

  const finalAmount = amountUnique > 0 ? amountUnique : base;
  const raw = String(settings.qris_static_payload || '').trim();
  let payload = '';
  if (raw) {
    try { payload = qrisUtil.convertStaticQrisToDynamic(raw, finalAmount); }
    catch (e) { payload = raw; }
  }
  return { uniqueCode: code, amount: finalAmount, payload };
}

module.exports = { ensureInvoiceQris, isQrisAmountTaken };
