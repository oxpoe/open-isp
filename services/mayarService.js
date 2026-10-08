const axios = require('axios');
const { getSetting } = require('../config/settingsManager');

/**
 * MAYAR.id payment gateway (Mode 1).
 * Docs: https://docs.mayar.id — base https://api.mayar.id/hl/v2
 * Auth: Authorization: Bearer <API_KEY>
 */
const MAYAR_BASE = 'https://api.mayar.id/hl/v2';

function apiKey() {
  return String(getSetting('mayar_api_key', '') || '').trim();
}
function isConfigured() {
  return !!apiKey();
}
function headers() {
  return { Authorization: 'Bearer ' + apiKey(), 'Content-Type': 'application/json', Accept: 'application/json' };
}
function toWaMobile(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d;
}

/**
 * Buat invoice/pembayaran di Mayar.
 * @returns {{success:boolean, order_id:string, link:string, reference:string, payload:object}}
 */
async function createInvoice(opts) {
  const o = opts || {};
  if (!isConfigured()) throw new Error('Mayar belum dikonfigurasi (mayar_api_key kosong).');
  const amount = Math.round(Number(o.amount) || 0);
  if (amount <= 0) throw new Error('Nominal tagihan tidak valid untuk Mayar.');
  const desc = String(o.description || 'Tagihan').slice(0, 200);
  const body = {
    name: String(o.name || 'Pelanggan').slice(0, 100),
    email: String(o.email || ('no-reply+' + Date.now() + '@openisp.local')).slice(0, 120),
    mobile: toWaMobile(o.mobile),
    description: desc,
    items: [{ quantity: 1, rate: amount, description: desc }],
    extraData: o.extraData || {}
  };
  if (o.expiredAt) body.expiredAt = o.expiredAt;

  const res = await axios.post(MAYAR_BASE + '/invoices/create', body, { headers: headers(), timeout: 25000 });
  const d = (res.data && res.data.data) ? res.data.data : (res.data || {});
  const link = d.link || d.paymentLink || d.payment_url || d.url || '';
  const orderId = d.id || d.transactionId || d.paymentLinkId || '';
  if (!link) throw new Error('Mayar tidak mengembalikan link pembayaran.');
  return {
    success: true,
    order_id: String(orderId),
    link: String(link),
    reference: String(d.transactionId || orderId || ''),
    payload: d,
    raw: res.data
  };
}

async function getInvoice(id) {
  const res = await axios.get(MAYAR_BASE + '/invoices/' + encodeURIComponent(id), { headers: headers(), timeout: 20000 });
  return res.data;
}

async function testConnection() {
  if (!isConfigured()) return { ok: false, error: 'API key kosong' };
  try {
    const res = await axios.get(MAYAR_BASE + '/invoices?page=1&pageSize=1', { headers: headers(), timeout: 15000 });
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, error: e && e.response ? ('HTTP ' + e.response.status) : (e.message || String(e)) };
  }
}

module.exports = { isConfigured, createInvoice, getInvoice, testConnection, apiKey };
