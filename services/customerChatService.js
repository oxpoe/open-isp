/**
 * customerChatService.js — CS WhatsApp berjenjang (segmentasi → menu → verifikasi → AI → admin).
 * AI hanya dipakai sebagai fallback; menu angka menjawab tanpa token.
 */
const db = require('../config/database');
const { getSetting } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const waSvc = require('./whatsappService');
const ticketSvc = require('./ticketService');
const { askAi } = require('./telegramAiService');

const AUTO_CLOSE_MS = 60 * 1000;
const SPAM_WINDOW_MS = 10 * 1000;
const spamHistory = new Map(); // phone -> [{ text, at }]

function companyName() { return getSetting('company_header', 'SKYFIBER'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function normalizePhone(v) {
  let s = String(v || '').replace(/\D/g, '');
  if (s.startsWith('0')) s = '62' + s.slice(1);
  return s;
}
function custCode(c) { return (c && c.customer_code) || ('#' + (c && c.id)); }

const CUSTOMER_SELECT = `
  SELECT c.id, c.name, c.phone, c.customer_code, c.pppoe_username, c.status,
         p.name AS package_name, p.price AS package_price
  FROM customers c LEFT JOIN packages p ON p.id = c.package_id`;

function findCustomerByPhone(phone) {
  const p = normalizePhone(phone);
  if (!p) return null;
  const local = '0' + p.slice(2);
  return db.prepare(`${CUSTOMER_SELECT}
    WHERE c.phone LIKE ? OR c.phone LIKE ? OR c.phone LIKE ? LIMIT 1`)
    .get('%' + p.slice(-8) + '%', '%' + p + '%', '%' + local + '%') || null;
}
function findCustomerById(id) {
  if (!id) return null;
  return db.prepare(`${CUSTOMER_SELECT} WHERE c.id = ?`).get(id) || null;
}
function findCustomers(query) {
  const raw = String(query || '').trim();
  if (!raw) return [];
  const like = '%' + raw.toLowerCase() + '%';
  const digits = raw.replace(/\D/g, '');
  const variants = digits ? [...new Set([digits, digits.replace(/^0/, '62'), digits.replace(/^62/, '0')])] : [];
  const phoneCond = variants.length ? ' OR ' + variants.map(() => 'c.phone LIKE ?').join(' OR ') : '';
  const params = [like, like, like, ...variants.map(v => '%' + v + '%')];
  return db.prepare(`${CUSTOMER_SELECT}
    WHERE LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.customer_code,'')) LIKE ? OR LOWER(COALESCE(c.pppoe_username,'')) LIKE ?${phoneCond}
    LIMIT 6`).all(...params);
}

function unpaidInvoices(customerId) {
  return db.prepare(`SELECT period_month, period_year, amount FROM invoices
    WHERE customer_id = ? AND status NOT IN ('paid','void')
    ORDER BY period_year, period_month`).all(customerId);
}
function billingText(c) {
  if (!c) return 'Data pelanggan belum terverifikasi. Silakan ketik 0 untuk kembali ke awal.';
  const rows = unpaidInvoices(c.id);
  if (!rows.length) return `Halo ${c.name}, saat ini tidak ada tagihan yang belum lunas. Terima kasih.`;
  const total = rows.reduce((n, r) => n + Number(r.amount || 0), 0);
  const lines = rows.map(r => `- ${r.period_month}/${r.period_year}: Rp${Number(r.amount).toLocaleString('id-ID')}`).join('\n');
  return `Halo ${c.name}, tagihan belum lunas:\n${lines}\n\nTotal: Rp${total.toLocaleString('id-ID')}\n\nPembayaran bisa lewat QRIS atau transfer bank. Ketik 0 untuk kembali ke menu.`;
}
function packageText() {
  const rows = db.prepare('SELECT name, price FROM packages WHERE is_active = 1 ORDER BY price ASC LIMIT 12').all();
  if (!rows.length) return 'Informasi paket belum tersedia. Ketik 4 untuk bicara dengan sales/admin.';
  return 'Paket yang tersedia:\n' + rows.map(r => `- ${r.name}: Rp${Number(r.price).toLocaleString('id-ID')}/bulan`).join('\n') +
    '\n\nKetik 2 untuk cek coverage, 3 untuk daftar, atau 4 untuk sales.';
}
function welcome() {
  return `Halo, selamat datang di ${companyName()}.\n\nApakah Anda sudah berlangganan?\n1. Sudah berlangganan\n2. Belum / mau berlangganan\n\nKetik angka pilihan.`;
}
function existingMenu() {
  return 'Baik, silakan pilih:\n1. Keluhan / gangguan\n2. Status layanan\n3. Tagihan & pembayaran\n4. Ubah paket\n5. Bicara dengan admin\n0. Kembali\n\nKetik angka pilihan.';
}
function prospectMenu() {
  return 'Baik, silakan pilih:\n1. Info paket\n2. Cek coverage / pemasangan\n3. Daftar berlangganan\n4. Bicara dengan sales/admin\n0. Kembali\n\nKetik angka pilihan.';
}
function mainMenuFor(c) { return c.segment === 'prospect' ? prospectMenu() : existingMenu(); }

function getConversation(phone) {
  return db.prepare('SELECT * FROM wa_cs_conversations WHERE phone = ?').get(normalizePhone(phone)) || null;
}
function ensureConversation(phone, pushName) {
  const p = normalizePhone(phone);
  let c = getConversation(p);
  if (c) return c;
  const cust = findCustomerByPhone(p);
  db.prepare(`INSERT INTO wa_cs_conversations
      (phone, customer_id, customer_name, segment, state, status, last_message, last_customer_at, updated_at)
      VALUES (?,?,?,?, 'segment', 'segment', '', 0, (NOW_LOCAL()))`)
    .run(p, cust ? cust.id : null, cust ? cust.name : String(pushName || ''), '');
  return getConversation(p);
}
function setConversation(phone, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const sets = keys.map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE wa_cs_conversations SET ${sets}, updated_at = (NOW_LOCAL()) WHERE phone = ?`)
    .run(...keys.map(k => fields[k]), normalizePhone(phone));
  return getConversation(phone);
}

async function reply(c, text) {
  const body = String(text || '').trim();
  if (!body) return;
  // Jeda ala manusia supaya menu/balasan tidak muncul seketika.
  await sleep(600 + Math.min(1200, body.length * 10));
  try {
    await waSvc.sendWhatsAppMessage(c.phone, body);
  } catch (e) {
    logger.error(`[CustomerChat] gagal kirim ke ${c.phone}: ${e.message}`);
  }
}

function isSpam(phone, text) {
  const now = Date.now();
  const list = (spamHistory.get(phone) || []).filter(x => now - x.at < SPAM_WINDOW_MS);
  list.push({ text: String(text || ''), at: now });
  spamHistory.set(phone, list);
  const same = list.filter(x => x.text === String(text || '')).length;
  return same >= 3 || list.length >= 6;
}

function customerContext(c) {
  const cust = findCustomerById(c.customer_id);
  if (!cust) return null;
  const rows = unpaidInvoices(cust.id);
  const total = rows.reduce((n, r) => n + Number(r.amount || 0), 0);
  return {
    customerName: cust.name,
    package: cust.package_name || '-',
    pppoeUsername: cust.pppoe_username || '-',
    customerStatus: cust.status || 'active',
    hasUnpaid: rows.length > 0,
    unpaidCount: rows.length,
    totalUnpaidAmount: total,
    allPaid: rows.length === 0,
    unpaidInvoices: rows.map(r => `${r.period_month}/${r.period_year}: Rp${Number(r.amount).toLocaleString('id-ID')}`).join('\n')
  };
}

async function notifyEscalation(c, reason) {
  try {
    const { notifyAdmin } = require('./telegramBot');
    await notifyAdmin(`CS WhatsApp perlu admin\nNomor: ${c.phone}\nNama: ${c.customer_name || '-'}\nAlasan: ${reason}\n\nBuka Live Chat: /admin/whatsapp/live-chat`);
  } catch (e) { /* notifikasi opsional */ }
}

async function escalate(c, reason) {
  const updated = setConversation(c.phone, { status: 'waiting_admin', state: 'waiting_admin', closed_reason: '' });
  notifyEscalation(updated, reason);
  await reply(updated, 'Mohon maaf, saya belum bisa memastikan jawabannya. Saya teruskan ke admin ya. Mohon menunggu sebentar.');
}

function isConfusedReply(text) {
  const s = String(text || '').trim().toLowerCase();
  if (s.length < 20) return true;
  return /belum paham|tidak paham|tidak mengerti|kurang jelas|bisa dijelaskan|ada yang bisa saya bantu hari ini/.test(s);
}

async function aiFallback(c, text, fromSpam) {
  const q = String(text || '').toLowerCase();
  const cust = findCustomerById(c.customer_id);

  if (fromSpam) await reply(c, 'Baik, saya bantu jawab ya. Mohon tunggu sebentar.');

  // Pertanyaan yang bisa dijawab pasti dari database tidak perlu memanggil AI.
  if (/(tagihan|bayar|lunas|tunggak|invoice)/.test(q)) {
    await reply(c, billingText(cust));
    return;
  }
  if (/(paket|kecepatan|mbps)/.test(q)) {
    await reply(c, packageText());
    return;
  }

  if (Number(c.ai_attempts || 0) >= 2) {
    await escalate(c, 'AI belum memahami pertanyaan pelanggan');
    return;
  }

  let answer = '';
  try {
    answer = await askAi({
      question: text,
      senderName: cust ? cust.name : (c.customer_name || 'Pelanggan'),
      customerContext: customerContext(c),
      isAdmin: false
    });
  } catch (e) {
    logger.warn(`[CustomerChat] AI gagal: ${e.message}`);
  }

  if (!answer || isConfusedReply(answer)) {
    const attempts = Number(c.ai_attempts || 0) + 1;
    setConversation(c.phone, { ai_attempts: attempts, status: 'ai', state: 'ai' });
    if (attempts >= 2) {
      await escalate(c, 'AI belum memahami pertanyaan pelanggan');
    } else {
      await reply(c, 'Maaf, saya belum sepenuhnya paham. Bisa dijelaskan lebih singkat?');
    }
    return;
  }

  setConversation(c.phone, { ai_attempts: 0, status: 'ai', state: 'ai' });
  await reply(c, answer);
}

function createLeadTicket(c, cust, type, text) {
  if (!cust) return null;
  try {
    const info = ticketSvc.createTicket(cust.id, `Permintaan ${type} via WhatsApp`, `[${c.phone}] ${text}`);
    return Number(info.lastInsertRowid) || null;
  } catch (e) {
    logger.warn('[CustomerChat] gagal membuat tiket: ' + e.message);
    return null;
  }
}

async function handleIncoming({ phone, text, pushName }) {
  const p = normalizePhone(phone);
  const t = String(text || '').trim();
  if (!p || !t) return;

  let c = ensureConversation(p, pushName);

  // Nomor bisa saja baru didaftarkan setelah percakapan dibuat.
  if (!c.customer_id) {
    const found = findCustomerByPhone(p);
    if (found) c = setConversation(p, { customer_id: found.id, customer_name: found.name });
  }

  const now = Date.now();
  c = setConversation(p, { last_customer_at: now, last_message: t });

  if (c.status === 'closed') {
    c = setConversation(p, {
      status: 'segment', state: 'segment', segment: '', ticket_id: null,
      ai_attempts: 0, closed_reason: ''
    });
    await reply(c, welcome());
    return;
  }

  if (c.status === 'waiting_admin' || c.status === 'human') {
    if (t === '0') {
      c = setConversation(p, { status: 'menu', state: c.segment === 'prospect' ? 'prospect_menu' : 'existing_menu', ai_attempts: 0 });
      await reply(c, mainMenuFor(c));
    }
    // Pesan lain tetap tersimpan di wa_chat_messages untuk dibaca admin.
    return;
  }

  if (isSpam(p, t)) {
    await aiFallback(c, t, true);
    return;
  }

  if (c.state === 'ai') {
    if (t === '0' || t === '9') {
      c = setConversation(p, { status: 'segment', state: 'segment', segment: '', ai_attempts: 0 });
      await reply(c, welcome());
      return;
    }
    await aiFallback(c, t, false);
    return;
  }

  const cust = findCustomerById(c.customer_id);

  if (c.state === 'complaint') {
    const ticketId = createLeadTicket(c, cust, 'keluhan', t);
    c = setConversation(p, { status: 'waiting_admin', state: 'waiting_admin', ticket_id: ticketId, ai_attempts: 0 });
    notifyEscalation(c, 'Keluhan pelanggan');
    await reply(c, `Terima kasih, keluhan Anda sudah kami catat.\n\nMohon menunggu sebentar, admin akan segera membalas di percakapan ini.`);
    return;
  }

  if (['upgrade', 'coverage', 'registration'].includes(c.state)) {
    const type = c.state === 'upgrade' ? 'ubah paket' : c.state === 'coverage' ? 'coverage' : 'pendaftaran';
    const ticketId = createLeadTicket(c, cust, type, t);
    c = setConversation(p, { status: 'waiting_admin', state: 'waiting_admin', ticket_id: ticketId, ai_attempts: 0 });
    notifyEscalation(c, `Permintaan ${type}`);
    await reply(c, `Terima kasih, permintaan ${type} sudah kami catat.\n\nMohon menunggu sebentar, sales/admin akan segera menghubungi Anda.`);
    return;
  }

  if (c.state === 'verify') {
    if (t === '0') {
      c = setConversation(p, { status: 'segment', state: 'segment', segment: '' });
      await reply(c, welcome());
      return;
    }
    if (t === '2') {
      c = setConversation(p, { segment: 'prospect', status: 'menu', state: 'prospect_menu' });
      await reply(c, prospectMenu());
      return;
    }
    const found = findCustomers(t);
    if (found.length === 1) {
      const m = found[0];
      c = setConversation(p, {
        customer_id: m.id, customer_name: m.name, segment: 'existing',
        status: 'menu', state: 'existing_menu'
      });
      await reply(c, `Data pelanggan ditemukan.\n\nNama: ${m.name}\nID Pelanggan: ${custCode(m)}\n\n` + existingMenu());
      return;
    }
    if (found.length > 1) {
      await reply(c, 'Ditemukan beberapa data:\n' + found.map(x => `- ${x.name} (${custCode(x)})`).join('\n') +
        '\n\nKetik lebih spesifik: ID pelanggan atau nomor HP.');
      return;
    }
    await reply(c, 'Data tidak ditemukan.\n\nKetik 2 untuk daftar sebagai pelanggan baru, atau 0 untuk kembali ke awal.');
    return;
  }

  if (c.state === 'segment' || !c.state) {
    if (t === '1') {
      if (!cust) {
        c = setConversation(p, { status: 'menu', state: 'verify' });
        await reply(c, 'Nomor WhatsApp ini belum terdaftar.\n\nSilakan masukkan Nomor HP / Nama lengkap / ID Pelanggan untuk dicocokkan.');
        return;
      }
      c = setConversation(p, { segment: 'existing', status: 'menu', state: 'existing_menu' });
      await reply(c, `Data pelanggan ditemukan.\n\nNama: ${cust.name}\nID Pelanggan: ${custCode(cust)}\n\n` + existingMenu());
      return;
    }
    if (t === '2') {
      c = setConversation(p, { segment: 'prospect', status: 'menu', state: 'prospect_menu' });
      await reply(c, prospectMenu());
      return;
    }
    await reply(c, welcome());
    return;
  }

  if (c.state === 'prospect_menu') {
    if (t === '1') { await reply(c, packageText()); return; }
    if (t === '2') { setConversation(p, { state: 'coverage' }); await reply(c, 'Silakan tulis alamat / area pemasangan.'); return; }
    if (t === '3') { setConversation(p, { state: 'registration' }); await reply(c, 'Silakan tulis nama, alamat, dan paket yang diinginkan.'); return; }
    if (t === '4') {
      c = setConversation(p, { status: 'waiting_admin', state: 'waiting_admin' });
      notifyEscalation(c, 'Calon pelanggan minta sales');
      await reply(c, 'Baik, saya teruskan ke sales/admin. Mohon menunggu sebentar ya.');
      return;
    }
    if (t === '0') {
      c = setConversation(p, { segment: '', status: 'segment', state: 'segment' });
      await reply(c, welcome());
      return;
    }
    await reply(c, 'Pilihan tidak dikenali.\n\n' + prospectMenu());
    return;
  }

  // existing_menu / menu
  if (t === '1') { setConversation(p, { state: 'complaint' }); await reply(c, 'Silakan tulis keluhan atau gangguan Anda. Bisa juga kirim satu foto.'); return; }
  if (t === '2') {
    const mode = String(getSetting('notice_mode', 'NORMAL')).toUpperCase();
    const note = String(getSetting('notice_note', '') || '').trim();
    await reply(c, `Status layanan: ${mode === 'NORMAL' ? 'NORMAL — tidak ada gangguan massal.' : mode + (note ? ' — ' + note : '')}\n\nKetik 1 jika mengalami gangguan, atau 0 untuk menu.`);
    return;
  }
  if (t === '3') { await reply(c, billingText(cust)); return; }
  if (t === '4') { setConversation(p, { state: 'upgrade' }); await reply(c, 'Silakan tulis paket yang diinginkan.'); return; }
  if (t === '5') {
    c = setConversation(p, { status: 'waiting_admin', state: 'waiting_admin' });
    notifyEscalation(c, 'Pelanggan minta admin');
    await reply(c, 'Baik, saya teruskan ke admin. Mohon menunggu sebentar ya, admin akan segera membalas.');
    return;
  }
  if (t === '0') {
    c = setConversation(p, { segment: '', status: 'segment', state: 'segment' });
    await reply(c, welcome());
    return;
  }
  await reply(c, 'Pilihan tidak dikenali.\n\n' + existingMenu());
}

// ── Admin: ambil alih / kembalikan / tutup ──
async function takeover(phone, opts = {}) {
  const p = normalizePhone(phone);
  let c = ensureConversation(p);
  c = setConversation(p, { status: 'human', state: 'human', closed_reason: '' });
  if (!opts.silent) await reply(c, 'Admin telah mengambil alih percakapan ini. Silakan sampaikan kebutuhan Anda.');
  return c;
}
async function release(phone) {
  const p = normalizePhone(phone);
  let c = ensureConversation(p);
  c = setConversation(p, {
    status: 'menu', state: c.segment === 'prospect' ? 'prospect_menu' : 'existing_menu',
    ai_attempts: 0, last_customer_at: Date.now()
  });
  await reply(c, 'Percakapan dikembalikan ke menu otomatis.\n\n' + mainMenuFor(c));
  return c;
}
async function close(phone, reason = 'Ditutup admin') {
  const p = normalizePhone(phone);
  let c = ensureConversation(p);
  c = setConversation(p, { status: 'closed', state: 'closed', closed_reason: reason, ai_attempts: 0 });
  await reply(c, 'Percakapan ditutup. Terima kasih, jika masih membutuhkan bantuan silakan kirim pesan lagi ya.');
  return c;
}

async function checkAutoClose() {
  const cutoff = Date.now() - AUTO_CLOSE_MS;
  const rows = db.prepare(`SELECT phone FROM wa_cs_conversations
    WHERE status NOT IN ('closed','human') AND last_customer_at > 0 AND last_customer_at <= ?`).all(cutoff);
  for (const row of rows) {
    // Klaim dulu agar tidak dobel kirim bila ada dua proses/interval yang bersamaan.
    const info = db.prepare(`UPDATE wa_cs_conversations
      SET status = 'closed', state = 'closed', closed_reason = 'Tidak ada balasan 1 menit', updated_at = (NOW_LOCAL())
      WHERE phone = ? AND status NOT IN ('closed','human') AND last_customer_at <= ?`).run(row.phone, cutoff);
    if (!info.changes) continue;
    const updated = getConversation(row.phone);
    await reply(updated, 'Percakapan ditutup otomatis karena tidak ada balasan selama 1 menit.\n\nJika masih membutuhkan bantuan, silakan kirim pesan lagi ya.');
  }
}

setInterval(() => { checkAutoClose().catch(e => logger.error('[CustomerChat] auto-close: ' + e.message)); }, 15000).unref();

module.exports = {
  handleIncoming,
  takeover,
  release,
  close,
  getConversation,
  checkAutoClose,
  normalizePhone
};
