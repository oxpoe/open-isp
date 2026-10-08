/**
 * Payment Service (REDESIGN) — hanya MAYAR (Mode 1).
 * Gateway lama (Tripay/Midtrans/Xendit/Duitku) DIHAPUS.
 * Mode 2 = QRIS statis + verifikasi manual (MacroDroid) — lihat customerPortal.js / voucherPaymentService.js.
 */
const mayar = require('./mayarService');

function isMayarConfigured() {
  return mayar.isConfigured();
}

async function createMayarTransaction(invoice, customer, method, appUrl, opts = {}) {
  const o = opts || {};
  const inv = invoice || {};
  const desc = o.itemName || inv.item_name || ('Tagihan ' + (inv.period_month ? inv.period_month + '/' + inv.period_year : ''));
  return mayar.createInvoice({
    name: (customer && customer.name) || 'Pelanggan',
    email: (customer && customer.email) || '',
    mobile: (customer && customer.phone) || '',
    description: desc,
    amount: Number(inv.amount || 0),
    extraData: o.extraData || { invoice_id: String(inv.id || '') }
  });
}

// ── Stub aman untuk fungsi gateway lama (agar require tidak error; pemanggilan = bug) ──
async function getTripayChannels() { return []; }
function verifyTripayWebhook() { return false; }
function verifyMidtransWebhook() { return false; }
function verifyDuitkuWebhook() { return false; }
function _removed(name) { throw new Error('Gateway ' + name + ' sudah dihapus. Gunakan Mayar (Mode 1) atau QRIS statis (Mode 2).'); }
function createTripayTransaction() { return _removed('Tripay'); }
function createMidtransTransaction() { return _removed('Midtrans'); }
function createXenditTransaction() { return _removed('Xendit'); }
function createDuitkuTransaction() { return _removed('Duitku'); }

// ── Mode-aware gateway resolver (dipakai app-customer.js & routes/customerAPI.js) ──
// Mode 1 'gateway' => hanya Mayar (butuh mayar_api_key). Mode 2 'selfservice' => QRIS statis.
function resolveConfiguredGatewayForAmount(settings, amount) {
  const payMode = String((settings && settings.payment_mode) || 'selfservice').toLowerCase();
  if (payMode === 'gateway') {
    return String((settings && settings.mayar_api_key) || '').trim() ? 'mayar' : null;
  }
  if (settings && settings.qris_static_enabled && settings.qris_static_payload) return 'qris_static';
  return null;
}
function resolveConfiguredGateway(settings) {
  return resolveConfiguredGatewayForAmount(settings, 0);
}

module.exports = {
  resolveConfiguredGateway,
  resolveConfiguredGatewayForAmount,
  isMayarConfigured,
  createMayarTransaction,
  getTripayChannels,
  verifyTripayWebhook,
  verifyMidtransWebhook,
  verifyDuitkuWebhook,
  createTripayTransaction,
  createMidtransTransaction,
  createXenditTransaction,
  createDuitkuTransaction
};
