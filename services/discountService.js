'use strict';
/**
 * Service: Diskon tagihan (batch & individual) + riwayat.
 * - Diskon persen dihitung dari HARGA DASAR (sebelum PPN/USO).
 * - amount tetap nominal akhir (net) agar alur QRIS/cash/laporan ikut otomatis.
 * - Saat nominal berubah, kode unik QRIS direset agar digenerate ulang.
 */
const db = require('../config/database');
const auditTrail = require('./auditTrailService');

// Ambil total PPN + USO dari catatan AUTO invoice
function parseTaxFromNotes(notes) {
  const s = String(notes || '');
  let tax = 0;
  const grab = (re) => {
    const m = re.exec(s);
    if (m) return Number(String(m[1]).replace(/\./g, '')) || 0;
    return 0;
  };
  tax += grab(/PPN\s+[\d.,]+%\s*\(Rp\s*([\d.]+)\)/i);
  tax += grab(/USO\s+[\d.,]+%\s*\(Rp\s*([\d.]+)\)/i);
  return tax;
}

// Harga dasar = nominal awal (sebelum diskon) dikurangi PPN+USO
function getBaseAmount(inv) {
  const original = Number(inv.amount_before_discount || 0) > 0
    ? Number(inv.amount_before_discount)
    : Number(inv.amount || 0);
  const tax = parseTaxFromNotes(inv.notes);
  return Math.max(0, original - tax);
}

function applyDiscountToInvoice(invoiceId, opts = {}, actor = null) {
  const invId = Number(invoiceId);
  if (!invId) throw new Error('ID tagihan tidak valid');

  const inv = db.prepare('SELECT * FROM invoices WHERE id=?').get(invId);
  if (!inv) throw new Error('Tagihan tidak ditemukan');
  if (inv.status === 'paid') throw new Error('Tagihan sudah lunas, tidak bisa didiskon');
  if (inv.status === 'void') throw new Error('Tagihan sudah dihanguskan');

  const type = opts.type === 'percent' ? 'percent' : 'amount';
  const value = Math.round(Number(opts.value) || 0);
  if (value <= 0) throw new Error('Nilai diskon harus lebih dari 0');
  if (type === 'percent' && value > 100) throw new Error('Diskon persen maksimal 100%');

  const original = Number(inv.amount_before_discount || 0) > 0
    ? Number(inv.amount_before_discount)
    : Number(inv.amount || 0);
  const base = getBaseAmount(inv);

  let discountAmount = type === 'percent'
    ? Math.round(base * (value / 100))
    : value;
  discountAmount = Math.max(0, Math.min(discountAmount, original));
  const newAmount = Math.max(0, original - discountAmount);

  const res = db.prepare(`
    UPDATE invoices SET
      amount = ?,
      amount_before_discount = ?,
      discount_type = ?,
      discount_value = ?,
      discount_amount = ?,
      qris_unique_code = NULL, qris_amount_unique = NULL, qris_assigned_at = NULL
    WHERE id = ? AND status = 'unpaid'
  `).run(newAmount, original, type, value, discountAmount, invId);

  if (!res.changes) throw new Error('Gagal menerapkan diskon (status tagihan berubah)');

  const actorName = (actor && (actor.name || actor.username)) || 'Admin';
  try {
    db.prepare(`
      INSERT INTO discount_logs
        (invoice_id, customer_id, period_month, period_year, discount_type, discount_value,
         discount_amount, amount_before, amount_after, applied_by, note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(invId, inv.customer_id, inv.period_month, inv.period_year, type, value,
      discountAmount, original, newAmount, actorName, String(opts.note || ''));
  } catch (e) { /* log opsional */ }

  if (actor) {
    try {
      auditTrail.logAuditTrail({
        action: 'APPLY_INVOICE_DISCOUNT',
        entity_type: 'invoice',
        entity_id: String(invId),
        actor_type: actor.type || 'admin',
        actor_id: actor.id || null,
        actor_name: actorName,
        details: {
          customer_id: inv.customer_id,
          period: `${inv.period_month}/${inv.period_year}`,
          type, value, discount_amount: discountAmount,
          amount_before: original, amount_after: newAmount
        },
        ip_address: actor.ip || null,
        user_agent: actor.userAgent || null
      });
    } catch (e) {}
  }

  return { invoiceId: invId, customerId: inv.customer_id, periodMonth: inv.period_month, periodYear: inv.period_year, type, value, discountAmount, amountBefore: original, amountAfter: newAmount };
}

/**
 * Terapkan diskon ke banyak pelanggan untuk periode tertentu.
 * opts: { customerIds, all, periodMonth, periodYear, type, value, note, actor }
 */
function applyDiscountBatch(opts = {}) {
  const pMonth = Number(opts.periodMonth) || 0;
  const pYear = Number(opts.periodYear) || 0;
  if (!pMonth || pMonth < 1 || pMonth > 12) throw new Error('Bulan periode tidak valid');
  if (!pYear) throw new Error('Tahun periode tidak valid');

  let ids = Array.isArray(opts.customerIds) ? opts.customerIds.map(Number).filter(n => n > 0) : [];
  if (opts.all) {
    ids = db.prepare("SELECT id FROM customers WHERE status IN ('active','ditangguhkan') AND package_id IS NOT NULL").all().map(r => r.id);
  }
  ids = [...new Set(ids)];
  if (!ids.length) throw new Error('Tidak ada pelanggan yang dipilih');

  const findInv = db.prepare("SELECT id FROM invoices WHERE customer_id=? AND period_month=? AND period_year=? AND status='unpaid' LIMIT 1");
  const summary = { applied: [], skipped: [], totalDiscount: 0, totalCustomers: ids.length };

  for (const cid of ids) {
    const row = findInv.get(cid, pMonth, pYear);
    if (!row) { summary.skipped.push(cid); continue; }
    try {
      const r = applyDiscountToInvoice(row.id, { type: opts.type, value: opts.value, note: opts.note }, opts.actor);
      summary.applied.push(r);
      summary.totalDiscount += r.discountAmount;
    } catch (e) {
      summary.skipped.push(cid);
    }
  }
  return summary;
}

function getDiscountLogs(limit = 100) {
  return db.prepare(`
    SELECT dl.*, c.name as customer_name, c.customer_code, c.phone as customer_phone
    FROM discount_logs dl
    LEFT JOIN customers c ON c.id = dl.customer_id
    ORDER BY dl.id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, parseInt(limit, 10) || 100)));
}

function getInvoiceDiscount(invoiceId) {
  return db.prepare('SELECT amount, amount_before_discount, discount_type, discount_value, discount_amount FROM invoices WHERE id=?').get(Number(invoiceId));
}

module.exports = {
  parseTaxFromNotes,
  getBaseAmount,
  applyDiscountToInvoice,
  applyDiscountBatch,
  getDiscountLogs,
  getInvoiceDiscount
};
