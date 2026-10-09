const express = require('express');
const router = express.Router();
const customerDevice = require('../services/customerDeviceService');
const { getSettingsWithCache, getNowLocal, getCurrentTimeInfo, getNowLocalISO, formatDateLocal, formatTimeLocal } = require('../config/settingsManager');
const noticeSvc = require('../services/serviceNoticeService');
const ssidChangeCooldown = new Map(); // key: customer id / loginId -> timestamp terakhir ubah SSID
const registrationService = require('../services/registrationService');
const voucherService = require('../services/voucherService');
const billingSvc = require('../services/billingService');
const pdfSvc = require('../services/pdfInvoiceService');
const paymentSvc = require('../services/paymentService');
const customerSvc = require('../services/customerService');
const mikrotikService = require('../services/mikrotikService');
const { parseMikhmonOnLogin } = require('../utils/mikhmonParser');
const { logger } = require('../config/logger');
const ticketSvc = require('../services/ticketService');
const crypto = require('crypto');
const db = require('../config/database');
const sidebarMenuSvc = require('../services/sidebarMenuService');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const _jimpMod = require('jimp');
const Jimp = _jimpMod.Jimp || _jimpMod;
const qrisUtil = require('../utils/qrisUtil');
const whatsappService = require('../services/whatsappService');
const { BinaryBitmap, HybridBinarizer, RGBLuminanceSource, MultiFormatReader, BarcodeFormat, DecodeHintType } = require('@zxing/library');
let loginRateLimiter = (req, res, next) => next();
try {
  const rlMod = require('../middleware/rateLimiter');
  if (rlMod && typeof rlMod.loginRateLimiter === 'function') {
    loginRateLimiter = rlMod.loginRateLimiter;
  }
} catch (e) {}

// Configure multer for customer photo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/tickets');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'customer-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadCustomer = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan (JPEG, PNG, GIF, WebP)'));
    }
  }
});

const proofStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../public/uploads/payment_proofs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proof-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Hanya file gambar yang diperbolehkan (JPEG, PNG, WebP)'));
    }
  }
});

const waSendDedup = new Map();
function normalizeWaDigits(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) digits = '62' + digits.slice(1);
  if (digits.length < 8) return '';
  return digits;
}
function shouldSendWa(key, ttlMs = 15000) {
  const now = Date.now();
  const last = waSendDedup.get(key);
  if (last && (now - last) < ttlMs) return false;
  waSendDedup.set(key, now);
  if (waSendDedup.size > 5000) {
    for (const [k, t] of waSendDedup.entries()) {
      if ((now - t) > 10 * 60 * 1000) waSendDedup.delete(k);
    }
  }
  return true;
}

/** Cocokkan session login (tag GenieACS / PPPoE / nomor) ke baris customers */
function findCustomerProfileByLoginId(loginId) {
  if (!loginId) return null;
  const cleanLogin = String(loginId).replace(/\D/g, '');
  return customerSvc.getAllCustomers().find((c) => {
    const cleanDb = String(c.phone || '').replace(/\D/g, '');
    return (
      cleanDb === cleanLogin ||
      c.phone === loginId ||
      c.genieacs_tag === loginId ||
      c.pppoe_username === loginId
    );
  }) || null;
}

function buildCustomerDeviceTokens(loginId, profile) {
  const tokenCandidates = [];
  for (const value of [loginId, profile?.phone, profile?.pppoe_username, profile?.genieacs_tag]) {
    const token = String(value ?? '').replace(/[\r\n\t]+/g, '').trim();
    if (token && !tokenCandidates.includes(token)) tokenCandidates.push(token);
  }
  return tokenCandidates;
}

/** Rute portal yang boleh diakses saat status suspended (bayar publik, logout, dll.) */
function isSuspendedPortalExemptPath(reqPath) {
  const p = String(reqPath || '');
  if (
    p === '/login' ||
    p === '/register' ||
    p === '/login-otp' ||
    p === '/logout'
  ) return true;
  if (p.startsWith('/public/')) return true;
  if (p.startsWith('/payment/')) return true;
  const staticPages = ['/tos', '/privacy', '/about', '/contact', '/check-billing', '/voucher'];
  if (staticPages.includes(p)) return true;
  return false;
}

