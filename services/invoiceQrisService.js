'use strict';
/**
 * invoiceQrisService.js — pastikan kode unik + payload QRIS dinamis untuk sebuah invoice.
 * QRIS dinamis = QRIS statis (settings.qris_static_payload) + nominal (amount + kode unik).
 */
const db = require('../config/database');
const qrisUtil = require('../utils/qrisUtil');
const { getSettings } = require('../config/settingsManager');

function ensureInvoiceQris(inv) {
  const settings = getSettings() || {};
  const invId = Number((inv && inv.id) || 0);
  const base = Number((inv && inv.amount) || 0);
  if (!invId || base <= 0) return { uniqueCode: 0, amount: base, payload: '' };

  let code = Number(inv.qris_unique_code || 0);
  let amountUnique = Number(inv.qris_amount_unique || 0);

  if (!(amountUnique > 0 && code > 0 && (amountUnique - code) === base)) {
    const exists = db.prepare('SELECT id FROM invoices WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1');
    let chosen = 0, chosenAmt = 0;
    for (let c = 1; c <= 999; c++) {
      const a = base + c;
      if (!exists.get('unpaid', a, invId)) { chosen = c; chosenAmt = a; break; }
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

module.exports = { ensureInvoiceQris };