function dashboardNotif(message, type = 'success') {
  if (!message) return null;
  return { text: message, type };
}

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecodeToString(input) {
  const s = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s + '='.repeat(padLen);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signPublicToken(payload, secret) {
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

function verifyPublicToken(token, secret) {
  const raw = String(token || '');
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  const expected = b64urlEncode(crypto.createHmac('sha256', secret).update(body).digest());
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const payload = JSON.parse(b64urlDecodeToString(body));
    if (!payload || typeof payload !== 'object') return null;
    if (!payload.exp || Date.now() > Number(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

// parseMikhmonOnLogin dipindahkan ke utils/mikhmonParser.js (shared utility)
// Dipakai oleh route handler dan voucherCacheWarmer agar konsisten

function normalizeBuyerPhone(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('62')) return digits;
  return '62' + digits;
}

function genRandomCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function genCustomCode(len, charset) {
  const n = Math.max(4, Math.min(16, Number(len) || 6));
  let chars = '0123456789';
  if (charset === 'letters') chars = 'abcdefghjkmnpqrstuvwxyz';
  else if (charset === 'mixed') chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < n; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  if (charset === 'numbers' && out[0] === '0') out = '1' + out.slice(1);
  return out;
}


function isEnabledFlag(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function isGatewayConfigured(settings, gateway) {
  const g = String(gateway || '').toLowerCase();
  if (!settings) return false;
  if (g === 'tripay') {
    return (
      isEnabledFlag(settings.tripay_enabled) &&
      String(settings.tripay_api_key || '').trim() &&
      String(settings.tripay_private_key || '').trim() &&
      String(settings.tripay_merchant_code || '').trim()
    );
  }
  if (g === 'midtrans') {
    return isEnabledFlag(settings.midtrans_enabled) && String(settings.midtrans_server_key || '').trim();
  }
  if (g === 'xendit') {
    return isEnabledFlag(settings.xendit_enabled) && String(settings.xendit_api_key || '').trim();
  }
  if (g === 'duitku') {
    return (
      isEnabledFlag(settings.duitku_enabled) &&
      String(settings.duitku_merchant_code || '').trim() &&
      String(settings.duitku_api_key || '').trim()
    );
  }
  return false;
}

function resolveConfiguredGateway(settings) {
  const def = String(settings?.default_gateway || 'tripay').toLowerCase();
  const order = ['tripay', 'midtrans', 'xendit', 'duitku'];
  if (isGatewayConfigured(settings, def)) return def;
  for (const g of order) {
    if (isGatewayConfigured(settings, g)) return g;
  }
  return null;
}

function resolveConfiguredGatewayForAmount(settings, amount) {
  // MODE-AWARE (baru): 'gateway' => Mayar | 'selfservice' => QRIS statis
  const _payMode = String((settings && settings.payment_mode) || 'selfservice').toLowerCase();
  if (_payMode === 'gateway') {
    return String((settings && settings.mayar_api_key) || '').trim() ? 'mayar' : null;
  }
  if (settings && settings.qris_static_enabled && settings.qris_static_payload) return 'qris_static';
  return null;
  /* eslint-disable no-unreachable */
  const amt = Number(amount || 0) || 0;
  const min = {
    qris_static: 0,  // QRIS Static: minimal 0
    tripay: 0,
    midtrans: 10000,
    xendit: 1000,
    duitku: 1000
  };

  const def = String(settings?.default_gateway || 'tripay').toLowerCase();
  
  // Priority order: default gateway dulu, kemudian fallback ke gateway lain
  const fallbackOrder = ['qris_static', 'tripay', 'xendit', 'duitku', 'midtrans'];

  const ok = (g) => {
    // QRIS Static check
    if (g === 'qris_static') {
      const enabled = settings?.qris_static_enabled && settings?.qris_static_payload;
      if (!enabled) return false;
      const minAmt = min[g] ?? 0;
      return amt >= minAmt;
    }
    
    // Gateway lainnya
    if (!isGatewayConfigured(settings, g)) return false;
    const minAmt = min[g] ?? 0;
    return amt >= minAmt;
  };

  // Cek default gateway dulu
  if (ok(def)) return def;
  
  // Fallback ke gateway lain
  for (const g of fallbackOrder) {
    if (g === def) continue;  // Skip default, sudah dicek
    if (ok(g)) return g;
  }
  
  return null;
}

function tripayMethodCandidatesForAmount(tripayChannels, amount) {
  const amt = Number(amount || 0) || 0;
  const list = Array.isArray(tripayChannels) ? tripayChannels : [];

  const pickNum = (obj, keys) => {
    for (const k of keys) {
      const v = obj?.[k];
      if (v === undefined || v === null || v === '') continue;
      const n = Number(String(v).replace(/[^\d.]/g, ''));
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  };

  const candidates = [];
  for (const ch of list) {
    const code = String(ch?.code || '').toUpperCase();
    if (!code) continue;
    const minAmt = pickNum(ch, ['min_amount', 'minAmount', 'minimum_amount', 'minimumAmount', 'min', 'minimum']);
    const maxAmt = pickNum(ch, ['max_amount', 'maxAmount', 'maximum_amount', 'maximumAmount', 'max', 'maximum']);
    if (minAmt != null && amt < minAmt) continue;
    if (maxAmt != null && amt > maxAmt) continue;
    candidates.push(code);
  }
  return Array.from(new Set(candidates));
}

function getStaticQrisQrUrl(settings) {
  const enabledRaw = settings?.qris_static_enabled;
  if (enabledRaw === false || enabledRaw === 'false' || enabledRaw === 0 || enabledRaw === '0') return '';
  const url = String(settings?.qris_static_qr_url || '').trim();
  return url || '';
}

function normalizeQrisPayloadRaw(raw) {
  let s = String(raw || '').replace(/[\r\n\t]+/g, '').trim();
  const idx = s.indexOf('000201');
  if (idx > 0) s = s.slice(idx);
  const lastCrc = s.lastIndexOf('6304');
  if (lastCrc >= 0 && s.length >= lastCrc + 8) {
    s = s.slice(0, lastCrc + 8);
  }
  return s;
}

function getStaticQrisPayload(settings) {
  const enabledRaw = settings?.qris_static_enabled;
  if (enabledRaw === false || enabledRaw === 'false' || enabledRaw === 0 || enabledRaw === '0') return '';
  return normalizeQrisPayloadRaw(settings?.qris_static_payload || '');
}

let qrisDecodedCache = { file: '', mtimeMs: 0, payload: '' };
async function tryDecodeQrisPayloadFromUploadedQr(settings) {
  const url = getStaticQrisQrUrl(settings);
  const match = url.match(/^\/uploads\/qris\/([^/?#]+)$/i);
  if (!match || !match[1]) return '';
  const safeName = path.basename(String(match[1]));
  const filePath = path.join(__dirname, '../public/uploads/qris', safeName);
  let st = null;
  try {
    st = await fs.promises.stat(filePath);
  } catch {
    return '';
  }
  if (qrisDecodedCache.file === safeName && qrisDecodedCache.mtimeMs === st.mtimeMs && qrisDecodedCache.payload) {
    return qrisDecodedCache.payload;
  }
  try {
    const buf = await fs.promises.readFile(filePath);
    const payload = await qrisUtil.decodeQrisPayloadFromBuffer(buf);
    if (!payload) return '';
    qrisDecodedCache = { file: safeName, mtimeMs: st.mtimeMs, payload };
    return payload;
  } catch {
    return '';
  }
}

async function getStaticQrisQrUrlForAmount(settings, amountUnique) {
  const amt = Math.max(0, Math.floor(Number(amountUnique || 0) || 0));
  if (!amt) return '';
  let payload = getStaticQrisPayload(settings);
  if (!payload) payload = await tryDecodeQrisPayloadFromUploadedQr(settings);
  if (payload) {
    try {
      const dynamic = qrisUtil.convertStaticQrisToDynamic(payload, amt);
      return await QRCode.toDataURL(dynamic, { errorCorrectionLevel: 'M', margin: 1, width: 320 });
    } catch (e) {
      const msg = String(e?.message || e || '');
      const head = payload.slice(0, 24);
      const tail = payload.slice(Math.max(0, payload.length - 24));
      logger.error(`[QRIS] Dynamic QR build failed: ${msg} (payload_len=${payload.length} head=${head} tail=${tail})`);
    }
  }
  return getStaticQrisQrUrl(settings);
}

function getFirstAdminWaDigits(settings) {
  const list = Array.isArray(settings?.whatsapp_admin_numbers) ? settings.whatsapp_admin_numbers : [];
  for (const p of list) {
    const digits = normalizeWaDigits(p);
    if (digits) return digits;
  }
  return '';
}

function getBaseUrl(req, settings) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const base = settings?.app_url ? String(settings.app_url) : `${protocol}://${host}`;
  return base.replace(/\/+$/, '');
}

function isQrisAmountAvailable(amount, opts = {}) {
  const amt = Number(amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) return false;
  const excludeInvoiceId = Number(opts.excludeInvoiceId || 0);
  const excludeVoucherOrderId = Number(opts.excludeVoucherOrderId || 0);

  const inv = db.prepare('SELECT id FROM invoices WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1').get('unpaid', amt, excludeInvoiceId);
  if (inv && inv.id) return false;

  const ord = db.prepare('SELECT id FROM public_voucher_orders WHERE status=? AND qris_amount_unique=? AND id!=? LIMIT 1').get('pending', amt, excludeVoucherOrderId);
  if (ord && ord.id) return false;

  return true;
}

router.get('/qris/static.jpg', async (req, res) => {
  const wantsHtml = () => String(req.get('accept') || '').toLowerCase().includes('text/html');
  const sendPretty = (status, title, detail) => {
    if (!wantsHtml()) return res.status(status).send(title);
    const baseUrl = getBaseUrl(req, getSettingsWithCache());
    const loginLink = `${baseUrl}/customer/login`;
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(status).send(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,Segoe UI,Arial; margin:0; background:#0b1220; color:#e5e7eb} .wrap{max-width:520px;margin:0 auto;padding:24px} .card{background:#0f172a;border:1px solid rgba(148,163,184,.18);border-radius:14px;padding:18px} h1{font-size:18px;margin:0 0 8px} p{margin:0 0 12px;color:#cbd5e1;line-height:1.45} a{display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 14px;border-radius:10px}</style></head><body><div class="wrap"><div class="card"><h1>${title}</h1><p>${detail || ''}</p><a href="${loginLink}">Buka Portal Pelanggan</a></div></div></body></html>`);
  };
  try {
    const amount = Math.max(0, Math.floor(Number(req.query.amount || 0) || 0));
    if (!amount) return sendPretty(400, 'Nominal belum ada', 'Tambahkan parameter amount, contoh: ?amount=3948');
    const settings = getSettingsWithCache();

    let payload = getStaticQrisPayload(settings);
    if (!payload) payload = await tryDecodeQrisPayloadFromUploadedQr(settings);
    if (payload) {
      try {
        const jpg = await qrisUtil.buildDynamicQrisJpgBuffer(payload, amount);
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-store');
        return res.status(200).send(jpg);
      } catch (e) {
        const msg = String(e?.message || e || '');
        const head = payload.slice(0, 24);
        const tail = payload.slice(Math.max(0, payload.length - 24));
        logger.error(`[QRIS] Dynamic QR build failed: ${msg} (payload_len=${payload.length} head=${head} tail=${tail})`);
      }
    }

    const url = getStaticQrisQrUrl(settings);
    if (url) {
      const match = url.match(/^\/uploads\/qris\/([^/?#]+)$/i);
      if (match && match[1]) {
        const safeName = path.basename(match[1]);
        const filePath = path.join(__dirname, '../public/uploads/qris', safeName);
        try {
          await fs.promises.access(filePath, fs.constants.R_OK);
          return res.sendFile(filePath);
        } catch {}
      }
      return res.redirect(url);
    }

    return sendPretty(404, 'QRIS tidak ditemukan', 'QRIS belum diatur oleh admin atau payload QRIS tidak valid.');
  } catch {
    return sendPretty(404, 'QRIS tidak ditemukan', 'Gagal memuat QRIS.');
  }
});

function ensureInvoiceQrisUnique(inv, force = false) {
  const invId = Number(inv?.id || 0);
  if (!Number.isFinite(invId) || invId <= 0) throw new Error('Invoice ID tidak valid');
  if (String(inv?.status) !== 'unpaid') throw new Error('Hanya tagihan BELUM BAYAR yang bisa dibuat kode QRIS.');

  const custId = Number(inv?.customer_id || 0);
  let baseAmount = Number(inv?.amount || 0);

  if (custId > 0) {
    const unpaidInvoices = db.prepare("SELECT amount FROM invoices WHERE customer_id=? AND status='unpaid'").all(custId);
    if (unpaidInvoices && unpaidInvoices.length > 0) {
      const sumAll = unpaidInvoices.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      if (sumAll > 0) baseAmount = sumAll;
    }
  }

  if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error('Nominal tagihan tidak valid');

  const currentAmount = Number(inv?.qris_amount_unique || 0) || 0;
  const currentCode = Number(inv?.qris_unique_code || 0) || 0;
  if (!force && currentAmount > 0 && currentCode > 0 && (currentAmount - currentCode === baseAmount)) {
    return { uniqueCode: currentCode, amountUnique: currentAmount };
  }

  const update = db.prepare(`
    UPDATE invoices
    SET qris_unique_code=?, qris_amount_unique=?, qris_assigned_at=(NOW_LOCAL())
    WHERE id=?
  `);

  let chosenCode = 0;
  let chosenAmount = 0;

  // 1. Prioritaskan ID Pelanggan sebagai kode unik utama (selalu di bawah 500)
  if (custId > 0) {
    const prefCode = (custId % 499 === 0) ? 499 : (custId % 499);
    const prefAmount = baseAmount + prefCode;
    if (isQrisAmountAvailable(prefAmount, { excludeInvoiceId: invId })) {
      chosenCode = prefCode;
      chosenAmount = prefAmount;
    }
  }

  // 2. Jika kode ID Pelanggan sudah terpakai, cari kode terendah yang tersedia (1 s/d 499)
  if (!chosenAmount) {
    for (let code = 1; code <= 499; code++) {
      const amount = baseAmount + code;
      if (isQrisAmountAvailable(amount, { excludeInvoiceId: invId })) {
        chosenCode = code;
        chosenAmount = amount;
        break;
      }
    }
  }

  // 3. Fallback keamanan jika slot 1-499 penuh (500 s/d 999)
  if (!chosenAmount) {
    for (let code = 500; code <= 999; code++) {
      const amount = baseAmount + code;
      if (isQrisAmountAvailable(amount, { excludeInvoiceId: invId })) {
        chosenCode = code;
        chosenAmount = amount;
        break;
      }
    }
  }

  if (!chosenAmount) throw new Error('Gagal membuat nominal unik (slot 1-999 penuh).');
  update.run(chosenCode, chosenAmount, invId);

  return { uniqueCode: chosenCode, amountUnique: chosenAmount };
}

function ensureVoucherOrderQrisUnique(order, force = false) {
  const orderId = Number(order?.id || 0);
  if (!Number.isFinite(orderId) || orderId <= 0) throw new Error('Order ID tidak valid');
  if (String(order?.status) !== 'pending') throw new Error('Hanya pesanan PENDING yang bisa dibuat kode QRIS.');

  const baseAmount = Number(order?.price || 0);
  if (!Number.isFinite(baseAmount) || baseAmount <= 0) throw new Error('Harga voucher tidak valid');

  const currentAmount = Number(order?.qris_amount_unique || 0) || 0;
  const currentCode = Number(order?.qris_unique_code || 0) || 0;
  if (!force && currentAmount > 0 && currentCode > 0) {
    return { uniqueCode: currentCode, amountUnique: currentAmount };
  }

  const update = db.prepare(`
    UPDATE public_voucher_orders
    SET qris_unique_code=?, qris_amount_unique=?, qris_assigned_at=(NOW_LOCAL()), updated_at=(NOW_LOCAL())
    WHERE id=?
  `);

  let chosenCode = 0;
  let chosenAmount = 0;

  // Search sequentially from 1 to 499 (always under 500)
  for (let code = 1; code <= 499; code++) {
    const amount = baseAmount + code;
    if (isQrisAmountAvailable(amount, { excludeVoucherOrderId: orderId })) {
      chosenCode = code;
      chosenAmount = amount;
      break;
    }
  }

  // Safety fallback if 1-499 full
  if (!chosenAmount) {
    for (let code = 500; code <= 999; code++) {
      const amount = baseAmount + code;
      if (isQrisAmountAvailable(amount, { excludeVoucherOrderId: orderId })) {
        chosenCode = code;
        chosenAmount = amount;
        break;
      }
    }
  }

  if (!chosenAmount) throw new Error('Gagal membuat nominal unik (slot 1-999 penuh).');
  update.run(chosenCode, chosenAmount, orderId);

  return { uniqueCode: chosenCode, amountUnique: chosenAmount };
}

function qrisDefaultExpiresAtIso() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}

function resolvePaymentExpiresAt(gateway, result) {
  const g = String(gateway || '').toLowerCase();
  const p = result && result.payload ? result.payload : null;

  const tryDate = (v) => {
    const t = new Date(v);
    const ms = t.getTime();
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return t.toISOString();
  };

  const tryUnix = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    const out = d.getTime();
    if (!Number.isFinite(out) || out <= 0) return null;
    return d.toISOString();
  };

  if (p && g === 'tripay') {
    return (
      tryUnix(p.expired_time ?? p.expiredTime) ||
      tryDate(p.expired_at ?? p.expiredAt) ||
      tryDate(p.expiry_date ?? p.expiryDate) ||
      null
    );
  }

  if (p && g === 'xendit') {
    return (
      tryDate(p.expiry_date ?? p.expiryDate) ||
      tryDate(p.expiration_date ?? p.expirationDate) ||
      null
    );
  }

  if (p && g === 'duitku') {
    return (
      tryDate(p.expiry_date ?? p.expiryDate) ||
      tryUnix(p.expired_time ?? p.expiredTime) ||
      null
    );
  }

  if (p && g === 'midtrans') {
    return (
      tryDate(p.expiry_time ?? p.expiryTime) ||
      tryDate(p.expired_at ?? p.expiredAt) ||
      null
    );
  }

  return null;
}

function gatewayDefaultExpiresAtIso(gateway, nowMs = Date.now()) {
  const g = String(gateway || '').toLowerCase();
  const base = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();

  if (g === 'xendit') return new Date(base + 86400 * 1000).toISOString();
  if (g === 'duitku') return new Date(base + 1440 * 60 * 1000).toISOString();
  return null;
}

const pppoeTrafficSamples = new Map();

function prunePppoeTrafficSamples(now) {
  const maxAgeMs = 3 * 60 * 1000;
  for (const [k, v] of pppoeTrafficSamples.entries()) {
    if (!v || !v.t || now - v.t > maxAgeMs) pppoeTrafficSamples.delete(k);
  }
}

function numField(obj, keys) {
  for (const k of keys) {
    const v = obj && (obj[k] ?? obj[String(k)]);
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function strField(obj, keys) {
  for (const k of keys) {
    const v = obj && (obj[k] ?? obj[String(k)]);
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

async function invokeRouterOsMenuCommand(menu, command, args) {
  if (!menu) return null;
  if (typeof menu.call === 'function') return await menu.call(command, args);
  if (typeof menu.command === 'function') return await menu.command(command, args);
  if (typeof menu.run === 'function') return await menu.run(command, args);
  return null;
}

// Route: Syarat & Ketentuan (TOS)
router.get('/tos', (req, res) => {
  const settings = getSettingsWithCache();
  res.render('tos', { 
    settings, 
    company: settings.company_header || 'ISP Kami',
    isLoggedIn: !!req.session.phone 
  });
});

// Route: Kebijakan Privasi
router.get('/privacy', (req, res) => {
  const settings = getSettingsWithCache();
  res.render('privacy', { 
    settings, 
    company: settings.company_header || 'ISP Kami',
    isLoggedIn: !!req.session.phone 
  });
});

// Route: Tentang Kami
router.get('/about', (req, res) => {
  const settings = getSettingsWithCache();
  res.render('about', { 
    settings, 
    company: settings.company_header || 'ISP Kami',
    isLoggedIn: !!req.session.phone 
  });
});

// Route: Kontak Support
router.get('/contact', (req, res) => {
  const settings = getSettingsWithCache();
  res.render('contact', { 
    settings, 
    company: settings.company_header || 'ISP Kami',
    isLoggedIn: !!req.session.phone 
  });
});

const {
  findDeviceByTag,
  findDeviceByPppoe,
  getCustomerDeviceData,
  fallbackCustomer,
  updateSSID,
  updatePassword,
  requestReboot,
  updateCustomerTag
} = customerDevice;

router.get('/', (req, res) => {
  if (req.session && (req.session.customer || req.session.phone)) {
    return res.redirect('/customer/dashboard');
  }
  return res.redirect('/customer/login');
});

router.get('/login', (req, res) => {
  if (req.session && (req.session.customer || req.session.phone)) {
    return res.redirect('/customer/dashboard');
  }
  const settings = getSettingsWithCache();
  const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
  res.render('login', { error: null, settings, packages });
});

router.get('/check-billing', async (req, res) => {
  const settings = getSettingsWithCache();
  const query = String(req.query.q || '').trim();
  const error = String(req.query.err || '').trim() || null;
  const info = String(req.query.info || '').trim() || null;

  let customer = null;
  let invoices = [];
  let unpaidInvoices = [];
  let invoiceTokens = {};
  let matches = [];
  let paymentChannels = [];

  const gateway = resolveConfiguredGateway(settings);
  if (gateway === 'tripay') {
    try {
      paymentChannels = await paymentSvc.getTripayChannels();
    } catch {
      paymentChannels = [];
    }
  } else if (gateway) {
    const base = [
      { code: 'QRIS', name: 'QRIS', group: 'QRIS', active: true },
      { code: 'BCAVA', name: 'BCA Virtual Account', group: 'Virtual Account', active: true },
      { code: 'BNIVA', name: 'BNI Virtual Account', group: 'Virtual Account', active: true },
      { code: 'BRIVA', name: 'BRI Virtual Account', group: 'Virtual Account', active: true },
      { code: 'PERMATAVA', name: 'Permata Virtual Account', group: 'Virtual Account', active: true },
      { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', group: 'Virtual Account', active: true }
    ];
    if (gateway === 'midtrans') paymentChannels = [{ code: 'SNAP', name: 'Semua Metode (Snap)', group: 'E-Wallet', active: true }, ...base];
    else if (gateway === 'xendit') paymentChannels = [{ code: 'XENDIT', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
    else if (gateway === 'duitku') paymentChannels = [{ code: 'DUITKU', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
  }

  if (query) {
    customer = customerSvc.findCustomerByAny(query);
    if (customer) {
      const lookup = customer.pppoe_username || customer.genieacs_tag || customer.phone || String(customer.id);
      invoices = billingSvc.getInvoicesByAny(lookup) || [];
      unpaidInvoices = invoices.filter(i => i.status === 'unpaid');

      const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
      const exp = Date.now() + 15 * 60 * 1000;
      invoiceTokens = unpaidInvoices.reduce((acc, inv) => {
        acc[String(inv.id)] = signPublicToken(
          { invoiceId: Number(inv.id), customerId: Number(inv.customer_id), lookup, exp },
          secret
        );
        return acc;
      }, {});
    } else {
      const invs = billingSvc.getInvoicesByAny(query) || [];
      const unpaid = (Array.isArray(invs) ? invs : []).filter(i => i && i.status === 'unpaid');
      const map = new Map();
      for (const inv of unpaid) {
        const customerId = Number(inv.customer_id || 0);
        if (!Number.isFinite(customerId) || customerId <= 0) continue;
        const prev = map.get(customerId) || {
          customer_id: customerId,
          customer_name: inv.customer_name || '-',
          customer_phone: inv.customer_phone || '',
          unpaid_count: 0,
          total_amount: 0
        };
        prev.unpaid_count += 1;
        prev.total_amount += Number(inv.amount || 0) || 0;
        map.set(customerId, prev);
      }
      matches = Array.from(map.values()).sort((a, b) => {
        const au = Number(a.unpaid_count || 0);
        const bu = Number(b.unpaid_count || 0);
        if (au !== bu) return bu - au;
        return String(a.customer_name || '').localeCompare(String(b.customer_name || ''), 'id');
      });
    }
  }

  res.render('public_check_billing', {
    settings,
    query,
    customer,
    invoices,
    unpaidInvoices,
    invoiceTokens,
    matches,
    paymentChannels,
    error,
    info
  });
});

// Simpan hasil query profile terakhir yang berhasil (last-known-good)
// Dipakai sebagai fallback jika MikroTik timeout/gagal sesaat
// Bukan cache permanen — hilang saat server restart
let _voucherLastGoodProfiles = null;

router.get('/voucher', async (req, res) => {
  const settings = getSettingsWithCache();
  const error = String(req.query.err || '').trim() || null;
  const info = String(req.query.info || '').trim() || null;

  const getConfiguredVoucherPrice = (routerId, profileName) => {
    const rid = routerId === undefined ? null : routerId;
    const name = String(profileName || '').trim();
    if (!name) return null;
    try {
      // ── Cek voucher_packages ──────────────────
      const pkgRow = db.prepare(`
        SELECT price, validity
        FROM voucher_packages
        WHERE router_id IS ? AND profile_name = ? AND is_active = 1
        LIMIT 1
      `).get(rid, name);
      if (pkgRow) {
        const price = Number(pkgRow.price || 0) || 0;
        const validity = String(pkgRow.validity || '').trim();
        if (price > 0) return { price, validity };
      }

      // ── Fallback: voucher_batches ──────────────────
      const row = db.prepare(`
        SELECT price, validity
        FROM voucher_batches
        WHERE router_id IS ? AND profile_name = ? AND price > 0
        ORDER BY id DESC
        LIMIT 1
      `).get(rid, name);
      if (!row) return null;
      const price = Number(row.price || 0) || 0;
      const validity = String(row.validity || '').trim();
      if (price <= 0) return null;
      return { price, validity };
    } catch {
      return null;
    }
  };

  /**
   * Ambil voucher profiles — LANGSUNG dari database lokal (voucher_batches).
   * Tidak perlu koneksi ke MikroTik. Instan < 1ms karena SQLite lokal.
   * Profile dengan nama 'default' difilter otomatis.
   */
  const getVoucherProfiles = async () => {
    try {
      // ── SUMBER UTAMA: voucher_packages di SQLite lokal ──────────────────
      const activePackages = db.prepare(`
        SELECT router_id, profile_name, price, validity
        FROM voucher_packages
        WHERE is_active = 1
          AND LOWER(TRIM(profile_name)) != 'default'
        ORDER BY price ASC
      `).all();

      if (activePackages.length > 0) {
        const profiles = activePackages.map(row => ({
          name: String(row.profile_name || '').trim(),
          price: Number(row.price || 0),
          validity: String(row.validity || '-').trim() || '-',
          router_id: row.router_id ?? null
        })).filter(p => p.name && p.price > 0);

        logger.info(`[Voucher] DB-first: ${profiles.length} profile dari voucher_packages`);
        if (profiles.length > 0) {
          _voucherLastGoodProfiles = profiles;
          return profiles;
        }
      }

      // ── FALLBACK 1: voucher_batches di SQLite lokal ──────────────────
      // Ambil profile unik dengan harga terbaru (id MAX per profile_name)
      // Filter: price > 0 dan bukan nama 'default'
      const dbRows = db.prepare(`
        SELECT router_id, profile_name, price, validity
        FROM voucher_batches
        WHERE price > 0
          AND LOWER(TRIM(profile_name)) != 'default'
        GROUP BY profile_name
        HAVING id = MAX(id)
        ORDER BY price ASC
      `).all();

      if (dbRows.length > 0) {
        const profiles = dbRows.map(row => ({
          name: String(row.profile_name || '').trim(),
          price: Number(row.price || 0),
          validity: String(row.validity || '-').trim() || '-',
          router_id: row.router_id ?? null
        })).filter(p => p.name && p.price > 0);

        logger.info(`[Voucher] Fallback: ${profiles.length} profile dari voucher_batches`);

        if (profiles.length > 0) {
          _voucherLastGoodProfiles = profiles;
          return profiles;
        }
      }

      logger.warn('[Voucher] voucher_batches kosong atau tidak ada harga — coba last-known-good');

      // ── FALLBACK: last-known-good dari query sebelumnya ────────────────
      if (_voucherLastGoodProfiles && _voucherLastGoodProfiles.length > 0) {
        return _voucherLastGoodProfiles;
      }

      // ── LAST RESORT: coba MikroTik dengan timeout singkat 3 detik ──────
      logger.warn('[Voucher] Fallback ke MikroTik (last resort)...');
      const mikrotikHost = settings.mikrotik_host;
      const mikrotikUser = settings.mikrotik_user;
      const mikrotikPassword = settings.mikrotik_password;
      if (!mikrotikHost || !mikrotikUser || !mikrotikPassword) return [];

      const routers = mikrotikService.getAllRouters().filter(r => r.is_active);
      const routerList = routers.length > 0 ? routers : [{ id: null, name: 'default' }];

      const mikrotikResults = await Promise.allSettled(
        routerList.map(r =>
          Promise.race([
            mikrotikService.getHotspotUserProfiles(r.id),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
          ])
        )
      );

      const bestByName = new Map();
      for (let i = 0; i < mikrotikResults.length; i++) {
        const result = mikrotikResults[i];
        if (result.status !== 'fulfilled' || !Array.isArray(result.value)) continue;
        for (const p of result.value) {
          const name = String(p?.name || '').trim();
          if (!name || name.toLowerCase() === 'default') continue;
          const meta = parseMikhmonOnLogin(String(p?.onLogin || p?.['on-login'] || ''));
          const price = Number(meta?.price || 0) || 0;
          const validity = String(meta?.validity || '').trim();
          if (price <= 0) continue;
          if (!bestByName.has(name) || price < Number(bestByName.get(name).price || 0)) {
            bestByName.set(name, { name, price, validity: validity || '-', router_id: routerList[i].id ?? null });
          }
        }
      }

      const fallback = Array.from(bestByName.values()).sort((a, b) => a.price - b.price);
      if (fallback.length > 0) _voucherLastGoodProfiles = fallback;
      logger.info(`[Voucher] MikroTik fallback: ${fallback.length} profile`);
      return fallback;

    } catch (e) {
      logger.error('[Voucher] Error getVoucherProfiles: ' + e.message);
      return _voucherLastGoodProfiles || [];
    }
  };


  const resolveVoucherGateway = () => {
    return resolveConfiguredGateway(settings);
  };

  // Cache untuk payment channels
  // Set PAYMENT_CACHE_DURATION = 0 untuk disable cache
  const PAYMENT_CACHE_KEY = 'voucher_payment_channels_cache';
  const PAYMENT_CACHE_DURATION = 60 * 1000; // 1 menit (payment channels jarang berubah)
  
  const getVoucherPaymentChannels = async () => {
    // Cek apakah ada gateway yang aktif
    const gateway = resolveVoucherGateway();
    if (!gateway) {
      return [];
    }
    
    // Cek cache terlebih dahulu (skip jika PAYMENT_CACHE_DURATION = 0)
    const cacheKey = `${PAYMENT_CACHE_KEY}_${gateway}`;
    if (PAYMENT_CACHE_DURATION > 0) {
      const cached = global[cacheKey];
      if (cached && (Date.now() - cached.timestamp) < PAYMENT_CACHE_DURATION) {
        logger.debug('[Voucher] Using cached payment channels');
        return cached.data;
      }
    }
    
    let channels = [];
    
    if (gateway === 'tripay') {
      try {
        // Timeout 1.5 detik untuk Tripay (lebih agresif)
        channels = await Promise.race([
          paymentSvc.getTripayChannels(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500))
        ]);
      } catch (e) {
        logger.warn('[Voucher] Tripay channels fetch failed or timeout: ' + e.message);
        channels = [];
      }
    } else {
      // Gateway lain tidak perlu query API, langsung return hardcoded
      const base = [
        { code: 'QRIS', name: 'QRIS', group: 'QRIS', active: true },
        { code: 'BCAVA', name: 'BCA Virtual Account', group: 'Virtual Account', active: true },
        { code: 'BNIVA', name: 'BNI Virtual Account', group: 'Virtual Account', active: true },
        { code: 'BRIVA', name: 'BRI Virtual Account', group: 'Virtual Account', active: true },
        { code: 'PERMATAVA', name: 'Permata Virtual Account', group: 'Virtual Account', active: true },
        { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', group: 'Virtual Account', active: true }
      ];
      if (gateway === 'midtrans') channels = [{ code: 'SNAP', name: 'Semua Metode (Snap)', group: 'E-Wallet', active: true }, ...base];
      else if (gateway === 'xendit') channels = [{ code: 'XENDIT', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
      else if (gateway === 'duitku') channels = [{ code: 'DUITKU', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
      else channels = base;
    }
    
    // Simpan ke cache (jika enabled)
    if (PAYMENT_CACHE_DURATION > 0) {
      global[cacheKey] = {
        data: channels,
        timestamp: Date.now()
      };
      logger.debug(`[Voucher] Cached ${channels.length} payment channels for ${PAYMENT_CACHE_DURATION/1000}s`);
    }
    
    return channels;
  };

  // OPTIMASI UTAMA: Parallel execution untuk profiles dan payment channels
  // Tidak perlu menunggu satu selesai baru eksekusi yang lain
  const [profiles, paymentChannels] = await Promise.all([
    getVoucherProfiles().catch(e => {
      logger.error('[Voucher] Error getting profiles: ' + e.message);
      return [];
    }),
    getVoucherPaymentChannels().catch(e => {
      logger.error('[Voucher] Error getting payment channels: ' + e.message);
      return [];
    })
  ]);

  let order = null;
  let orderToken = null;
  const orderId = Number(req.query.order || 0);
  if (orderId) {
    const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
    const payload = verifyPublicToken(req.query.t, secret);
    if (payload && Number(payload.voucherOrderId) === orderId) {
      order = db.prepare('SELECT * FROM public_voucher_orders WHERE id = ?').get(orderId) || null;
      orderToken = String(req.query.t || '') || null;
    }
  }

  res.render('public_voucher', {
    settings,
    profiles,
    paymentChannels,
    order,
    orderToken,
    error,
    info
  });
});

router.get('/voucher/qris/:orderId', async (req, res) => {
  const settings = getSettingsWithCache();
  const orderId = Number(req.params.orderId || 0);
  const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
  const payload = verifyPublicToken(req.query.t, secret);
  if (!payload || Number(payload.voucherOrderId) !== orderId) {
    return res.redirect('/customer/voucher?err=' + encodeURIComponent('Link voucher tidak valid atau sudah kadaluarsa'));
  }

  try {
    const order = db.prepare('SELECT * FROM public_voucher_orders WHERE id = ?').get(orderId);
    if (!order) throw new Error('Order tidak ditemukan');
    if (String(order.status) === 'fulfilled' && order.voucher_code) {
      return res.redirect('/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(String(req.query.t || '')));
    }
    if (String(order.status) !== 'pending') {
      return res.redirect('/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(String(req.query.t || '')));
    }

    const { uniqueCode, amountUnique } = ensureVoucherOrderQrisUnique(order, false);
    const qrisQrUrl = await getStaticQrisQrUrlForAmount(settings, amountUnique);
    if (!qrisQrUrl) throw new Error('QRIS statis belum diatur oleh admin');
    const adminWaDigits = getFirstAdminWaDigits(settings);

    return res.render('qris_static', {
      settings,
      backUrl: '/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(String(req.query.t || '')),
      error: null,
      info: null,
      kind: 'voucher',
      invoiceId: Number(orderId),
      periodText: `${order.profile_name || ''}${order.validity ? ' • ' + String(order.validity) : ''}`,
      customerName: order.buyer_phone ? `WA: ${order.buyer_phone}` : 'Pembeli Voucher',
      amountUnique,
      uniqueCode,
      qrisQrUrl,
      helpText: 'Setelah transfer, sistem akan otomatis memproses voucher jika notifikasi masuk.',
      adminWaDigits,
      publicToken: String(req.query.t || ''),
      proofUrl: String(order.proof_url || ''),
      proofActionUrl: '/customer/voucher/proof/' + encodeURIComponent(String(orderId))
    });
  } catch (e) {
    return res.redirect('/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(String(req.query.t || '')) + '&err=' + encodeURIComponent(String(e?.message || e || 'Gagal')));
  }
});
// API endpoint untuk cek status voucher order (untuk auto-polling di halaman QRIS)
router.get('/voucher/status/:orderId', async (req, res) => {
  const settings = getSettingsWithCache();
  const orderId = Number(req.params.orderId || 0);
  const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
  const payload = verifyPublicToken(req.query.t, secret);

  if (!payload || Number(payload.voucherOrderId) !== orderId) {
    return res.status(403).json({ error: 'Forbidden', status: 'error' });
  }

  try {
    const order = db.prepare('SELECT id, status, voucher_code FROM public_voucher_orders WHERE id = ?').get(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order tidak ditemukan', status: 'error' });
    }

    return res.json({
      success: true,
      status: String(order.status || 'pending'),
      voucher_code: String(order.status) === 'fulfilled' ? order.voucher_code : null
    });
  } catch (e) {
    logger.error(`[VOUCHER-STATUS] Error: ${e && e.message ? e.message : String(e)}`);
    return res.status(500).json({ error: 'Internal error', status: 'error' });
  }
});


router.post('/public/voucher/create-payment', async (req, res) => {
  const settings = getSettingsWithCache();

  const buyerPhone = normalizeBuyerPhone(req.body.buyer_phone);
  const profileName = String(req.body.profile_name || '').trim();
  const tosChecked = req.body.tos === 'on' || req.body.tos === '1' || req.body.tos === true || req.body.tos === 'true';

  if (!buyerPhone) return res.redirect('/customer/voucher?err=' + encodeURIComponent('Nomor WhatsApp tidak valid'));
  if (!profileName) return res.redirect('/customer/voucher?err=' + encodeURIComponent('Pilih paket voucher terlebih dahulu'));
  if (!tosChecked) return res.redirect('/customer/voucher?err=' + encodeURIComponent('Harap centang persetujuan Syarat & Ketentuan (TOS) untuk melanjutkan.'));

  const getConfiguredVoucherPrice = (routerId, profileName) => {
    const rid = routerId === undefined ? null : routerId;
    const name = String(profileName || '').trim();
    if (!name) return null;
    try {
      // ── Cek voucher_packages ──────────────────
      const pkgRow = db.prepare(`
        SELECT price, validity
        FROM voucher_packages
        WHERE router_id IS ? AND profile_name = ? AND is_active = 1
        LIMIT 1
      `).get(rid, name);
      if (pkgRow) {
        const price = Number(pkgRow.price || 0) || 0;
        const validity = String(pkgRow.validity || '').trim();
        if (price > 0) return { price, validity };
      }

      // ── Fallback: voucher_batches ──────────────────
      const row = db.prepare(`
        SELECT price, validity
        FROM voucher_batches
        WHERE router_id IS ? AND profile_name = ? AND price > 0
        ORDER BY id DESC
        LIMIT 1
      `).get(rid, name);
      if (!row) return null;
      const price = Number(row.price || 0) || 0;
      const validity = String(row.validity || '').trim();
      if (price <= 0) return null;
      return { price, validity };
    } catch {
      return null;
    }
  };

  let selected = null;
  let selectedRouterId = null;
  try {
    const routers = mikrotikService.getAllRouters().filter(r => r.is_active);
    const routerList = routers.length > 0 ? routers : [{ id: null }];

    for (const router of routerList) {
      try {
        const raw = await mikrotikService.getHotspotUserProfiles(router.id);
        const list = Array.isArray(raw) ? raw : [];
        const found = list.find(p => String(p?.name || '').trim() === profileName);
        if (!found) continue;
        const meta = parseMikhmonOnLogin(found.onLogin || found['on-login'] || '');
        let price = Number(meta?.price || 0) || 0;
        let validity = String(meta?.validity || '').trim();
        if (price <= 0 || !validity) {
          const configured = getConfiguredVoucherPrice(router.id ?? null, profileName);
          if (configured) {
            price = Number(configured.price || 0) || 0;
            validity = String(configured.validity || '').trim();
          }
        }
        if (price > 0) {
          const candidate = { name: profileName, validity: validity || '-', price };
          if (!selected || Number(candidate.price) < Number(selected.price || 0)) {
            selected = candidate;
            selectedRouterId = router.id || null;
          }
        }
      } catch {}
    }
  } catch {
    selected = null;
  }

  // ── Robust DB Fallback ──────────────────
  if (!selected) {
    logger.warn(`[Voucher] Resolving profile '${profileName}' from MikroTik failed or timed out. Falling back to local DB...`);
    const configured = getConfiguredVoucherPrice(null, profileName);
    if (configured) {
      selected = {
        name: profileName,
        validity: configured.validity || '-',
        price: configured.price
      };
      selectedRouterId = null;
    } else {
      try {
        const anyPkg = db.prepare(`
          SELECT price, validity, router_id
          FROM voucher_packages
          WHERE profile_name = ? AND is_active = 1
          LIMIT 1
        `).get(profileName);
        if (anyPkg && Number(anyPkg.price) > 0) {
          selected = {
            name: profileName,
            validity: anyPkg.validity || '-',
            price: Number(anyPkg.price)
          };
          selectedRouterId = anyPkg.router_id ?? null;
        } else {
          const anyBatch = db.prepare(`
            SELECT price, validity, router_id
            FROM voucher_batches
            WHERE profile_name = ? AND price > 0
            ORDER BY id DESC
            LIMIT 1
          `).get(profileName);
          if (anyBatch) {
            selected = {
              name: profileName,
              validity: anyBatch.validity || '-',
              price: Number(anyBatch.price)
            };
            selectedRouterId = anyBatch.router_id ?? null;
          }
        }
      } catch (err) {
        logger.error(`[Voucher] Fallback DB resolution error: ${err.message}`);
      }
    }
  }

  if (!selected) return res.redirect('/customer/voucher?err=' + encodeURIComponent('Profile voucher tidak ditemukan'));
  if (!Number.isFinite(selected.price) || selected.price <= 0) return res.redirect('/customer/voucher?err=' + encodeURIComponent('Harga voucher tidak valid'));

  try {
    const ins = db.prepare(`
      INSERT INTO public_voucher_orders (router_id, profile_name, validity, price, buyer_phone, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(selectedRouterId, selected.name, selected.validity || '', Math.floor(selected.price), buyerPhone);
    const orderId = Number(ins.lastInsertRowid);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const appUrl = settings.app_url || `${protocol}://${host}`;

    let method = String(req.body.method || 'QRIS').toUpperCase();
    if (method === 'QRIS_STATIC') {
      const hasStaticQris = !!(getStaticQrisQrUrl(settings) || getStaticQrisPayload(settings));
      if (!hasStaticQris) throw new Error('QRIS statis belum diatur oleh admin');

      const orderRow = db.prepare('SELECT * FROM public_voucher_orders WHERE id=?').get(orderId);
      const { uniqueCode, amountUnique } = ensureVoucherOrderQrisUnique(orderRow, false);

      const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
      const token = signPublicToken({ voucherOrderId: orderId, exp: Date.now() + 24 * 60 * 60 * 1000 }, secret);

      db.prepare(`
        UPDATE public_voucher_orders SET
          payment_gateway = ?,
          payment_order_id = ?,
          payment_link = ?,
          payment_reference = ?,
          payment_payload = ?,
          payment_expires_at = ?,
          qris_unique_code = ?,
          qris_amount_unique = ?,
          qris_assigned_at = COALESCE(qris_assigned_at, (NOW_LOCAL())),
          updated_at = (NOW_LOCAL())
        WHERE id = ?
      `).run(
        'qris_static',
        '',
        '',
        '',
        null,
        qrisDefaultExpiresAtIso(),
        uniqueCode,
        amountUnique,
        orderId
      );

      return res.redirect('/customer/voucher/qris/' + encodeURIComponent(String(orderId)) + '?t=' + encodeURIComponent(token));
    }

    const gateway = resolveConfiguredGatewayForAmount(settings, selected.price);
    if (!gateway) throw new Error('Payment gateway belum dikonfigurasi atau nominal terlalu kecil untuk gateway aktif');
    let tripayChannels = null;
    let tripayCandidates = null;

    if (gateway === 'tripay') {
      try {
        tripayChannels = await paymentSvc.getTripayChannels();
        const allowedList = (tripayChannels || []).map(c => String(c?.code || '').toUpperCase()).filter(Boolean);
        tripayCandidates = tripayMethodCandidatesForAmount(tripayChannels, selected.price);
        if (!tripayCandidates || tripayCandidates.length === 0) tripayCandidates = allowedList;
        const allowed = new Set(tripayCandidates);
        if (!allowed.has(method)) method = tripayCandidates[0] || 'QRIS';
      } catch {
        method = 'QRIS';
      }
    } else if (gateway === 'midtrans') {
      const allowed = new Set(['SNAP', 'QRIS', 'BCAVA', 'BNIVA', 'BRIVA', 'PERMATAVA', 'MANDIRIVA']);
      if (!allowed.has(method)) method = 'SNAP';
    } else if (gateway === 'xendit') {
      const allowed = new Set(['XENDIT', 'QRIS', 'BCAVA', 'BNIVA', 'BRIVA', 'PERMATAVA', 'MANDIRIVA']);
      if (!allowed.has(method)) method = 'XENDIT';
    } else if (gateway === 'duitku') {
      const allowed = new Set(['DUITKU', 'QRIS', 'BCAVA', 'BNIVA', 'BRIVA', 'PERMATAVA', 'MANDIRIVA']);
      if (!allowed.has(method)) method = 'DUITKU';
    }

    const invoiceLike = {
      id: orderId,
      amount: Math.floor(selected.price),
      item_name: `Voucher Hotspot ${selected.name} (${selected.validity})`,
      sku: `VOUCHER-${orderId}`
    };
    const buyer = { name: 'Pembeli Voucher', phone: buyerPhone, email: '' };

    const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
    const token = signPublicToken({ voucherOrderId: orderId, exp: Date.now() + 24 * 60 * 60 * 1000 }, secret);
    const returnPath = `/customer/voucher?order=${encodeURIComponent(String(orderId))}&t=${encodeURIComponent(token)}`;

    let result;
    if (gateway === 'midtrans') {
      result = await paymentSvc.createMidtransTransaction(invoiceLike, buyer, method === 'SNAP' ? 'snap' : method, appUrl, { returnPath, orderPrefix: 'VOUCHER', callbackPath: '/customer/payment/callback' });
    } else if (gateway === 'xendit') {
      result = await paymentSvc.createXenditTransaction(invoiceLike, buyer, method === 'XENDIT' ? 'xendit' : method, appUrl, { returnPath, orderPrefix: 'VOUCHER', description: invoiceLike.item_name, callbackPath: '/customer/payment/callback' });
    } else if (gateway === 'duitku') {
      result = await paymentSvc.createDuitkuTransaction(invoiceLike, buyer, method === 'DUITKU' ? 'duitku' : method, appUrl, { returnPath, orderPrefix: 'VOUCHER', itemName: invoiceLike.item_name, callbackPath: '/customer/payment/callback' });
    } else {
      try {
        result = await paymentSvc.createTripayTransaction(invoiceLike, buyer, method, appUrl, { returnPath, orderPrefix: 'VOUCHER', itemName: invoiceLike.item_name, sku: invoiceLike.sku, callbackPath: '/customer/payment/callback' });
      } catch (e) {
        const msg = String(e?.message || e || '');
        const canRetry =
          (msg.includes('Payment channel is not enabled') || msg.includes('Minimum payment amount')) &&
          Array.isArray(tripayChannels) &&
          tripayChannels.length > 0;
        if (!canRetry) throw e;

        const pool = (tripayCandidates && tripayCandidates.length > 0)
          ? tripayCandidates
          : tripayMethodCandidatesForAmount(tripayChannels, selected.price);
        const fallback = (pool || []).filter(code => code && code !== method)[0];
        if (!fallback) throw e;

        method = fallback;
        result = await paymentSvc.createTripayTransaction(invoiceLike, buyer, method, appUrl, { returnPath, orderPrefix: 'VOUCHER', itemName: invoiceLike.item_name, sku: invoiceLike.sku, callbackPath: '/customer/payment/callback' });
      }
    }

    if (!result.success) throw new Error(result.message || 'Gagal membuat transaksi');

    db.prepare(`
      UPDATE public_voucher_orders SET
        payment_gateway = ?,
        payment_order_id = ?,
        payment_link = ?,
        payment_reference = ?,
        payment_payload = ?,
        payment_expires_at = ?,
        updated_at = (NOW_LOCAL())
      WHERE id = ?
    `).run(
      gateway,
      result.order_id || '',
      result.link || '',
      result.reference || '',
      result.payload ? JSON.stringify(result.payload) : null,
      resolvePaymentExpiresAt(gateway, result) || gatewayDefaultExpiresAtIso(gateway),
      orderId
    );

    return res.redirect(result.link);
  } catch (e) {
    logger.error('[PublicVoucher] Create payment error: ' + (e?.message || e));
    return res.redirect('/customer/voucher?err=' + encodeURIComponent('Gagal membuat pembayaran. Silakan coba lagi.'));
  }
});

// ─── REGISTRATION / PENDAFTARAN ─────────────────────────────────────────────
router.get('/register', (req, res) => {
  const settings = getSettingsWithCache();
  const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
  const regCalc = registrationService.computeBill(0);
  res.render('register', { error: null, success: null, settings, packages, regCalc, installFee: regCalc.installFee });
});

router.post('/register/validate-voucher', express.json(), (req, res) => {
  try {
    const code = String((req.body && req.body.code) || '').trim();
    const pkgId = (req.body && req.body.package_id) || '';
    const pkg = pkgId ? customerSvc.getPackageById(pkgId) : null;
    if (!pkg) return res.json({ ok: false, discount: 0, message: 'Pilih paket dulu untuk cek voucher.' });
    const bill = registrationService.computeBill(pkg.price, {});
    if (!code) return res.json({ ok: true, discount: 0, message: '' });
    const chk = voucherService.validate(code, bill.gross);
    return res.json({ ok: chk.ok, discount: chk.ok ? chk.discount : 0, message: chk.message });
  } catch (e) { return res.json({ ok: false, discount: 0, message: e.message }); }
});

router.post('/register', async (req, res) => {
  const settings = getSettingsWithCache();
  const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
  let { name, phone, email, nik, address, package_id, lat, lng, voucher } = req.body;

  // Rate-limit sederhana anti-spam (per IP): maks 3 pendaftaran / 10 menit
  {
    const _ip = String((req.headers['x-forwarded-for'] || '').split(',')[0] || req.ip || (req.connection && req.connection.remoteAddress) || 'unknown').trim();
    const now = Date.now(), win = 10 * 60 * 1000, max = 3;
    if (!global.__regHits) global.__regHits = new Map();
    const arr = (global.__regHits.get(_ip) || []).filter(function (t) { return now - t < win; });
    if (arr.length >= max) {
      const _rc = registrationService.computeBill(0);
      return res.render('register', { error: (res.locals.t || function(k,d){return d;})('customer.register.err_ratelimit', 'Terlalu banyak pendaftaran dari jaringan ini. Silakan coba lagi beberapa menit lagi.'), success: null, settings, packages, regCalc: _rc, installFee: _rc.installFee });
    }
    arr.push(now); global.__regHits.set(_ip, arr);
  }

  try {
    if (!name || !phone || !address || !package_id) {
      throw new Error((res.locals.t || function(k,d){return d;})('customer.register.err_required', 'Semua field wajib diisi.'));
    }
    // Validasi nomor WhatsApp
    {
      let _ph = String(phone || '').replace(/[^0-9]/g, '');
      if (_ph.startsWith('62')) _ph = '0' + _ph.slice(2);
      if (!/^08[0-9]{7,12}$/.test(_ph)) throw new Error((res.locals.t || function(k,d){return d;})('customer.register.err_phone', 'Nomor WhatsApp tidak valid. Gunakan format 08xxxxxxxxxx.'));
      phone = _ph;
    }

    const selectedPkg = packages.find(p => String(p.id) === String(package_id));
    if (!selectedPkg) throw new Error((res.locals.t || function(k,d){return d;})('customer.register.err_pkg', 'Paket yang dipilih tidak ditemukan.'));
    const bill = registrationService.computeBill(selectedPkg.price, { voucherCode: voucher });

    // Buat pelanggan dengan status inactive (menunggu survei/pemasangan)
    const ins = customerSvc.createCustomer({
      name,
      phone,
      email,
      nik,
      address,
      package_id,
      lat: String(lat || '').trim(),
      lng: String(lng || '').trim(),
      status: 'inactive',
      notes: 'Pendaftar Baru via Online'
    });
    const newCustId = ins && ins.lastInsertRowid ? Number(ins.lastInsertRowid) : null;
    if (newCustId) {
      try {
        db.prepare('UPDATE customers SET reg_voucher_code=?, reg_install_fee=?, reg_prorata=?, reg_discount=?, reg_total=?, reg_due_date=?, reg_status=? WHERE id=?')
          .run(bill.voucherCode || '', bill.installFee, bill.prorata, bill.discount, bill.total, bill.dueDate, 'pending', newCustId);
      } catch (e) {}
    }
    if (bill.voucherValid) { try { voucherService.incrementUse(bill.voucherCode); } catch (e) {} }

    // Kirim notifikasi ke Admin
    if (settings.whatsapp_enabled && settings.whatsapp_admin_numbers && settings.whatsapp_admin_numbers.length > 0) {
      const waNotify = require('../services/waNotifyService');
      const selectedPkg = packages.find(p => p.id.toString() === package_id.toString());
      const pkgName = selectedPkg ? selectedPkg.name : 'Tidak diketahui';
      
      const adminMsg = `🔔 *PENDAFTARAN BARU*\n\nAda calon pelanggan baru yang mendaftar via web:\n\n👤 *Nama:* ${name}\n📞 *WA:* ${phone}\n📍 *Alamat:* ${address}\n📦 *Paket:* ${pkgName}\n🎟️ *Voucher:* ${bill.voucherCode || '-'}\n💰 *Estimasi Bayar Awal:* Rp ${bill.total.toLocaleString('id-ID')}\n\nSilakan cek di panel Admin untuk menindaklanjuti.`;
      const latStr = String(lat || '').trim();
      const lngStr = String(lng || '').trim();
      const mapLine = (latStr && lngStr) ? `\n🗺️ *Lokasi:* https://maps.google.com/?q=${encodeURIComponent(latStr)},${encodeURIComponent(lngStr)}` : '';
      const finalAdminMsg = adminMsg + mapLine;
      
      const seen = new Set();
      for (const adminPhone of settings.whatsapp_admin_numbers) {
        let digits = String(adminPhone || '').replace(/\D/g, '');
        if (!digits) continue;
        if (digits.startsWith('0')) digits = '62' + digits.slice(1);
        if (seen.has(digits)) continue;
        seen.add(digits);
        try { await waNotify.sendText(digits, finalAdminMsg); } catch(e) { /* ignore */ }
      }
    }

    // Kirim notifikasi ke Teknisi Aktif
    if (settings.whatsapp_enabled) {
      try {
        const waNotify = require('../services/waNotifyService');
        const adminSvc = require('../services/adminService');
        const technicians = adminSvc.getAllTechnicians().filter(t => t.is_active === 1 && t.phone);
        
        if (technicians.length > 0) {
          const selectedPkg = packages.find(p => p.id.toString() === package_id.toString());
          const pkgName = selectedPkg ? selectedPkg.name : 'Tidak diketahui';
          
          const techMsg = `🔧 *PENDAFTARAN BARU - PERLU SURVEI*\n\nAda calon pelanggan baru yang perlu disurvei:\n\n👤 *Nama:* ${name}\n📞 *WA:* ${phone}\n📍 *Alamat:* ${address}\n📦 *Paket:* ${pkgName}\n\nSilakan koordinasi dengan admin untuk jadwal survei.`;
          const latStr = String(lat || '').trim();
          const lngStr = String(lng || '').trim();
          const mapLine = (latStr && lngStr) ? `\n🗺️ *Lokasi:* https://maps.google.com/?q=${encodeURIComponent(latStr)},${encodeURIComponent(lngStr)}` : '';
          const finalTechMsg = techMsg + mapLine;
          
          const seenTech = new Set();
          for (const tech of technicians) {
            let digits = String(tech.phone || '').replace(/\D/g, '');
            if (!digits) continue;
            if (digits.startsWith('0')) digits = '62' + digits.slice(1);
            if (seenTech.has(digits)) continue;
            seenTech.add(digits);
            try { await waNotify.sendText(digits, finalTechMsg); } catch(e) { /* ignore */ }
          }
        }
      } catch(e) { /* ignore */ }
    }

    let _newCust = null; try { _newCust = newCustId ? customerSvc.getCustomerById(newCustId) : null; } catch (e) {}
    const _rcOk = registrationService.computeBill(0);
    res.render('register', { error: null, success: (res.locals.t || function(k,d){return d;})('customer.register.success', 'Pendaftaran berhasil! Tim kami akan segera menghubungi Anda melalui WhatsApp.'), settings, packages, newCustomer: _newCust, bill: bill, regCalc: _rcOk, installFee: _rcOk.installFee });
  } catch (err) {
    const _rcErr = registrationService.computeBill(0);
    res.render('register', { error: err.message, success: null, settings, packages, regCalc: _rcErr, installFee: _rcErr.installFee });
  }
});

router.post('/login', loginRateLimiter, async (req, res) => {
  const { phone } = req.body;
  const settings = getSettingsWithCache();
  const startTime = Date.now();

  // Validasi: login HANYA boleh via ID Pelanggan (SKY-xxxxx) atau Nomor WhatsApp (08xxx)
  const idRaw = String(phone || '').trim();
  const isCode = /^[A-Za-z0-9]+-\d{4,10}$/.test(idRaw);
  const isPhone = /^\+?\d[\d\s.\-]*$/.test(idRaw) && idRaw.replace(/\D/g, '').length >= 10;
  if (!isCode && !isPhone) {
    const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
    return res.render('login', { error: 'Masukkan ID Pelanggan (cth: SKY-48213) atau Nomor WhatsApp (08xxxxxxxxxx).', settings, packages });
  }

  let device = null;
  let pppoeUsername = null;
  let customerPhone = phone;

  // 1. Tahap 1: Cari Data di Billing DB (hanya ID Pelanggan / Nomor HP)
  const customer = customerSvc.findCustomerForLogin(phone);
  
  if (customer) {
    logger.info(`[Login] Pelanggan ditemukan di DB (customerId=${customer.id || '-'}, pppoe=${customer.pppoe_username || '-'}).`);
    
    // Use customer's actual phone number and PPPoE username
    customerPhone = customer.phone || phone;
    pppoeUsername = customer.pppoe_username || null;
    
    // Prioritas: PPPoE username > genieacs_tag > phone
    const searchTokens = [
      customer.pppoe_username,
      customer.genieacs_tag,
      customer.phone
    ].filter(Boolean);

    // Cari secara paralel dengan timeout 2.0s agar tidak menggantung jika GenieACS offline/lambat
    const acsSearchPromise = (async () => {
      const results = await Promise.allSettled(searchTokens.map(async (token) => {
        let d = await customerDevice.findDeviceByPppoe(token); // Prioritas PPPoE
        if (!d) d = await customerDevice.findDeviceByTag(token);
        if (!d) {
          const variants = await customerDevice.findDeviceWithTagVariants(token);
          if (variants) d = variants.device;
        }
        return d;
      }));
      return results.find(r => r.status === 'fulfilled' && r.value !== null)?.value || null;
    })();

    device = await Promise.race([
      acsSearchPromise,
      new Promise(resolve => setTimeout(() => resolve(null), 2000))
    ]);

    if (device) {
      logger.info('[Login] Perangkat terdeteksi di GenieACS (matched).');
      if (!pppoeUsername && device.pppoeUsername) {
        pppoeUsername = device.pppoeUsername;
        logger.info(`[Login] PPPoE username dari device: ${pppoeUsername}`);
      }
    }
  }

  // 2. Tahap 2: Fallback (Jika DB tidak ketemu atau perangkat belum link)
  if (!device) {
    try {
      const directPromise = customerDevice.findDeviceWithTagVariants(phone);
      const directResult = await Promise.race([
        directPromise,
        new Promise(resolve => setTimeout(() => resolve(null), 1500))
      ]);
      if (directResult && directResult.device) {
        device = directResult.device;
        if (device.pppoeUsername) {
          pppoeUsername = device.pppoeUsername;
        }
        logger.info('[Login] Perangkat ditemukan secara langsung di GenieACS (fallback).');
      }
    } catch (e) {}
  }

  // 3. Tahap 3: Verifikasi Akhir
  if (!device && !customer) {
    logger.warn('[Login] Gagal: pelanggan tidak ditemukan.');
    const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
    return res.render('login', {
      error: 'Data pelanggan tidak ditemukan. Pastikan nomor WhatsApp sudah benar.',
      settings,
      packages
    });
  }

  if (!device) {
    logger.warn('[Login] Login dilanjutkan tanpa data ONU (device tidak ditemukan).');
  }

  const loginTime = Date.now() - startTime;
  logger.info(`[Login] Proses login selesai dalam ${loginTime}ms`);

  // --- OTP LOGIC ---
  if (settings.login_otp_enabled) {
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiry = Date.now() + 10 * 60 * 1000; // 10 menit
    
    // Simpan ke session sementara
    req.session.pending_login = {
      phone: customerPhone,
      pppoeUsername: pppoeUsername,
      otp: otp,
      expiry: expiry
    };

    logger.info('[Login] OTP dibuat.');

    // Kirim via WhatsApp
    if (settings.whatsapp_enabled) {
      try {
        const waNotify = require('../services/waNotifyService');
        
        if (!(await waNotify.isConnected())) {
          throw new Error('Sistem WhatsApp sedang tidak aktif. Silakan hubungi Admin.');
        }

        const msg = `🔐 Kode OTP Anda: *${otp}*\n\nBerlaku 10 menit. Jangan bagikan kode ini ke siapa pun.`;
        const sent = await waNotify.sendText(customerPhone, msg);
        
        if (!sent) {
          throw new Error('Gagal mengirim kode OTP melalui WhatsApp. Pastikan nomor Anda terdaftar di WhatsApp.');
        }

        logger.info('[Login] OTP dikirim via WhatsApp.');
      } catch (e) {
        logger.error(`[Login] Gagal kirim OTP via WhatsApp: ${e.message}`);
        const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
        return res.render('login', { error: e.message, settings, packages });
      }
    }

    return res.redirect('/customer/login-otp');
  }

  // --- DIRECT LOGIN ---
  logger.info('[Login] Login direct berhasil.');
  req.session.phone = customerPhone; // Nomor telepon untuk findCustomerByAny()
  req.session.pppoe_username = pppoeUsername; // PPPoE username untuk GenieACS & MikroTik
  if (customer && customer.status === 'suspended') {
    return res.redirect('/isolated');
  }
  return res.redirect('/customer/dashboard');
});

router.get('/login-otp', (req, res) => {
  const settings = getSettingsWithCache();
  if (!req.session.pending_login) return res.redirect('/customer/login');
  res.render('login_otp', { error: null, settings, phone: req.session.pending_login.phone });
});

router.post('/login-otp', loginRateLimiter, (req, res) => {
  const { otp } = req.body;
  const settings = getSettingsWithCache();
  const pending = req.session.pending_login;

  if (!pending) {
    // Sudah terverifikasi (mis. submit ganda) → langsung dashboard, jangan lempar ke login
    if (req.session && req.session.phone) return res.redirect('/customer/dashboard');
    return res.redirect('/customer/login');
  }

  if (Date.now() > pending.expiry) {
    delete req.session.pending_login;
    const packages = customerSvc.getAllPackages().filter(p => p.is_active !== 0);
    return res.render('login', { error: 'Kode OTP telah kadaluarsa. Silakan login kembali.', settings, packages });
  }

  if (otp === pending.otp) {
    logger.info('[Login] OTP berhasil diverifikasi.');
    req.session.phone = pending.phone; // Nomor telepon customer
    req.session.pppoe_username = pending.pppoeUsername; // PPPoE username untuk GenieACS & MikroTik
    delete req.session.pending_login;
    const custAfterOtp = customerSvc.findCustomerByAny(pending.phone);
    if (custAfterOtp && custAfterOtp.status === 'suspended') {
      return res.redirect('/isolated');
    }
    return res.redirect('/customer/dashboard');
  } else {
    return res.render('login_otp', { error: 'Kode OTP salah. Silakan coba lagi.', settings, phone: pending.phone });
  }
});

// Pelanggan terisolir: paksa halaman /isolated, kecuali cek tagihan / bayar / logout
router.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.settings = getSettingsWithCache();
  res.locals.formatDateLocal = formatDateLocal;
  res.locals.getNowLocal = getNowLocal;
  res.locals.serviceNotice = noticeSvc.getServiceNotice();

  if (isSuspendedPortalExemptPath(req.path)) return next();
  const loginId = req.session && req.session.phone;
  if (!loginId) return next();
  const profile = findCustomerProfileByLoginId(loginId);
  if (profile && profile.status === 'suspended') {
    return res.redirect('/isolated');
  }
  next();
});

router.get('/dashboard', async (req, res) => {
  // Debug logging
  logger.info(`[Dashboard] Session ID: ${req.sessionID}, Phone: ${req.session?.phone || 'TIDAK ADA'}, PPPoE: ${req.session?.pppoe_username || 'TIDAK ADA'}`);
  
  const loginId = req.session && req.session.phone;
  if (!loginId) return res.redirect('/customer/login');
  
  // Flash message
  let msgNotif = null;
  if (req.session._msg) {
    msgNotif = dashboardNotif(req.session._msg.text, req.session._msg.type);
    delete req.session._msg;
  }
  
  const profile =
    findCustomerProfileByLoginId(loginId) ||
    (req.session.pppoe_username ? findCustomerProfileByLoginId(req.session.pppoe_username) : null);

  const uniqueCandidates = Array.from(new Set([
    req.session.pppoe_username,
    ...(buildCustomerDeviceTokens(loginId, profile))
  ].map(v => String(v || '').trim()).filter(Boolean)));

  let deviceData = null;
  for (const token of uniqueCandidates) {
    try {
      deviceData = await Promise.race([
        getCustomerDeviceData(token),
        new Promise(resolve => setTimeout(() => resolve(null), 2500))
      ]);
    } catch (e) {
      deviceData = null;
    }
    if (deviceData) break;
  }
  
  const searchToken =
    (deviceData && deviceData.pppoeUsername) ||
    (profile && String(profile.pppoe_username || '').trim()) ||
    loginId;
  
  const invoices = billingSvc.getInvoicesByAny(searchToken);
  
  // Ambil tiket keluhan pelanggan
  let tickets = [];
  if (profile) {
    tickets = ticketSvc.getTicketsByCustomerId(profile.id);
  }

  if (profile && profile.router_id) {
    req.session.router_id = Number(profile.router_id);
  }
  const pppoeFromProfile = profile && String(profile.pppoe_username || '').trim();
  const pppoeFromDevice = deviceData && String(deviceData.pppoeUsername || '').trim();
  if (pppoeFromProfile) req.session.pppoe_username = pppoeFromProfile;
  else if (pppoeFromDevice) req.session.pppoe_username = pppoeFromDevice;

  const settings = getSettingsWithCache();
  let paymentChannels = [];
  const gateway = resolveConfiguredGateway(settings);
  if (gateway === 'tripay') {
    try {
      paymentChannels = await paymentSvc.getTripayChannels();
    } catch {
      paymentChannels = [];
    }
  } else if (gateway) {
    const base = [
      { code: 'QRIS', name: 'QRIS', group: 'QRIS', active: true },
      { code: 'BCAVA', name: 'BCA Virtual Account', group: 'Virtual Account', active: true },
      { code: 'BNIVA', name: 'BNI Virtual Account', group: 'Virtual Account', active: true },
      { code: 'BRIVA', name: 'BRI Virtual Account', group: 'Virtual Account', active: true },
      { code: 'PERMATAVA', name: 'Permata Virtual Account', group: 'Virtual Account', active: true },
      { code: 'MANDIRIVA', name: 'Mandiri Virtual Account', group: 'Virtual Account', active: true }
    ];
    if (gateway === 'midtrans') paymentChannels = [{ code: 'SNAP', name: 'Semua Metode (Snap)', group: 'E-Wallet', active: true }, ...base];
    else if (gateway === 'xendit') paymentChannels = [{ code: 'XENDIT', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
    else if (gateway === 'duitku') paymentChannels = [{ code: 'DUITKU', name: 'Semua Metode', group: 'E-Wallet', active: true }, ...base];
  }

  let trafficMaxDownMbps = 10;
  let trafficMaxUpMbps = 10;
  if (profile) {
    const downKbps = Number(profile.speed_down || 0);
    const upKbps = Number(profile.speed_up || 0);
    if (Number.isFinite(downKbps) && downKbps > 0) trafficMaxDownMbps = Math.max(1, Math.round(downKbps / 1000));
    if (Number.isFinite(upKbps) && upKbps > 0) trafficMaxUpMbps = Math.max(1, Math.round(upKbps / 1000));
  }

  const states = sidebarMenuSvc.getStoredMenuStates();

  // Status PPPoE dari MikroTik (session aktif)
  let pppoeOnline = null;
  try {
    const uname = (profile && String(profile.pppoe_username || '').trim()) || String(req.session.pppoe_username || '').trim();
    if (uname) {
      const map = await mikrotikService.getAllActiveSessionsMap().catch(() => new Map());
      pppoeOnline = map.has(uname.toLowerCase());
    }
  } catch (e) { pppoeOnline = null; }

  // ───── Portal PWA baru (OPEN-ISP v2) ────────────────────────────────
  const _now = new Date();
  const _lang = (res.locals && res.locals.lang) || 'id';
  const _t = (res.locals && res.locals.t) || ((k, d) => d);
  const _mNames = _lang === 'en'
    ? ['January','February','March','April','May','June','July','August','September','October','November','December']
    : ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  const _dev = deviceData || fallbackCustomer(loginId);
  const _prof = profile || {};
  const _name = String(_prof.name || _dev.name || _t('pwa.r.fallback_name','Pelanggan')).trim();
  const _initials = (_name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0,2).join('').toUpperCase()) || 'P';
  const _code = String(_prof.customer_code || _dev.phone || loginId || '-');
  const _pkgName = String(_prof.package_name || '-');
  const _sd = Number(_prof.speed_down || 0);
  const _su = Number(_prof.speed_up || 0);
  const _speedDown = _sd > 0 ? Math.round(_sd / 1000) : (trafficMaxDownMbps || '-');
  const _speedUp = _su > 0 ? Math.round(_su / 1000) : (trafficMaxUpMbps || '-');
  const _statusRaw = String(_prof.status || _dev.status || '-').toLowerCase();
  const _statusActive = ['active','aktif'].indexOf(_statusRaw) !== -1;
  const _statusText = _statusActive ? _t('common.active','Aktif') : String(_prof.status || _dev.status || '-');
  const _fmt = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
  const _isolateDay = Math.max(1, Math.min(28, Number(_prof.isolate_day || (settings && settings.isolir_day) || 10)));
  const _isolirOf = (y, m) => { const d = new Date(y, (m || 1) - 1, _isolateDay); return d.getDate() + ' ' + _mNames[d.getMonth()] + ' ' + d.getFullYear(); };
  const _periodLabel = inv => inv ? ((_mNames[(Number(inv.period_month) || 1) - 1] || '') + ' ' + (inv.period_year || '')) : '';
  const _invs = (invoices || []).slice().sort((a,b) => ((b.period_year*100)+(b.period_month||0)) - ((a.period_year*100)+(a.period_month||0)));
  const _unpaid = _invs.find(i => { const st = String(i.status || '').toLowerCase(); return ['paid','lunas','void','hangus','batal'].indexOf(st) === -1; });
  const _paid = _invs.filter(i => ['paid','lunas'].indexOf(String(i.status || '').toLowerCase()) !== -1);
  const _isolirText = _unpaid ? _isolirOf(_unpaid.period_year, _unpaid.period_month)
    : (_paid[0] ? _isolirOf(_paid[0].period_year, (_paid[0].period_month || 1) + 1) : _isolirOf(_now.getFullYear(), _now.getMonth() + 1));
  let _bill = null, _detail = { name: _pkgName + (_speedDown !== '-' ? ' (' + _speedDown + ' Mbps)' : ''), period: '-', status: _t('pwa.home.paid','Lunas'), paid: true, amount: _fmt(0) };
  let _activeDaysText = _statusActive ? _t('common.active','Aktif') : _t('common.inactive','Tidak aktif'), _activePct = _statusActive ? 100 : 0;
  if (_unpaid) {
    const _due = _unpaid.due_date ? new Date(_unpaid.due_date) : null;
    const _uniqCode = Number(_unpaid.qris_unique_code || 0);
    const _uniqAmt = Number(_unpaid.qris_amount_unique || 0) || (Number(_unpaid.amount || 0) + _uniqCode) || Number(_unpaid.amount || 0);
    _bill = {
      id: _unpaid.id,
      label: _t('pwa.r.bill_prefix','Tagihan') + ' ' + _periodLabel(_unpaid),
      amount: _fmt(_unpaid.amount),
      metaText: _t('pwa.r.unpaid','Belum dibayar') + (_due ? ' · ' + _t('pwa.r.due_short','jatuh') + ' ' + _due.getDate() + ' ' + _mNames[_due.getMonth()] : ''),
      dueFull: _due ? (_t('pwa.r.due_full','Jatuh Tempo:') + ' ' + _due.getDate() + ' ' + _mNames[_due.getMonth()] + ' ' + _due.getFullYear()) : _t('pwa.r.waiting','Menunggu pembayaran'),
      overdue: _due ? (_due < _now) : false,
      isolirText: _isolirText,
      amountUnique: _fmt(_uniqAmt),
      uniqueCode: _uniqCode
    };
    _detail = { name: _pkgName + (_speedDown !== '-' ? ' (' + _speedDown + ' Mbps)' : ''), period: '1 - ' + new Date(_unpaid.period_year, _unpaid.period_month, 0).getDate() + ' ' + _periodLabel(_unpaid), status: _t('pwa.r.pending','Menunggu Pembayaran'), paid: false, amount: _fmt(_unpaid.amount) };
    if (_due) {
      const _dl = Math.ceil((_due - _now) / 86400000);
      _activeDaysText = _dl > 0 ? (_dl + ' ' + _t('pwa.r.days_left','hari tersisa')) : (_t('pwa.r.over','Lewat') + ' ' + Math.abs(_dl) + ' ' + _t('pwa.r.days','hari'));
      _activePct = Math.max(0, Math.min(100, Math.round((1 - Math.max(0, _dl) / 30) * 100)));
    }
  } else if (_paid[0]) {
    _detail = { name: _pkgName + (_speedDown !== '-' ? ' (' + _speedDown + ' Mbps)' : ''), period: _periodLabel(_paid[0]), status: _t('pwa.home.paid','Lunas'), paid: true, amount: _fmt(_paid[0].amount) };
  }
  const _history = _paid.slice(0, 6).map(i => ({
    month: _periodLabel(i),
    paidText: _t('pwa.r.paid_on','Dibayar') + (i.paid_at ? ' ' + String(i.paid_at).slice(0, 10) : ''),
    amount: _fmt(i.amount), statusText: _t('pwa.status.paid','LUNAS')
  }));
  const _devices = ((_dev.connectedUsers) || []).slice(0, 12).map(u => ({
    name: (u.hostname && u.hostname !== '-') ? u.hostname : _t('pwa.r.device','Perangkat'),
    mac: u.mac || '-',
    band: (u.iface && /5/i.test(u.iface)) ? '5 GHz' : (u.iface && u.iface !== '-' ? '2.4 GHz' : ''),
    rssi: '', icon: 'ph-device-mobile'
  }));
  const _notice = (res.locals && res.locals.serviceNotice) || { active: false, mode: 'NORMAL', label: 'Normal', text: '' };
  const _notifs = [];
  if (_notice.active) _notifs.push({ type: 'warning', title: _notice.label || _t('pwa.r.net_info','Info Jaringan'), message: (_notice.text || '') + (_notice.estimateText ? (' ' + _t('common.estimated_done','Estimasi selesai') + ': ' + _notice.estimateText) : ''), time: _t('pwa.r.service_info','Info Layanan') });
  _paid.slice(0, 3).forEach(inv => _notifs.push({ type: 'payment', title: _t('pwa.r.payment_success','Pelunasan Tagihan Berhasil'), message: _t('pwa.r.bill_prefix','Tagihan') + ' ' + _periodLabel(inv) + ' ' + _t('pwa.r.amount_of','sebesar') + ' ' + _fmt(inv.amount) + ' ' + _t('pwa.r.has_paid','telah LUNAS.'), time: _t('pwa.r.system_confirmed','Terkonfirmasi Sistem') }));
  if (_unpaid) _notifs.push({ type: 'warning', title: _t('pwa.r.monthly_reminder','Pengingat Tagihan Bulanan'), message: _t('pwa.r.bill_prefix','Tagihan') + ' ' + _periodLabel(_unpaid) + ' ' + _t('pwa.r.amount_of','sebesar') + ' ' + _fmt(_unpaid.amount) + ' ' + _t('pwa.r.awaiting','menunggu pembayaran.'), time: _t('pwa.r.due','Jatuh Tempo') });
  const __portal = {
    title: _t('pwa.title','Portal Pelanggan'),
    company: (settings && settings.company_header) || 'OPEN-ISP',
    name: _name, initials: _initials, code: _code, packageName: _pkgName,
    speedDown: _speedDown, speedUp: _speedUp,
    statusText: _statusText, statusActive: _statusActive,
    activeDaysText: _activeDaysText, activePct: _activePct,
    bill: _bill, detail: _detail, history: _history,
    pppoeUser: String(_prof.pppoe_username || _dev.pppoeUsername || '-'),
    pppoeOnline: pppoeOnline === true,
    pppoeIp: String(_dev.pppoeIP || '-'),
    pppoeUptime: String(_dev.pppoeUptime || '-'),
    onuModel: String(_dev.model || '-'),
    onuOnline: !!_dev.status && _dev.status !== 'Tidak ditemukan',
    onuUptime: String(_dev.uptime || '-'),
    onuLocalIp: String(_dev.pppoeIP || '-'),
    onuTemp: String(_dev.temperature || '-'),
    serialNumber: String(_dev.serialNumber || '-'),
    onuDetected: (!!_dev.status && _dev.status !== 'Tidak ditemukan'),
    onuOnline: (String(_dev.status || '').toLowerCase() === 'online'),
    waPhone: String((settings && settings.company_phone) || '').replace(/[^0-9]/g, '').replace(/^0/, '62'),
    rxPower: (function(v){ v = String(v || '-').trim(); if (v === '-' || !v) return '-'; return /dbm/i.test(v) ? v : (v + ' dBm'); })(_dev.rxPower),
    ssid: String(_dev.ssid || '-'),
    devices: _devices, deviceCount: _devices.length,
    netState: _notice.active ? (_notice.mode === 'GANGGUAN_MASAL' ? 'outage' : 'maintenance') : 'normal',
    notice: { active: !!_notice.active, label: _notice.label || '', text: _notice.text || '', estimateText: _notice.estimateText || '' },
    notifications: _notifs,
    notif: msgNotif,
    customerId: (_prof.id || null),
    version: (function () { try { return require('../package.json').version || '2.4.0'; } catch (e) { return '2.4.0'; } })(),
    speedtestUrl: String((settings && settings.speedtest_url) || '').trim(),
    speedtestMode: String((settings && settings.speedtest_mode) || 'iframe').trim() || 'iframe',
    baseUrl: String((settings && settings.app_url) || (((req.headers['x-forwarded-proto'] || req.protocol) || 'https') + '://' + (req.get('host') || 'localhost:3001'))).replace(/\/+$/, ''),
    companyInfo: {
      name: (settings && settings.company_header) || 'OPEN-ISP',
      address: (settings && settings.company_address) || '-',
      phone: (settings && settings.company_phone) || '-',
      email: (settings && settings.company_email) || '-'
    },
    profileInfo: {
      name: _name, code: _code,
      phone: String(_prof.phone || _dev.phone || '-'),
      address: String(_prof.address || '-'),
      area: String(_prof.area || '-'),
      packageName: _pkgName,
      status: _statusText
    },
    isolirText: _isolirText,
    refInvoiceId: _unpaid ? _unpaid.id : (_paid[0] ? _paid[0].id : null)
  };
  const _portalJson = JSON.stringify(__portal).split('<').join(String.fromCharCode(92) + 'u003c');
  res.render('portal', { portal: __portal, portalJson: _portalJson });
  /* [legacy] render dashboard dinonaktifkan sementara (rollback: hapus komentar)
  res.render('dashboard', {
    customer: deviceData || fallbackCustomer(loginId),
    profile: profile || null,
    onuMissing: !deviceData,
    pppoeOnline,
    invoices: invoices || [],
    tickets: tickets || [],
    settings,
    paymentChannels,
    trafficMaxDownMbps,
    trafficMaxUpMbps,
    connectedUsers: deviceData ? deviceData.connectedUsers : [],
    isLoggedIn: true,
    notif: msgNotif
  });
  */
  return;
});

// ─── API: Ringkasan perangkat (refresh in-place, tanpa reload) ─────────────
router.get('/api/device-summary', async (req, res) => {
  try {
    const loginId = req.session && req.session.phone;
    if (!loginId) return res.status(401).json({ ok: false });
    const profile = findCustomerProfileByLoginId(loginId) || (req.session.pppoe_username ? findCustomerProfileByLoginId(req.session.pppoe_username) : null);
    const tokens = Array.from(new Set([req.session.pppoe_username, ...(buildCustomerDeviceTokens(loginId, profile))].map(v => String(v || '').trim()).filter(Boolean)));
    let dev = null;
    for (const token of tokens) {
      try { dev = await Promise.race([getCustomerDeviceData(token), new Promise(r => setTimeout(() => r(null), 2500))]); } catch (e) { dev = null; }
      if (dev) break;
    }
    const d = dev || fallbackCustomer(loginId);
    let pppoeOnline = false;
    try {
      const uname = (profile && String(profile.pppoe_username || '').trim()) || String(req.session.pppoe_username || '').trim();
      if (uname) { const map = await mikrotikService.getAllActiveSessionsMap().catch(() => new Map()); pppoeOnline = map.has(uname.toLowerCase()); }
    } catch (e) {}
    const rxRaw = String(d.rxPower || '-').trim();
    res.json({
      ok: true,
      onuDetected: !!(d.status && d.status !== 'Tidak ditemukan'),
      onuOnline: (String(d.status || '').toLowerCase() === 'online'),
      model: String(d.model || '-'),
      ip: String(d.pppoeIP || '-'),
      uptime: String(d.uptime || '-'),
      serial: String(d.serialNumber || '-'),
      rx: (rxRaw === '-' || !rxRaw) ? '-' : (/dbm/i.test(rxRaw) ? rxRaw : rxRaw + ' dBm'),
      ssid: String(d.ssid || '-'),
      temp: String(d.temperature || '-'),
      pppoeUser: String((profile && profile.pppoe_username) || d.pppoeUsername || '-'),
      pppoeOnline
    });
  } catch (e) { res.status(500).json({ ok: false, message: e.message }); }
});

// ─── API: Get Active Promo Slides for Dashboard ────────────────────────────
router.get('/api/promo-slides', (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const slides = db.prepare(`
      SELECT id, title, description, image_path, url, open_in_new_tab
      FROM promo_slides
      WHERE is_active = 1
        AND (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
      ORDER BY sort_order ASC, id ASC
    `).all(today, today);
    
    res.json(slides || []);
  } catch (e) {
    res.json([]);
  }
});

router.get('/api/pppoe-traffic', async (req, res) => {
  const loginId = req.session && req.session.phone;
  if (!loginId) return res.status(401).json({ ok: false, error: 'unauthorized' });

  let routerId = req.session && req.session.router_id ? Number(req.session.router_id) : null;
  let username = String((req.session && req.session.pppoe_username) || '').trim();

  if (!username || !routerId) {
    const cleanLogin = String(loginId).replace(/\D/g, '');
    const profile = customerSvc.getAllCustomers().find(c => {
      const cleanDb = String(c.phone || '').replace(/\D/g, '');
      return cleanDb === cleanLogin || c.phone === loginId || c.genieacs_tag === loginId || c.pppoe_username === loginId;
    }) || null;

    if (!routerId && profile && profile.router_id) {
      routerId = Number(profile.router_id);
      req.session.router_id = routerId;
    }
    if (!username) {
      const pppoeFromProfile = profile && String(profile.pppoe_username || '').trim();
      if (pppoeFromProfile) {
        username = pppoeFromProfile;
        req.session.pppoe_username = username;
      } else if (/[a-zA-Z]/.test(String(loginId))) {
        username = String(loginId).trim();
      }
    }
  }

  if (!username) return res.json({ ok: true, available: false, online: false });

  const now = Date.now();
  prunePppoeTrafficSamples(now);

  let conn = null;
  try {
    conn = await mikrotikService.getConnection(routerId);
    const sessions = await conn.client.menu('/ppp/active').where('name', username).get();
    if (!sessions || sessions.length === 0) {
      return res.json({ ok: true, online: false, username, rxMbps: 0, txMbps: 0 });
    }

    const s = sessions[0];
    let iface = strField(s, ['interface', 'interface-name', 'interfaceName', 'ifname', 'if-name', 'pppInterface']) || null;
    const baseSessionId = strField(s, ['.id', 'id', 'sessionId', 'session-id']) || `${username}`;
    const bytesIn = numField(s, ['bytesIn', 'bytes-in', 'bytes_in']);
    const bytesOut = numField(s, ['bytesOut', 'bytes-out', 'bytes_out']);
    const uptime = strField(s, ['uptime']) || null;

    if (!iface) {
      try {
        const pppoeSrvMenu = conn.client.menu('/interface/pppoe-server');
        let pppoeRows = [];
        try {
          pppoeRows = await pppoeSrvMenu.where('user', username).get();
        } catch {
          pppoeRows = await pppoeSrvMenu.get();
        }
        const hit = (Array.isArray(pppoeRows) ? pppoeRows : []).find(r => String(r.user || r['user'] || '').trim() === username);
        const ifaceName = strField(hit, ['name']);
        if (ifaceName) iface = ifaceName;
      } catch {}
    }

    const sessionId = `${baseSessionId}${iface ? `|${iface}` : ''}`;

    const key = `${routerId || 'default'}:${username}`;
    const prev = pppoeTrafficSamples.get(key);
    let rxBytes = bytesIn;
    let txBytes = bytesOut;
    let source = 'ppp-active';

    if (iface) {
      const ifMenu = conn.client.menu('/interface');
      if (ifMenu) {
        try {
          const mtRaw = await invokeRouterOsMenuCommand(ifMenu, 'monitor-traffic', { interface: iface, once: '' });
          const mt = Array.isArray(mtRaw) ? mtRaw[0] : mtRaw;
          const rxBps = numField(mt, ['rxBitsPerSecond', 'rx-bits-per-second', 'rx-bits-per-second']);
          const txBps = numField(mt, ['txBitsPerSecond', 'tx-bits-per-second', 'tx-bits-per-second']);
          if (rxBps || txBps) {
            return res.json({
              ok: true,
              online: true,
              username,
              iface,
              source: 'monitor-traffic',
              uptime,
              rxMbps: (Number(rxBps) || 0) / 1e6,
              txMbps: (Number(txBps) || 0) / 1e6
            });
          }
        } catch {}
      }
    }

    if (iface) {
      try {
        const ifRows = await conn.client.menu('/interface').where('name', iface).get();
        if (ifRows && ifRows.length > 0) {
          const row = ifRows[0];
          const ifRx = numField(row, ['rxByte', 'rx-byte', 'rx-bytes', 'rxBytes']);
          const ifTx = numField(row, ['txByte', 'tx-byte', 'tx-bytes', 'txBytes']);
          if (ifRx || ifTx) {
            rxBytes = ifRx;
            txBytes = ifTx;
            source = 'interface';
          }
        }
      } catch {}
    }

    pppoeTrafficSamples.set(key, { t: now, sessionId, rxBytes, txBytes, source });

    if (!prev || prev.sessionId !== sessionId || !prev.t) {
      return res.json({
        ok: true,
        online: true,
        warmup: true,
        username,
        iface,
        source,
        uptime,
        rxMbps: 0,
        txMbps: 0
      });
    }

    const dtMs = Math.max(1, now - prev.t);
    const dIn = rxBytes - numField(prev, ['rxBytes']);
    const dOut = txBytes - numField(prev, ['txBytes']);
    if (dIn < 0 || dOut < 0) {
      return res.json({
        ok: true,
        online: true,
        warmup: true,
        username,
        iface,
        source,
        uptime,
        rxMbps: 0,
        txMbps: 0
      });
    }

    const rxMbps = (dIn * 8) / (dtMs / 1000) / 1e6;
    const txMbps = (dOut * 8) / (dtMs / 1000) / 1e6;

    return res.json({
      ok: true,
      online: true,
      username,
      iface,
      source,
      uptime,
      rxMbps: Number.isFinite(rxMbps) ? rxMbps : 0,
      txMbps: Number.isFinite(txMbps) ? txMbps : 0
    });
  } catch (e) {
    return res.json({ ok: false, error: e.message || 'failed' });
  } finally {
    if (conn && conn.api) conn.api.close();
  }
});

router.post('/change-ssid', async (req, res) => {
  const wantsJson = String(req.headers['x-requested-with'] || '').toLowerCase().includes('fetch');
  const loginId = String(req.session?.phone ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (!loginId) return wantsJson ? res.status(401).json({ ok: false, message: 'Sesi berakhir. Silakan login ulang.' }) : res.redirect('/customer/login');
  const { ssid } = req.body;
  const ssidClean = String(ssid ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (!ssidClean) {
    req.session._msg = { type: 'danger', text: 'Nama WiFi (SSID) tidak boleh kosong.' };
    return wantsJson ? res.json({ ok: false, message: 'Nama WiFi (SSID) tidak boleh kosong.' }) : res.redirect('/customer/dashboard');
  }
  const profile = findCustomerProfileByLoginId(loginId);
  const cdKey = profile ? ('c' + profile.id) : ('l' + loginId);
  const COOLDOWN_MS = 5 * 60 * 1000;
  const lastChange = ssidChangeCooldown.get(cdKey) || 0;
  const remainMs = COOLDOWN_MS - (Date.now() - lastChange);
  if (lastChange && remainMs > 0) {
    const mins = Math.max(1, Math.ceil(remainMs / 60000));
    const cdMsg = 'Mohon tunggu ' + mins + ' menit lagi sebelum mengganti nama WiFi (mencegah spam ke server).';
    req.session._msg = { type: 'danger', text: cdMsg };
    return wantsJson
      ? res.status(429).json({ ok: false, cooldown: true, retryAfter: Math.ceil(remainMs / 1000), message: cdMsg })
      : res.redirect('/customer/dashboard');
  }
  const tokenCandidates = buildCustomerDeviceTokens(loginId, profile);
  let ok = false;
  for (const token of tokenCandidates) {
    ok = await updateSSID(token, ssidClean);
    if (ok) break;
  }
  if (ok) ssidChangeCooldown.set(cdKey, Date.now());
  
  req.session._msg = ok 
    ? { type: 'success', text: 'Nama WiFi berhasil dikirim. Perubahan aktif dalam 1-5 menit.' }
    : { type: 'danger', text: 'Gagal mengubah SSID.' };

  // Kirim notifikasi WhatsApp ke pelanggan
  if (ok) {
    try {
      const settings = getSettingsWithCache();
      if (settings.whatsapp_enabled) {
        if (profile && profile.phone) {
          const waNotify = require('../services/waNotifyService');
          if (true) {
            const now = getNowLocal();
            const msg = `\ud83d\udcf6 *PERUBAHAN SSID WIFI*\n\n` +
              `\ud83d\udc64 *Pelanggan:* ${profile.name}\n` +
              `\ud83d\udd52 *Waktu:* ${now}\n\n` +
              `SSID WiFi Anda sudah diperbarui menjadi:\n` +
              `\ud83d\udce1 *${ssid}*\n\n` +
              `Silakan pilih SSID baru di perangkat Anda untuk terhubung.\n` +
              `\u26a0\ufe0f Jangan bagikan info ini ke orang lain.`;
            await waNotify.sendText(profile.phone, msg);
          }
        }
      }
    } catch (e) { /* ignore WA notification errors */ }
  }

  if (wantsJson) return res.json({ ok: ok, cooldown: false, retryAfter: ok ? 300 : 0, message: ok ? 'Nama WiFi berhasil dikirim. Perubahan aktif dalam 1-5 menit. Mohon tunggu dan jangan ulangi agar tidak membebani server.' : 'Gagal mengubah SSID. Perangkat mungkin offline atau sedang sibuk, silakan coba lagi.' });
  res.redirect('/customer/dashboard');
});

router.post('/change-password', async (req, res) => {
  const wantsJson = String(req.headers['x-requested-with'] || '').toLowerCase().includes('fetch');
  const loginId = String(req.session?.phone ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (!loginId) return wantsJson ? res.status(401).json({ ok: false, message: 'Sesi berakhir. Silakan login ulang.' }) : res.redirect('/customer/login');
  const passwordRaw = req.body ? req.body.password : '';
  const password = String(passwordRaw ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (password.length < 8) {
    req.session._msg = { type: 'danger', text: 'Gagal mengubah password. Pastikan minimal 8 karakter.' };
    return wantsJson ? res.json({ ok: false, message: 'Gagal mengubah password. Pastikan minimal 8 karakter.' }) : res.redirect('/customer/dashboard');
  }

  const profile = findCustomerProfileByLoginId(loginId);
  const tokenCandidates = buildCustomerDeviceTokens(loginId, profile);
  let ok = false;
  for (const token of tokenCandidates) {
    ok = await updatePassword(token, password);
    if (ok) break;
  }

  // Simpan password WiFi ke kolom terpisah (jangan menimpa password PPPoE)
  if (ok && profile && profile.id) {
    try {
      db.prepare('UPDATE customers SET password_wifi = ? WHERE id = ?').run(password, profile.id);
    } catch (e) { /* ignore */ }
  }

  req.session._msg = ok
    ? { type: 'success', text: 'Password WiFi berhasil diubah.' }
    : { type: 'danger', text: 'Gagal mengubah password. Perangkat mungkin offline atau sedang sibuk, silakan coba lagi.' };

  // Kirim notifikasi WhatsApp ke pelanggan
  if (ok) {
    try {
      const settings = getSettingsWithCache();
      if (settings.whatsapp_enabled) {
        if (profile && profile.phone) {
          const waNotify = require('../services/waNotifyService');
          if (true) {
            const now = getNowLocal();
            const msg = `\ud83d\udd11 *PERUBAHAN PASSWORD WIFI*\n\n` +
              `\ud83d\udc64 *Pelanggan:* ${profile.name}\n` +
              `\ud83d\udd52 *Waktu:* ${now}\n\n` +
              `Password WiFi Anda sudah diperbarui menjadi:\n` +
              `\ud83d\udd10 *${password}*\n\n` +
              `Silakan gunakan password baru untuk terhubung.\n` +
              `\u26a0\ufe0f Jangan bagikan password ini ke orang lain.`;
            await waNotify.sendText(profile.phone, msg);
          }
        }
      }
    } catch (e) { /* ignore WA notification errors */ }
  }

  if (wantsJson) return res.json({ ok: ok, message: ok ? 'Password WiFi berhasil diubah.' : 'Gagal mengubah password. Perangkat mungkin offline atau sedang sibuk, silakan coba lagi.' });
  res.redirect('/customer/dashboard');
});

router.post('/reboot', async (req, res) => {
  const phone = req.session && req.session.phone;
  if (!phone) return res.redirect('/customer/login');
  const r = await requestReboot(phone);
  
  req.session._msg = r.ok
    ? { type: 'success', text: 'Perangkat berhasil direboot. Silakan tunggu beberapa menit.' }
    : { type: 'danger', text: r.message || 'Gagal reboot.' };

  res.redirect('/customer/dashboard');
});

router.post('/api/device/refresh', async (req, res) => {
  const loginId = String(req.session?.phone ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (!loginId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  const profile = findCustomerProfileByLoginId(loginId);
  const tokenCandidates = Array.from(new Set([
    req.session?.pppoe_username,
    ...buildCustomerDeviceTokens(loginId, profile)
  ].map(v => String(v || '').trim()).filter(Boolean)));

  let result = null;
  for (const token of tokenCandidates) {
    result = await customerDevice.requestRefresh(token, {
      type: 'customer',
      id: profile?.id || null,
      name: profile?.name || loginId,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    });
    if (result && result.ok) break;
  }

  if (!result) {
    result = { ok: false, message: 'Perangkat tidak ditemukan.' };
  }

  return res.json(result);
});

router.get('/api/device/sync-status', async (req, res) => {
  const loginId = String(req.session?.phone ?? '').replace(/[\r\n\t]+/g, '').trim();
  if (!loginId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  const profile = findCustomerProfileByLoginId(loginId);
  const tokenCandidates = Array.from(new Set([
    req.session?.pppoe_username,
    ...buildCustomerDeviceTokens(loginId, profile)
  ].map(v => String(v || '').trim()).filter(Boolean)));

  let deviceData = null;
  for (const token of tokenCandidates) {
    deviceData = await customerDevice.getCustomerDeviceData(token);
    if (deviceData) break;
  }

  if (!deviceData) {
    return res.json({ ok: false, found: false, message: 'Perangkat tidak ditemukan.' });
  }

  return res.json({
    ok: true,
    found: true,
    status: deviceData.status,
    lastInform: deviceData.lastInform,
    lastInformAgo: deviceData.lastInformAgo,
    lastSync: deviceData.lastSync,
    lastSyncAgo: deviceData.lastSyncAgo,
    syncInProgress: !!deviceData.syncInProgress,
    syncPendingCount: Number(deviceData.syncPendingCount || 0),
    syncStatusLabel: String(deviceData.syncStatusLabel || 'Idle')
  });
});

router.post('/change-tag', async (req, res) => {
  const oldTag = req.session && req.session.phone;
  const newTag = (req.body.newTag || '').trim();
  if (!oldTag) return res.redirect('/customer/login');
  const settings = getSettingsWithCache();

  if (!newTag || newTag === oldTag) {
    const data = await getCustomerDeviceData(oldTag);
    const invoices = billingSvc.getInvoicesByAny(oldTag);
    const states = sidebarMenuSvc.getStoredMenuStates();
    return res.render('dashboard', {
      customer: data || fallbackCustomer(oldTag),
      profile: null,
      invoices: invoices || [],
      tickets: [],
      settings,
      paymentChannels: [],
      connectedUsers: data ? data.connectedUsers : [],
      notif: dashboardNotif('ID/Tag baru tidak boleh kosong atau sama dengan yang lama.', 'warning')
    });
  }
  const tagResult = await updateCustomerTag(oldTag, newTag);
  let notif = null;
  let resolvedPhone = oldTag;
  
  if (tagResult.ok) {
    req.session.phone = newTag;
    resolvedPhone = newTag;
    notif = dashboardNotif('ID/Tag berhasil diubah.', 'success');
    
    // UPDATE DATABASE SQLITE IF MATCHING PROFILE FOUND
    const profileToUpdate = customerSvc.getAllCustomers().find(c => {
      const cleanLogin = oldTag.replace(/\D/g, '');
      const cleanDb = (c.phone || '').replace(/\D/g, '');
      return cleanDb === cleanLogin || c.phone === oldTag || c.genieacs_tag === oldTag;
    });
    
    if (profileToUpdate) {
      try {
        customerSvc.updateCustomer(profileToUpdate.id, { 
          ...profileToUpdate, 
          genieacs_tag: newTag 
        });
        logger.info(`[Portal] Database updated for tag change: ${oldTag} -> ${newTag}`);
      } catch (dbErr) {
        logger.error(`[Portal] Failed to update DB tag: ${dbErr.message}`);
      }
    }
  } else {
    notif = dashboardNotif(tagResult.message || 'Gagal mengubah ID/Tag pelanggan.', 'danger');
  }
  const deviceData = await getCustomerDeviceData(resolvedPhone);
  let searchToken = resolvedPhone;
  if (deviceData && deviceData.pppoeUsername) {
    searchToken = deviceData.pppoeUsername;
  }
  const invoices = billingSvc.getInvoicesByAny(searchToken);
  const profile = customerSvc.getAllCustomers().find(c => {
    const cleanLogin = resolvedPhone.replace(/\D/g, '');
    const cleanDb = (c.phone || '').replace(/\D/g, '');
    return cleanDb === cleanLogin || c.phone === resolvedPhone || c.pppoe_username === (deviceData ? deviceData.pppoeUsername : null);
  });
  const tickets = profile ? ticketSvc.getTicketsByCustomerId(profile.id) : [];

  const states = sidebarMenuSvc.getStoredMenuStates();
  res.render('dashboard', {
    customer: deviceData || fallbackCustomer(resolvedPhone),
    profile: profile || null,
    invoices: invoices || [],
    tickets,
    settings,
    paymentChannels: [],
    connectedUsers: deviceData ? deviceData.connectedUsers : [],
    notif
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/customer/login');
  });
});

router.get('/invoice/:id/pdf', async (req, res) => {
  try {
    const inv = billingSvc.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).send('Invoice tidak ditemukan');

    const _sessProf = (req.session && req.session.phone) ? findCustomerProfileByLoginId(req.session.phone) : null;
    const sessionCustId = _sessProf ? Number(_sessProf.id) : 0;
    if (sessionCustId > 0 && Number(inv.customer_id) !== sessionCustId) {
      return res.status(403).send('Akses ditolak');
    }

    const customer = customerSvc.getCustomerById(inv.customer_id);
    if (!customer) return res.status(404).send('Data pelanggan tidak ditemukan');

    const settings = getSettingsWithCache();
    const pdfBuffer = await pdfSvc.generateInvoicePdfBuffer(inv, customer, settings);

    const safeName = (customer.name || 'Pelanggan').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `Invoice_INV-${String(inv.id).padStart(4, '0')}_${safeName}.pdf`;
    const _wantDl = String(req.query.dl || '') !== '';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${_wantDl ? 'attachment' : 'inline'}; filename="${filename}"`,
      'Content-Length': pdfBuffer.length
    });
    return res.send(pdfBuffer);
  } catch (err) {
    logger.error(`[Customer PDF Download] Error: ${err.message}`);
    return res.status(500).send('Gagal generate PDF invoice: ' + err.message);
  }
});

// Kirim invoice PDF ke WhatsApp pelanggan
router.post('/invoice/:id/send-pdf-wa', async (req, res) => {
  try {
    const inv = billingSvc.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).json({ ok: false, message: 'Tagihan tidak ditemukan.' });

    const _sessProf = (req.session && req.session.phone) ? findCustomerProfileByLoginId(req.session.phone) : null;
    const sessionCustId = _sessProf ? Number(_sessProf.id) : 0;
    if (sessionCustId > 0 && Number(inv.customer_id) !== sessionCustId) {
      return res.status(403).json({ ok: false, message: 'Akses ditolak.' });
    }

    const customer = customerSvc.getCustomerById(inv.customer_id);
    if (!customer || !customer.phone) {
      return res.status(400).json({ ok: false, message: 'Nomor WhatsApp pelanggan tidak tersedia.' });
    }

    const settings = getSettingsWithCache();
    const pdfSvc = require('../services/pdfInvoiceService');
    const waNotify = require('../services/waNotifyService');

    const pdfBuffer = await pdfSvc.generateInvoicePdfBuffer(inv, customer, settings);
    const filename = `Invoice_INV-${String(inv.id).padStart(4, '0')}.pdf`;
    const isPaid = inv.status === 'paid';
    const caption = `📄 *INVOICE ${isPaid ? '(LUNAS)' : '(TAGIHAN)'}*\n` +
      `Periode: ${inv.period_month}/${inv.period_year}\n` +
      `Total: Rp ${Number(inv.amount || 0).toLocaleString('id-ID')}\n` +
      `Status: *${isPaid ? 'LUNAS' : 'BELUM BAYAR'}*\n\n` +
      `Terima kasih.\n— ${settings.company_header || 'OPEN-ISP'}`;

    const ok = await waNotify.sendDocument(customer.phone, pdfBuffer, filename, caption);
    return res.json({ ok: !!ok, message: ok ? 'Invoice dikirim ke WhatsApp Anda.' : 'Gagal mengirim invoice. Coba lagi.' });
  } catch (err) {
    logger.error(`[Customer Send PDF WA] Error: ${err.message}`);
    return res.status(500).json({ ok: false, message: 'Gagal mengirim invoice: ' + err.message });
  }
});

router.get('/invoice/:id/print', async (req, res) => {
  try {
    const inv = billingSvc.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).send('Invoice tidak ditemukan');

    const _sessProf = (req.session && req.session.phone) ? findCustomerProfileByLoginId(req.session.phone) : null;
    const sessionCustId = _sessProf ? Number(_sessProf.id) : 0;
    if (sessionCustId > 0 && Number(inv.customer_id) !== sessionCustId) {
      return res.status(403).send('Akses ditolak');
    }

    const customer = customerSvc.getCustomerById(inv.customer_id);
    if (!customer) return res.status(404).send('Data pelanggan tidak ditemukan');

    const settings = getSettingsWithCache();
    return res.render('admin/print_invoice', {
      invoice: inv,
      customer,
      company: settings.company_header || 'OPEN-ISP',
      settings,
      lang: 'id',
      t: (key, def) => def || key,
      getCurrentTimeInfo,
      formatDateLocal,
      getNowLocal
    });
  } catch (err) {
    logger.error(`[Customer Print Invoice] Error: ${err.message}`);
    return res.status(500).send('Gagal memuat invoice: ' + err.message);
  }
});

router.get('/invoice/:id/print-thermal', async (req, res) => {
  try {
    const inv = billingSvc.getInvoiceById(req.params.id);
    if (!inv) return res.status(404).send('Invoice tidak ditemukan');

    const _sessProf = (req.session && req.session.phone) ? findCustomerProfileByLoginId(req.session.phone) : null;
    const sessionCustId = _sessProf ? Number(_sessProf.id) : 0;
    if (sessionCustId > 0 && Number(inv.customer_id) !== sessionCustId) {
      return res.status(403).send('Akses ditolak');
    }

    const customer = customerSvc.getCustomerById(inv.customer_id);
    if (!customer) return res.status(404).send('Data pelanggan tidak ditemukan');

    const settings = getSettingsWithCache();
    return res.render('collector/print_thermal', {
      invoice: inv,
      customer,
      company: settings.company_header || 'OPEN-ISP',
      settings,
      collectorName: 'Portal Pelanggan',
      formatDateLocal,
      formatTimeLocal,
      getNowLocal
    });
  } catch (err) {
    logger.error(`[Customer Print Thermal Error]: ${err.message}`);
    return res.status(500).send('Gagal memuat struk thermal: ' + err.message);
  }
});

router.post('/public/payment/create/:invoiceId', async (req, res) => {
  const settings = getSettingsWithCache();
  const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
  const payload = verifyPublicToken(req.body.token, secret);

  const redirectBack = (lookup, err, info) => {
    const q = lookup ? `q=${encodeURIComponent(String(lookup))}` : '';
    const e = err ? `err=${encodeURIComponent(String(err))}` : '';
    const i = info ? `info=${encodeURIComponent(String(info))}` : '';
    const qs = [q, e, i].filter(Boolean).join('&');
    return res.redirect(`/customer/check-billing${qs ? `?${qs}` : ''}`);
  };

  if (!payload) {
    return redirectBack('', 'Link pembayaran tidak valid atau sudah kadaluarsa.');
  }

  if (String(req.params.invoiceId) !== String(payload.invoiceId)) {
    return redirectBack(payload.lookup, 'Link pembayaran tidak valid.');
  }

  const tosChecked = req.body.tos === 'on' || req.body.tos === '1' || req.body.tos === true || req.body.tos === 'true';
  if (!tosChecked) {
    return redirectBack(payload.lookup, 'Harap centang persetujuan Syarat & Ketentuan (TOS) untuk melanjutkan.');
  }

  try {
    const inv = billingSvc.getInvoiceById(req.params.invoiceId);
    if (!inv) throw new Error('Tagihan tidak ditemukan');
    if (Number(inv.customer_id) !== Number(payload.customerId)) throw new Error('Tagihan tidak valid');
    if (inv.status === 'paid') {
      return redirectBack(payload.lookup, '', 'Tagihan ini sudah lunas.');
    }

    const selectedMethod = String(req.body.method || 'QRIS').toUpperCase();
    if (selectedMethod === 'QRIS_STATIC') {
      const { uniqueCode, amountUnique } = ensureInvoiceQrisUnique(inv, false);
      const qrisQrUrl = await getStaticQrisQrUrlForAmount(settings, amountUnique);
      if (!qrisQrUrl) throw new Error('QRIS statis belum diatur oleh admin');
      const adminWaDigits = getFirstAdminWaDigits(settings);
      return res.render('qris_static', {
        settings,
        backUrl: `/customer/check-billing?q=${encodeURIComponent(String(payload.lookup || ''))}`,
        error: null,
        info: null,
        kind: 'invoice',
        invoiceId: Number(inv.id),
        periodText: `${inv.period_month}/${inv.period_year}`,
        customerName: inv.customer_name || '',
        amountUnique,
        uniqueCode,
        qrisQrUrl,
        helpText: 'Pastikan nominal dibayar sama persis agar sistem dapat mendeteksi pembayaran.',
        adminWaDigits,
        publicToken: String(req.body.token || ''),
        proofUrl: '',
        proofActionUrl: '/customer/payment/proof/' + encodeURIComponent(String(inv.id))
      });
    }

    const force = String(req.query.force || '').toLowerCase() === '1' || String(req.query.force || '').toLowerCase() === 'true';
    if (!force && inv.payment_link) {
      let expiresAtMs = inv.payment_expires_at ? new Date(inv.payment_expires_at).getTime() : 0;
      let payloadExpiresAt = null;
      if (inv.payment_payload) {
        try {
          const parsedPayload = typeof inv.payment_payload === 'string' ? JSON.parse(inv.payment_payload) : inv.payment_payload;
          payloadExpiresAt = resolvePaymentExpiresAt(inv.payment_gateway, { payload: parsedPayload });
          const ms = payloadExpiresAt ? new Date(payloadExpiresAt).getTime() : 0;
          if (Number.isFinite(ms) && ms > 0) expiresAtMs = ms;
        } catch {}
      }

      if (payloadExpiresAt && payloadExpiresAt !== inv.payment_expires_at) {
        try {
          billingSvc.updatePaymentInfo(inv.id, {
            gateway: inv.payment_gateway,
            order_id: inv.payment_order_id,
            link: inv.payment_link,
            reference: inv.payment_reference,
            payload: inv.payment_payload,
            expires_at: payloadExpiresAt
          });
        } catch {}
      }

      if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
        logger.info(`[Payment] Reusing existing link for INV-${inv.id} (public)`);
        return res.redirect(inv.payment_link);
      }
    }

    const gateway = resolveConfiguredGatewayForAmount(settings, inv.amount);
    if (!gateway) throw new Error('Payment gateway belum dikonfigurasi atau nominal terlalu kecil untuk gateway aktif');
    let method = selectedMethod;
    const cust = customerSvc.getCustomerById(inv.customer_id);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const appUrl = settings.app_url || `${protocol}://${host}`;

    let tripayChannels = null;
    let tripayCandidates = null;
    if (gateway === 'tripay') {
      try {
        tripayChannels = await paymentSvc.getTripayChannels();
        const allowedList = (tripayChannels || []).map(c => String(c?.code || '').toUpperCase()).filter(Boolean);
        tripayCandidates = tripayMethodCandidatesForAmount(tripayChannels, inv.amount);
        if (!tripayCandidates || tripayCandidates.length === 0) tripayCandidates = allowedList;
        const allowed = new Set(tripayCandidates);
        if (!allowed.has(method)) method = tripayCandidates[0] || 'QRIS';
      } catch {
        method = 'QRIS';
      }
    }

    let result;
    if (gateway === 'midtrans') {
      result = await paymentSvc.createMidtransTransaction(inv, cust, method === 'SNAP' ? 'snap' : method, appUrl);
    } else if (gateway === 'xendit') {
      result = await paymentSvc.createXenditTransaction(inv, cust, method === 'XENDIT' ? 'xendit' : method, appUrl);
    } else if (gateway === 'duitku') {
      result = await paymentSvc.createDuitkuTransaction(inv, cust, method === 'DUITKU' ? 'duitku' : method, appUrl);
    } else {
      try {
        result = await paymentSvc.createTripayTransaction(inv, cust, method, appUrl);
      } catch (e) {
        const msg = String(e?.message || e || '');
        const canRetry =
          (msg.includes('Payment channel is not enabled') || msg.includes('Minimum payment amount')) &&
          Array.isArray(tripayChannels) &&
          tripayChannels.length > 0;
        if (!canRetry) throw e;

        const pool = (tripayCandidates && tripayCandidates.length > 0)
          ? tripayCandidates
          : tripayMethodCandidatesForAmount(tripayChannels, inv.amount);
        const fallback = (pool || []).filter(code => code && code !== method)[0];
        if (!fallback) throw e;

        method = fallback;
        result = await paymentSvc.createTripayTransaction(inv, cust, method, appUrl);
      }
    }

    if (result.success) {
      const resolvedExpiresAt =
        resolvePaymentExpiresAt(gateway, result) ||
        gatewayDefaultExpiresAtIso(gateway);
      billingSvc.updatePaymentInfo(inv.id, {
        gateway: gateway,
        order_id: result.order_id,
        link: result.link,
        reference: result.reference,
        payload: result.payload,
        expires_at: resolvedExpiresAt
      });

      logger.info(`[Payment] New link created for INV-${inv.id} via ${gateway} (public)`);
      return res.redirect(result.link);
    }

    throw new Error(result.message || 'Gagal membuat transaksi');
  } catch (error) {
    logger.error(`[Payment] Create Error (public): ${error.message}`);
    return redirectBack(payload.lookup, 'Terjadi kesalahan saat membuat transaksi pembayaran. Silakan coba lagi.');
  }
});

// ─── TICKETS / KELUHAN ─────────────────────────────────────────────────────
router.post('/tickets/create', uploadCustomer.array('photos', 5), async (req, res) => {
  const loginId = req.session && req.session.phone;
  if (!loginId) return res.redirect('/customer/login');
  
  const profile = findCustomerProfileByLoginId(loginId) ||
    (req.session.pppoe_username ? findCustomerProfileByLoginId(req.session.pppoe_username) : null);

  const customerId = req.body.customerId || (profile ? profile.id : null);
  const { subject, message } = req.body;
  if (!subject || !message || !customerId) {
    req.session._msg = { type: 'danger', text: 'Semua field wajib diisi.' };
    return res.redirect('/customer/dashboard');
  }

  try {
    // Prepare photo data
    let photoPaths = [];
    let photoMetadata = [];
    
    if (req.files && req.files.length > 0) {
      photoPaths = req.files.map(f => '/uploads/tickets/' + f.filename);
      photoMetadata = req.files.map((f, idx) => ({
        filename: f.filename,
        originalName: f.originalname,
        size: f.size,
        uploadedAt: new Date().toISOString(),
        lat: req.body.gps_lat || '',
        lng: req.body.gps_lng || ''
      }));
    }
    
    // Create ticket with photos
    const result = ticketSvc.createTicket(customerId, subject, message, {
      customerPhotos: JSON.stringify(photoPaths),
      customerPhotoMetadata: JSON.stringify(photoMetadata)
    });
    
    const ticketId = result.lastInsertRowid;
    
    req.session._msg = { type: 'success', text: 'Keluhan berhasil dikirim. Tim teknisi akan segera mengeceknya.' };

    // --- WHATSAPP NOTIFICATION FOR NEW TICKET ---
    try {
      const settings = getSettingsWithCache();
      if (settings.whatsapp_enabled) {
        const waNotify = require('../services/waNotifyService');
        const customer = customerSvc.getCustomerById(customerId);
        
        const photoCount = photoPaths.length;
        const photoText = photoCount > 0 ? `\n📸 *Foto Masalah:* ${photoCount} foto terlampir` : '';
        
        const _waDigits = normalizeWaDigits(customer ? customer.phone : '');
        const _mapQ = (customer && customer.lat && customer.lng) ? (customer.lat + ',' + customer.lng) : String(customer ? customer.address : '');
        const _base = (String(settings.public_base_url || '') || String(settings.app_url || '') || ('http://' + (req.get('host') || ''))).replace(/\/+$/, '');
        const _links = `\n🔗 *Tautan Cepat:*\n` +
          (_waDigits ? `• 💬 Chat Pelanggan: https://wa.me/${_waDigits}\n` : '') +
          (_mapQ ? `• 📍 Share Lokasi: https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(_mapQ)}` : '');
        const waMsg = `🎫 *TIKET KELUHAN BARU*\n\n` +
                     `👤 *Pelanggan:* ${customer ? customer.name : 'Unknown'}\n` +
                     `📞 *WhatsApp:* ${customer ? customer.phone : '-'}\n` +
                     `📍 *Alamat:* ${customer ? customer.address : '-'}\n` +
                     `📝 *Subjek:* ${subject}\n` +
                     `💬 *Pesan:* ${message}${photoText}\n\n` +
                     `Silakan cek di panel Admin/Teknisi untuk menindaklanjuti.` + _links;

        const recipients = new Set();
        if (settings.whatsapp_admin_numbers && settings.whatsapp_admin_numbers.length > 0) {
          for (const adminPhone of settings.whatsapp_admin_numbers) {
            const digits = normalizeWaDigits(adminPhone);
            if (digits) recipients.add(digits);
          }
        }
        const techSvc = require('../services/techService');
        const technicians = techSvc.getAllTechnicians().filter(t => t.is_active === 1);
        for (const tech of technicians) {
          const digits = normalizeWaDigits(tech.phone);
          if (digits) recipients.add(digits);
        }

        for (const digits of recipients) {
          const key = `ticket:new:${ticketId}:${digits}`;
          if (!shouldSendWa(key)) continue;
          await waNotify.sendText(digits, waMsg);
        }
      }
    } catch (waErr) {
      logger.error(`[Ticket] WA Notification Error: ${waErr.message}`);
    }
    // --------------------------------------------

  } catch (error) {
    req.session._msg = { type: 'danger', text: 'Gagal mengirim keluhan: ' + error.message };
  }
  res.redirect('/customer/dashboard');
});

// ─── PAYMENT ROUTES ────────────────────────────────────────────────────────
// API endpoint untuk cek status invoice/payment (untuk auto-polling di halaman QRIS dan /isolated)
router.get('/payment/status/:invoiceId', async (req, res) => {
  try {
    const invoiceId = Number(req.params.invoiceId || 0);
    const inv = billingSvc.getInvoiceById(invoiceId);

    if (!inv) {
      return res.status(404).json({ error: 'Invoice tidak ditemukan', status: 'error' });
    }

    // CHECK 1: Session-based auth (existing)
    const loginId = req.session && req.session.phone;
    if (loginId) {
      const profile = findCustomerProfileByLoginId(loginId);
      if (profile && Number(inv.customer_id) === Number(profile.id)) {
        return res.json({
          success: true,
          status: String(inv.status || 'unpaid'),
          paid_at: inv.paid_at || null
        });
      }
      // If session doesn't match, fall through to token check
    }

    // CHECK 2: Public token auth (NEW for /isolated polling)
    const publicToken = req.query.t;
    if (publicToken) {
      const settings = getSettingsWithCache();
      const tokenUtil = require('../utils/tokenUtil');
      const payload = tokenUtil.verifyPublicToken(publicToken, settings.session_secret);
      
      if (payload && String(payload.invoiceId) === String(invoiceId)) {
        return res.json({
          success: true,
          status: String(inv.status || 'unpaid'),
          paid_at: inv.paid_at || null
        });
      }
    }

    return res.status(401).json({ error: 'Unauthorized', status: 'error' });
  } catch (e) {
    logger.error(`[PAYMENT-STATUS] Error: ${e && e.message ? e.message : String(e)}`);
    return res.status(500).json({ error: 'Internal error', status: 'error' });
  }
});

router.get('/payment/create/:invoiceId', async (req, res) => {
  const loginId = req.session && req.session.phone;
  const publicToken = req.query.t;
  
  // CHECK 1: Session login
  if (!loginId && !publicToken) {
    return res.redirect('/customer/login');
  }
  
  try {
    const settings = getSettingsWithCache();
    const inv = billingSvc.getInvoiceById(req.params.invoiceId);
    
    if (!inv) throw new Error('Tagihan tidak ditemukan');
    if (inv.status === 'paid') throw new Error('Tagihan ini sudah lunas.');
    
    // Verify loginId atau publicToken
    let profile = null;
    if (loginId) {
      profile = findCustomerProfileByLoginId(loginId);
      if (!profile || Number(inv.customer_id) !== Number(profile.id)) throw new Error('Tagihan tidak valid');
    } else if (publicToken) {
      // Verify public token
      const tokenUtil = require('../utils/tokenUtil');
      const payload = tokenUtil.verifyPublicToken(publicToken, settings.session_secret);
      if (!payload || String(payload.invoiceId) !== String(inv.id)) throw new Error('Token tidak valid atau expired');
      // Get customer from invoice
      profile = customerSvc.getCustomerById(inv.customer_id);
      if (!profile) throw new Error('Pelanggan tidak ditemukan');
    } else {
      throw new Error('Akses tidak diizinkan');
    }

    const methodRaw = String(req.query.method || 'QRIS').toUpperCase();

    const force = String(req.query.force || '').toLowerCase() === '1' || String(req.query.force || '').toLowerCase() === 'true';
    if (!force && inv.payment_link) {
      let expiresAtMs = inv.payment_expires_at ? new Date(inv.payment_expires_at).getTime() : 0;
      let payloadExpiresAt = null;
      if (inv.payment_payload) {
        try {
          const parsedPayload = typeof inv.payment_payload === 'string' ? JSON.parse(inv.payment_payload) : inv.payment_payload;
          payloadExpiresAt = resolvePaymentExpiresAt(inv.payment_gateway, { payload: parsedPayload });
          const ms = payloadExpiresAt ? new Date(payloadExpiresAt).getTime() : 0;
          if (Number.isFinite(ms) && ms > 0) expiresAtMs = ms;
        } catch {}
      }

      if (payloadExpiresAt && payloadExpiresAt !== inv.payment_expires_at) {
        try {
          billingSvc.updatePaymentInfo(inv.id, {
            gateway: inv.payment_gateway,
            order_id: inv.payment_order_id,
            link: inv.payment_link,
            reference: inv.payment_reference,
            payload: inv.payment_payload,
            expires_at: payloadExpiresAt
          });
        } catch {}
      }

      if (Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()) {
        logger.info(`[Payment] Reusing existing link for INV-${inv.id}`);
        return res.redirect(inv.payment_link);
      }
    }

    const gateway = resolveConfiguredGatewayForAmount(settings, inv.amount);
    if (!gateway) throw new Error('Payment gateway belum dikonfigurasi atau nominal terlalu kecil untuk gateway aktif');
    
    // Mode 1: Payment Gateway Mayar
    if (gateway === 'mayar') {
      const mayar = require('../services/mayarService');
      if (!mayar.isConfigured()) throw new Error('Payment gateway (Mayar) belum dikonfigurasi. Isi API key Mayar di pengaturan.');
      const desc = 'Tagihan ' + inv.period_month + '/' + inv.period_year + ((profile && profile.customer_code) ? ' • ' + profile.customer_code : '');
      const r = await mayar.createInvoice({
        name: (profile && profile.name) || inv.customer_name || 'Pelanggan',
        email: (profile && profile.email) || '',
        mobile: (profile && profile.phone) || '',
        description: desc,
        amount: inv.amount,
        extraData: { invoice_id: String(inv.id), customer_code: String((profile && profile.customer_code) || '') }
      });
      const expIso = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      billingSvc.updatePaymentInfo(inv.id, {
        gateway: 'mayar', order_id: r.order_id, link: r.link, reference: r.reference, payload: r.payload, expires_at: expIso
      });
      logger.info(`[Payment] Link Mayar dibuat untuk INV-${inv.id}`);
      return res.redirect(r.link);
    }

    // Jika gateway adalah QRIS Static, auto-use QRIS_STATIC method
    if (gateway === 'qris_static') {
      const { uniqueCode, amountUnique } = ensureInvoiceQrisUnique(inv, false);
      const qrisQrUrl = await getStaticQrisQrUrlForAmount(settings, amountUnique);
      if (!qrisQrUrl) throw new Error('QRIS statis belum diatur oleh admin');
      const adminWaDigits = getFirstAdminWaDigits(settings);
      return res.render('qris_static', {
        settings,
        backUrl: loginId ? '/customer/dashboard#billing-section' : '/isolated',
        error: null,
        info: null,
        kind: 'invoice',
        invoiceId: Number(inv.id),
        periodText: `${inv.period_month}/${inv.period_year}`,
        customerName: profile?.name || inv.customer_name || '',
        amountUnique,
        uniqueCode,
        qrisQrUrl,
        helpText: 'Pastikan nominal dibayar sama persis agar sistem dapat mendeteksi pembayaran.',
        adminWaDigits,
        publicToken: publicToken || '',
        proofUrl: '',
        proofActionUrl: '/customer/payment/proof/' + encodeURIComponent(String(inv.id))
      });
    }
    
    let method =
      gateway === 'midtrans' ? (methodRaw === 'SNAP' ? 'snap' : methodRaw) :
      gateway === 'xendit' ? (methodRaw === 'XENDIT' ? 'xendit' : methodRaw) :
      gateway === 'duitku' ? (methodRaw === 'DUITKU' ? 'duitku' : methodRaw) :
      methodRaw;
    const cust = customerSvc.getCustomerById(inv.customer_id);
    
    logger.info(`[Payment] Creating payment for INV-${inv.id}, Gateway: ${gateway}, Method: ${method}, Auth: ${loginId ? 'session' : 'publicToken'}`);
    
    // Tentukan base URL aplikasi untuk callback
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const appUrl = settings.app_url || `${protocol}://${host}`;

    let tripayChannels = null;
    let tripayCandidates = null;
    if (gateway === 'tripay') {
      try {
        tripayChannels = await paymentSvc.getTripayChannels();
        const allowedList = (tripayChannels || []).map(c => String(c?.code || '').toUpperCase()).filter(Boolean);
        tripayCandidates = tripayMethodCandidatesForAmount(tripayChannels, inv.amount);
        if (!tripayCandidates || tripayCandidates.length === 0) tripayCandidates = allowedList;
        const allowed = new Set(tripayCandidates);
        if (!allowed.has(method)) method = tripayCandidates[0] || 'QRIS';
      } catch (e) {
        throw new Error('Metode pembayaran Tripay tidak tersedia');
      }
    }

    let result;
    if (gateway === 'midtrans') result = await paymentSvc.createMidtransTransaction(inv, cust, method, appUrl);
    else if (gateway === 'xendit') result = await paymentSvc.createXenditTransaction(inv, cust, method, appUrl);
    else if (gateway === 'duitku') result = await paymentSvc.createDuitkuTransaction(inv, cust, method, appUrl);
    else {
      try {
        result = await paymentSvc.createTripayTransaction(inv, cust, method, appUrl);
      } catch (e) {
        const msg = String(e?.message || e || '');
        const canRetry =
          (msg.includes('Payment channel is not enabled') || msg.includes('Minimum payment amount')) &&
          Array.isArray(tripayChannels) &&
          tripayChannels.length > 0;
        if (!canRetry) throw e;

        const pool = (tripayCandidates && tripayCandidates.length > 0)
          ? tripayCandidates
          : tripayMethodCandidatesForAmount(tripayChannels, inv.amount);
        const fallback = (pool || []).filter(code => code && code !== method)[0];
        if (!fallback) throw e;

        method = fallback;
        result = await paymentSvc.createTripayTransaction(inv, cust, method, appUrl);
      }
    }
    
    if (result.success) {
      const resolvedExpiresAt =
        resolvePaymentExpiresAt(gateway, result) ||
        gatewayDefaultExpiresAtIso(gateway);
      // Simpan info pembayaran ke database
      billingSvc.updatePaymentInfo(inv.id, {
        gateway: gateway,
        order_id: result.order_id,
        link: result.link,
        reference: result.reference,
        payload: result.payload,
        expires_at: resolvedExpiresAt
      });

      logger.info(`[Payment] New link created for INV-${inv.id} via ${gateway}`);
      res.redirect(result.link);
    } else {
      throw new Error(result.message || 'Gagal membuat transaksi');
    }
  } catch (error) {
    logger.error(`[Payment] Create Error: ${error.message}`);
    res.status(500).send(`Terjadi kesalahan: ${error.message}`);
  }
});

router.post('/payment/proof/:invoiceId', uploadProof.single('proof'), async (req, res) => {
  const settings = getSettingsWithCache();
  const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
  const token = String(req.body && req.body.token ? req.body.token : '').trim();

  let payload = null;
  if (token) payload = verifyPublicToken(token, secret);

  const loginId = req.session && req.session.phone;
  const profile = payload ? null : findCustomerProfileByLoginId(loginId);

  const invoiceId = Number(req.params.invoiceId);
  if (!Number.isFinite(invoiceId) || invoiceId <= 0) return res.status(400).send('Invoice ID tidak valid');

  try {
    const inv = billingSvc.getInvoiceById(invoiceId);
    if (!inv) throw new Error('Tagihan tidak ditemukan');
    if (String(inv.status) !== 'unpaid') throw new Error('Tagihan sudah tidak bisa dikonfirmasi (status bukan unpaid).');

    if (payload) {
      if (Number(inv.customer_id) !== Number(payload.customerId)) throw new Error('Tagihan tidak valid');
    } else {
      if (!profile) throw new Error('Sesi tidak valid, silakan login ulang.');
      if (Number(inv.customer_id) !== Number(profile.id)) throw new Error('Tagihan tidak valid');
    }

    const { uniqueCode, amountUnique } = ensureInvoiceQrisUnique(inv, false);
    const qrisQrUrl = await getStaticQrisQrUrlForAmount(settings, amountUnique);
    if (!qrisQrUrl) throw new Error('QRIS statis belum diatur oleh admin');

    if (!req.file) throw new Error('Bukti transfer belum dipilih');
    const relPath = '/admin/media/payment-proof/' + String(req.file.filename || '');
    if (!relPath || relPath.endsWith('/')) throw new Error('Gagal menyimpan bukti');

    try {
      const noteLine = `Bukti bayar: ${relPath}`;
      db.prepare(`
        UPDATE invoices
        SET notes=CASE
          WHEN notes IS NULL OR TRIM(notes) = '' THEN ?
          ELSE notes || '\n' || ?
        END
        WHERE id=?
      `).run(noteLine, noteLine, invoiceId);
    } catch (e) {
      logger.error('[PaymentProof] Gagal simpan note: ' + (e?.message || e));
    }

    try {
      const adminWaDigits = getFirstAdminWaDigits(settings);
      if (settings.whatsapp_enabled && adminWaDigits) {
        const waNotify = require('../services/waNotifyService');
        if (await waNotify.isConnected()) {
          const who = payload ? (inv.customer_name || 'Pelanggan') : (profile?.name || inv.customer_name || 'Pelanggan');
          const msg =
            `🧾 *KONFIRMASI PEMBAYARAN (QRIS STATIS)*\n\n` +
            `👤 *Nama:* ${who}\n` +
            `🧾 *Invoice:* INV-${inv.id}\n` +
            `📅 *Periode:* ${inv.period_month}/${inv.period_year}\n` +
            `💰 *Nominal:* Rp ${Number(amountUnique).toLocaleString('id-ID')} (kode ${String(uniqueCode).padStart(3, '0')})\n` +
            `📎 *Bukti:* ${proofUrl}\n`;
          await waNotify.sendText(adminWaDigits, msg);
        }
      }
    } catch (e) {
      logger.error('[PaymentProof] WA error: ' + (e?.message || e));
    }

    const adminWaDigits = getFirstAdminWaDigits(settings);
    const backUrl = payload
      ? `/customer/check-billing?q=${encodeURIComponent(String(payload.lookup || ''))}`
      : '/customer/dashboard#billing-section';

    return res.render('qris_static', {
      settings,
      backUrl,
      error: null,
      info: 'Bukti transfer berhasil diupload. Silakan kirim konfirmasi ke admin.',
      kind: 'invoice',
      invoiceId: Number(inv.id),
      periodText: `${inv.period_month}/${inv.period_year}`,
      customerName: payload ? (inv.customer_name || '') : (profile?.name || inv.customer_name || ''),
      amountUnique,
      uniqueCode,
      qrisQrUrl,
      helpText: 'Pastikan nominal dibayar sama persis agar sistem dapat mendeteksi pembayaran.',
      adminWaDigits,
      publicToken: payload ? token : '',
      proofUrl,
      proofActionUrl: '/customer/payment/proof/' + encodeURIComponent(String(inv.id))
    });
  } catch (e) {
    const backUrl = payload
      ? `/customer/check-billing?q=${encodeURIComponent(String(payload.lookup || ''))}`
      : '/customer/dashboard#billing-section';
    return res.render('qris_static', {
      settings,
      backUrl,
      error: String(e?.message || e || 'Gagal'),
      info: null,
      kind: 'invoice',
      invoiceId,
      periodText: '',
      customerName: '',
      amountUnique: 0,
      uniqueCode: 0,
      qrisQrUrl: getStaticQrisQrUrl(settings),
      helpText: '',
      adminWaDigits: getFirstAdminWaDigits(settings),
      publicToken: payload ? token : '',
      proofUrl: '',
      proofActionUrl: '/customer/payment/proof/' + encodeURIComponent(String(invoiceId))
    });
  }
});

router.post('/voucher/proof/:orderId', uploadProof.single('proof'), async (req, res) => {
  const settings = getSettingsWithCache();
  const secret = settings.session_secret || 'rahasia-portal-pelanggan-default-ganti-ini';
  const token = String(req.body && req.body.token ? req.body.token : '').trim();
  const payload = verifyPublicToken(token, secret);
  const orderId = Number(req.params.orderId);
  if (!Number.isFinite(orderId) || orderId <= 0) return res.status(400).send('Order ID tidak valid');
  if (!payload || Number(payload.voucherOrderId) !== orderId) return res.status(403).send('Forbidden');

  try {
    const order = db.prepare('SELECT * FROM public_voucher_orders WHERE id=?').get(orderId);
    if (!order) throw new Error('Order tidak ditemukan');
    if (String(order.status) !== 'pending') throw new Error('Order sudah tidak bisa dikonfirmasi (status bukan pending).');

    const { uniqueCode, amountUnique } = ensureVoucherOrderQrisUnique(order, false);
    const qrisQrUrl = await getStaticQrisQrUrlForAmount(settings, amountUnique);
    if (!qrisQrUrl) throw new Error('QRIS statis belum diatur oleh admin');

    if (!req.file) throw new Error('Bukti transfer belum dipilih');
    const relPath = '/admin/media/payment-proof/' + String(req.file.filename || '');
    if (!relPath || relPath.endsWith('/')) throw new Error('Gagal menyimpan bukti');

    db.prepare(`
      UPDATE public_voucher_orders
      SET proof_url=?,
          updated_at=(NOW_LOCAL())
      WHERE id=?
    `).run(relPath, orderId);

    try {
      const adminWaDigits = getFirstAdminWaDigits(settings);
      if (settings.whatsapp_enabled && adminWaDigits) {
        const waNotify = require('../services/waNotifyService');
        if (await waNotify.isConnected()) {
          const msg =
            `🎫 *KONFIRMASI PEMBAYARAN VOUCHER (QRIS STATIS)*\n\n` +
            `🧾 *Order:* VOUCHER-${orderId}\n` +
            `📦 *Paket:* ${order.profile_name || '-'}${order.validity ? ' (' + order.validity + ')' : ''}\n` +
            `💰 *Nominal:* Rp ${Number(amountUnique).toLocaleString('id-ID')} (kode ${String(uniqueCode).padStart(3, '0')})\n` +
            `📞 *WA Pembeli:* ${order.buyer_phone || '-'}\n` +
            `📎 *Bukti:* ${proofUrl}\n`;
          await waNotify.sendText(adminWaDigits, msg);
        }
      }
    } catch (e) {
      logger.error('[VoucherProof] WA error: ' + (e?.message || e));
    }

    const adminWaDigits = getFirstAdminWaDigits(settings);
    return res.render('qris_static', {
      settings,
      backUrl: '/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(token),
      error: null,
      info: 'Bukti transfer berhasil diupload. Menunggu verifikasi/auto-detect notifikasi.',
      kind: 'voucher',
      invoiceId: Number(orderId),
      periodText: `${order.profile_name || ''}${order.validity ? ' • ' + String(order.validity) : ''}`,
      customerName: order.buyer_phone ? `WA: ${order.buyer_phone}` : 'Pembeli Voucher',
      amountUnique,
      uniqueCode,
      qrisQrUrl,
      helpText: 'Jika notifikasi e-wallet sudah masuk ke sistem, voucher akan otomatis diproses.',
      adminWaDigits,
      publicToken: token,
      proofUrl,
      proofActionUrl: '/customer/voucher/proof/' + encodeURIComponent(String(orderId))
    });
  } catch (e) {
    return res.redirect('/customer/voucher?order=' + encodeURIComponent(String(orderId)) + '&t=' + encodeURIComponent(token) + '&err=' + encodeURIComponent(String(e?.message || e || 'Gagal')));
  }
});

/**
 * Webhook Callback (Multi-Gateway)
 */
router.get('/payment/callback', (req, res) => {
  res.json({ success: true, message: 'OK. Use POST for gateway notifications.' });
});
router.head('/payment/callback', (req, res) => res.status(200).end());
router.post('/payment/callback', express.json({
  verify: (req, res, buf) => {
    try {
      req.rawBody = buf.toString('utf8');
    } catch {}
  }
}), async (req, res) => {
  const settings = getSettingsWithCache();
  const tripaySignature = req.headers['x-callback-signature'];
  const midtransSignature = req.headers['x-callback-token']; // Midtrans usually uses Basic Auth or IP whitelist, but let's check payload
  
  const jsonBody = req.rawBody || JSON.stringify(req.body);
  let gatewayOrderId = null;
  let orderPrefix = null;
  let targetIdCandidate = null;
  let status = null;
  let gateway = null;

  // --- DETEKSI TRIPAY ---
  if (tripaySignature) {
    if (paymentSvc.verifyTripayWebhook(jsonBody, tripaySignature, settings.tripay_private_key)) {
      const { merchant_ref, status: tpStatus } = req.body;
      const parts = String(merchant_ref || '').split('-');
      gatewayOrderId = String(merchant_ref || '') || null;
      orderPrefix = (parts[0] || '').toUpperCase();
      targetIdCandidate = parts[1] || null;
      status = tpStatus === 'PAID' ? 'paid' : tpStatus;
      gateway = 'Tripay';
    } else {
      logger.error('[Webhook] Signature Tripay tidak valid');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
  } 
  // --- DETEKSI MIDTRANS ---
  else if (req.body.transaction_status && req.body.order_id) {
    const serverKey = settings.midtrans_server_key;
    if (paymentSvc.verifyMidtransWebhook(req.body, serverKey)) {
      const { order_id, transaction_status } = req.body;
      const parts = String(order_id || '').split('-');
      gatewayOrderId = String(order_id || '') || null;
      orderPrefix = (parts[0] || '').toUpperCase();
      targetIdCandidate = parts[1] || null;
      status = (transaction_status === 'settlement' || transaction_status === 'capture') ? 'paid' : transaction_status;
      gateway = 'Midtrans';
    } else {
      logger.error('[Webhook] Signature Midtrans tidak valid');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
  }
  // --- DETEKSI XENDIT ---
  else if (req.body.external_id && req.body.status && !tripaySignature) {
    const xenditToken = req.headers['x-callback-token'];
    const configuredToken = String(settings.xendit_callback_token || '').trim();
    const xenditConfigured = Boolean(
      settings.xendit_enabled &&
      String(settings.xendit_api_key || '').trim()
    );

    if (xenditConfigured && !configuredToken) {
      logger.error('[Webhook] Callback Token Xendit belum diatur');
      return res.status(401).json({ success: false, message: 'Xendit callback token not configured' });
    }

    if (configuredToken && xenditToken === configuredToken) {
      const { external_id, status: xStatus } = req.body;
      const parts = String(external_id || '').split('-');
      gatewayOrderId = String(external_id || '') || null;
      orderPrefix = (parts[0] || '').toUpperCase();
      targetIdCandidate = parts[1] || null;
      status = xStatus === 'PAID' ? 'paid' : xStatus;
      gateway = 'Xendit';
    } else {
      logger.error('[Webhook] Callback Token Xendit tidak valid');
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  }
  // --- DETEKSI DUITKU ---
  else if (req.body.merchantCode && req.body.merchantOrderId && req.body.resultCode) {
    if (paymentSvc.verifyDuitkuWebhook(req.body, settings.duitku_api_key)) {
      const { merchantOrderId, resultCode } = req.body;
      const parts = String(merchantOrderId || '').split('-');
      gatewayOrderId = String(merchantOrderId || '') || null;
      orderPrefix = (parts[0] || '').toUpperCase();
      targetIdCandidate = parts[1] || null;
      status = resultCode === '00' ? 'paid' : resultCode;
      gateway = 'Duitku';
    } else {
      logger.error('[Webhook] Signature Duitku tidak valid');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }
  }

  if (gatewayOrderId && status === 'paid') {
// --- 3. Cek Pesanan Voucher Hotspot (Prefix VOUCHER) ---
    if (orderPrefix === 'VOUCHER' || gatewayOrderId.startsWith('VOUCHER')) {
      const order = db.prepare('SELECT * FROM public_voucher_orders WHERE payment_order_id = ? OR id = ?').get(gatewayOrderId, targetIdCandidate);
      if (order) {
        const orderId = Number(order.id || 0);
        if (!Number.isFinite(orderId) || orderId <= 0) return res.json({ success: true });

        logger.info(`[Webhook] Pembayaran diterima via ${gateway} untuk Voucher Order ID: ${orderId}`);

        if (String(order.status) !== 'paid' && String(order.status) !== 'fulfilled') {
          db.prepare(`
            UPDATE public_voucher_orders
            SET status='paid', paid_at=(NOW_LOCAL()), updated_at=(NOW_LOCAL())
            WHERE id=?
          `).run(orderId);
        }

        const fresh = db.prepare('SELECT * FROM public_voucher_orders WHERE id = ?').get(orderId);
        if (!fresh) return res.json({ success: true });
        if (String(fresh.status) === 'fulfilled' && fresh.voucher_code) return res.json({ success: true });

        try {
          let created = null;
          let attempt = 0;
          
          // ── Load Paket Voucher Config ──────────────────
          let prefix = '';
          let codeLength = 6;
          let charset = 'mixed';
          try {
            const pkg = db.prepare('SELECT * FROM voucher_packages WHERE router_id IS ? AND profile_name = ?').get(fresh.router_id ?? null, fresh.profile_name);
            if (pkg) {
              prefix = String(pkg.prefix || '').trim();
              codeLength = Math.max(4, Math.min(16, Number(pkg.code_length) || 6));
              charset = String(pkg.charset || 'mixed');
            }
          } catch (pkgErr) {
            logger.error('[Fulfillment] Gagal query voucher_packages: ' + pkgErr.message);
          }

          while (attempt < 10) {
            attempt++;
            const coreLen = Math.max(4, codeLength - prefix.length);
            const now = new Date();
            const dd = String(now.getDate()).padStart(2, '0');
            const mm = String(now.getMonth() + 1).padStart(2, '0');
            const yy = String(now.getFullYear()).slice(-2);
            const comment = `vc-online-${dd}.${mm}.${yy}`;
            const userData = {
              server: 'all',
              name: code,
              password: pass,
              profile: fresh.profile_name,
              comment
            };
            if (fresh.validity) userData['limit-uptime'] = fresh.validity;

            try {
              await mikrotikService.addHotspotUser(userData, fresh.router_id ?? null);
              created = { code, pass, comment };
              break;
            } catch (e) {
              const msg = String(e?.message || e || '').toLowerCase();
              const isDup = msg.includes('already') || msg.includes('exist') || msg.includes('duplicate');
              if (isDup) continue;
              throw e;
            }
          }
          if (!created) throw new Error('Gagal membuat voucher (kode duplikat terlalu sering)');

          db.prepare(`
            UPDATE public_voucher_orders
            SET status='fulfilled',
                fulfilled_at=(NOW_LOCAL()),
                voucher_code=?,
                voucher_password=?,
                voucher_comment=?,
                updated_at=(NOW_LOCAL())
            WHERE id=?
          `).run(created.code, created.pass, created.comment, orderId);

          if (settings.whatsapp_enabled) {
            try {
              const waNotify = require('../services/waNotifyService');
              if (!(await waNotify.isConnected())) throw new Error('Bot WhatsApp belum terhubung');
              if (!fresh.buyer_phone) throw new Error('Nomor WhatsApp pembeli kosong');
              const msg =
                `🎫 *VOUCHER HOTSPOT*\n\n` +
                `✅ Pembayaran diterima via *${gateway}*\n` +
                `📦 Paket: *${fresh.profile_name}* (${fresh.validity || '-'})\n` +
                `💰 Harga: Rp ${Number(fresh.price || 0).toLocaleString('id-ID')}\n\n` +
                `👤 User: *${created.code}*\n` +
                `🔑 Pass: *${created.pass}*\n\n` +
                `Terima kasih.`;
              await waNotify.sendText(fresh.buyer_phone, msg);
              db.prepare(`
                UPDATE public_voucher_orders
                SET wa_sent=1, wa_sent_at=(NOW_LOCAL()), wa_error='', updated_at=(NOW_LOCAL())
                WHERE id=?
              `).run(orderId);
            } catch (waErr) {
              db.prepare(`
                UPDATE public_voucher_orders
                SET wa_sent=0, wa_error=?, updated_at=(NOW_LOCAL())
                WHERE id=?
              `).run(String(waErr?.message || waErr || ''), orderId);
            }
          }
        } catch (e) {
          logger.error(`[Webhook] Voucher fulfill gagal (order=${orderId}): ${e.message}`);
        }
      }
      return res.json({ success: true });
    }

    // --- 4. Cek Tagihan Bulanan / Pelanggan (Prefix INV) ---
    const idNum = Number(targetIdCandidate || 0);
    if (idNum > 0 && (orderPrefix === 'INV' || !orderPrefix || gatewayOrderId.startsWith('INV'))) {
      logger.info(`[Webhook] Pembayaran diterima via ${gateway} untuk Invoice ID: ${idNum}`);

      const checkInv = billingSvc.getInvoiceById(idNum);
      if (checkInv && checkInv.status !== 'paid') {
        billingSvc.markAsPaid(idNum, gateway, `Otomatis via Webhook ${gateway}`);

        const customer = customerSvc.getCustomerById(checkInv.customer_id);
        
        try {
          const waNotify = require('../services/waNotifyService');
          if (!(await waNotify.isConnected())) {
            throw new Error('Bot WhatsApp belum terhubung');
          }
          if (!customer.phone) {
            throw new Error('Nomor WhatsApp pelanggan kosong');
          }
          const appUrl = (getSettingsWithCache().public_base_url || appUrlFromReq(req) || '').replace(/\/$/, '');
          const portalUrl = `${appUrl}/customer`;
          const template = db.getAppSetting('whatsapp_payment_success_message', '');

          const formattedMsg = whatsappService.formatPaymentSuccessMessage({
            customerName: customer.name || checkInv.customer_name || 'Pelanggan',
            invoiceId: checkInv.id,
            customerUsername: customer.pppoe_username || customer.id || '-',
            customerCode: customer.customer_code || '',
            packageName: checkInv.package_name || '-',
            periodMonth: checkInv.period_month,
            periodYear: checkInv.period_year,
            amount: checkInv.amount,
            paymentMethod: gateway || 'Online Gateway',
            paidAt: checkInv.paid_at || new Date(),
            companyName: settings.company_header || 'OPEN-ISP',
            companyPhone: settings.company_phone || '',
            portalUrl,
            customTemplate: template
          });

          await waNotify.sendText(customer.phone, formattedMsg);
        } catch (waErr) {
          logger.error(`[Webhook] Gagal kirim notif WA: ${waErr.message}`);
        }

        if (customer && customer.status === 'suspended') {
          const unpaidCount = billingSvc.getUnpaidInvoicesByCustomerId(customer.id).length;
          if (unpaidCount === 0) {
            logger.info(`[Webhook] Mengaktifkan kembali pelanggan ${customer.name} secara otomatis.`);
            await customerSvc.activateCustomer(customer.id);
          }
        }
      }
    }
  }

  res.json({ success: true });
});

router.post('/customer/reconnect', async (req, res) => {
  try {
    const sessionPhone = req.session.phone;
    if (!sessionPhone) {
      if (req.xhr || req.headers.accept?.includes('json')) {
        return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu' });
      }
      return res.redirect('/customer/login');
    }

    const customer = customerSvc.findCustomerByAny(sessionPhone);
    if (!customer) throw new Error('Data pelanggan tidak ditemukan');

    const username = customer.pppoe_username || customer.hotspot_username || customer.name;
    const radiusSvc = require('../services/radiusServerService');
    const mikrotikSvc = require('../services/mikrotikService');

    let reconnected = false;
    if (username) {
      await radiusSvc.disconnectSession(username);
      await mikrotikSvc.kickPppoeUser(username, customer.router_id);
      await mikrotikSvc.kickHotspotUser(username, customer.router_id);
      reconnected = true;
    }

    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.json({
        success: true,
        message: 'Koneksi internet Anda berhasil direfresh! Silakan tunggu 2-3 detik agar IP & kecepatan kembali normal.'
      });
    }

    req.session._msg = { type: 'success', text: 'Koneksi internet Anda berhasil direfresh! Silakan tunggu 2-3 detik agar IP & kecepatan kembali normal.' };
    return res.redirect('/customer/dashboard');
  } catch (e) {
    logger.error('[Customer Reconnect] Error: ' + e.message);
    if (req.xhr || req.headers.accept?.includes('json')) {
      return res.status(500).json({ success: false, message: 'Gagal refresh koneksi: ' + e.message });
    }
    req.session._msg = { type: 'error', text: 'Gagal refresh koneksi: ' + e.message };
    return res.redirect('/customer/dashboard');
  }
});

router.ensureInvoiceQrisUnique = ensureInvoiceQrisUnique;
router.getStaticQrisQrUrlForAmount = getStaticQrisQrUrlForAmount;

module.exports = router;
