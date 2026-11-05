/**
 * gowaWhatsappService.js — Adapter WhatsApp Gateway GOWA
 * (go-whatsapp-web-multidevice — https://github.com/aldinokemal/go-whatsapp-web-multidevice)
 *
 * Ringan (single binary Go). REST API (default port 3000):
 *   POST /send/message   { phone, message }
 *   POST /send/image     multipart (phone, caption, image)
 *   POST /send/document  multipart (phone, caption, document, filename)
 *   GET  /devices[/:id/status]
 * Auth opsional: HTTP Basic (APP_BASIC_AUTH). Device: header X-Device-Id.
 */
const { getSetting } = require('../config/settingsManager');
const { logger } = require('../config/logger');

function baseUrl() {
  return String(getSetting('gowa_base_url', 'http://127.0.0.1:3000') || '').trim().replace(/\/+$/, '') || 'http://127.0.0.1:3000';
}
function authHeader() {
  const u = String(getSetting('gowa_username', '') || '').trim();
  const p = String(getSetting('gowa_password', '') || '').trim();
  if (u && p) return 'Basic ' + Buffer.from(u + ':' + p).toString('base64');
  const raw = String(getSetting('gowa_basic_auth', '') || '').trim();
  if (raw) return 'Basic ' + Buffer.from(raw).toString('base64');
  return null;
}
function deviceHeader(override) {
  const v = (override !== undefined) ? override : getSetting('gowa_device_id', '');
  return String(v || '').trim();
}
function commonHeaders(extra, devOverride) {
  const h = Object.assign({}, extra || {});
  const auth = authHeader(); if (auth) h.Authorization = auth;
  const dev = deviceHeader(devOverride); if (dev) h['X-Device-Id'] = dev;
  return h;
}
// Device ID OPSIONAL: dipakai bila device >1 (atau cocok dgn yg diset).
// Bila cuma 1 device -> otomatis dipakai, tidak wajib diisi. Hasil di-cache 60s.
let _devCache = { id: null, at: 0 };
function invalidateDeviceCache() { _devCache = { id: null, at: 0 }; }
async function resolveDeviceId(force) {
  const configured = deviceHeader();
  if (!force && _devCache.at && (Date.now() - _devCache.at) < 60000) return _devCache.id;
  let list = [];
  try { list = await listDevices(); } catch (e) { list = []; }
  const has = function (id) { return list.some(function (d) { return String(d.id) === id; }); };
  let chosen;
  if (configured && has(configured)) chosen = configured;              // device id diset & ada -> pakai itu
  else if (list.length === 1) chosen = String(list[0].id);            // cuma 1 device -> otomatis
  else if (list.length > 1) chosen = configured || String(list[0].id); // >1 device -> pakai yg diset / pertama
  else chosen = configured;                                          // GOWA tak beri list -> serahkan ke GOWA
  _devCache = { id: chosen, at: Date.now() };
  return chosen;
}
function normalizePhoneJid(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return d + '@s.whatsapp.net';
}

async function postJson(path, body) {
  let dev = await resolveDeviceId();
  let res = await fetch(baseUrl() + path, {
    method: 'POST',
    headers: commonHeaders({ 'Content-Type': 'application/json' }, dev),
    body: JSON.stringify(body)
  });
  let text = await res.text();
  // auto-recovery: device id lama/tidak valid -> refresh device & coba sekali lagi
  if (!res.ok && /device/i.test(text) && dev) {
    invalidateDeviceCache();
    dev = await resolveDeviceId(true);
    res = await fetch(baseUrl() + path, {
      method: 'POST',
      headers: commonHeaders({ 'Content-Type': 'application/json' }, dev),
      body: JSON.stringify(body)
    });
    text = await res.text();
  }
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  if (!res.ok) throw new Error('GOWA HTTP ' + res.status + ': ' + String(text).slice(0, 200));
  return json;
}
function buildForm(fields) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (v && v.__file) fd.append(k, new Blob([v.buffer], { type: v.mimetype || 'application/octet-stream' }), v.filename || 'file');
    else fd.append(k, String(v));
  }
  return fd;
}
async function postForm(path, fields) {
  let dev = await resolveDeviceId();
  let res = await fetch(baseUrl() + path, { method: 'POST', headers: commonHeaders(undefined, dev), body: buildForm(fields) });
  let text = await res.text();
  if (!res.ok && /device/i.test(text) && dev) {
    invalidateDeviceCache();
    dev = await resolveDeviceId(true);
    res = await fetch(baseUrl() + path, { method: 'POST', headers: commonHeaders(undefined, dev), body: buildForm(fields) });
    text = await res.text();
  }
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  if (!res.ok) throw new Error('GOWA HTTP ' + res.status + ': ' + String(text).slice(0, 200));
  return json;
}

async function sendGowaMessage(toPhone, messageText, options = {}) {
  const json = await postJson('/send/message', { phone: normalizePhoneJid(toPhone), message: String(messageText || '') });
  return { success: true, gateway: 'gowa', id: (json && json.results && json.results.message_id) || null, raw: json };
}
async function sendGowaImage(toPhone, imageBuffer, caption = '', options = {}) {
  const buf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer || []);
  if (!buf.length) throw new Error('Buffer gambar kosong');
  const json = await postForm('/send/image', {
    phone: normalizePhoneJid(toPhone),
    caption: String(caption || ''),
    image: { __file: true, buffer: buf, mimetype: options.mimetype || 'image/jpeg', filename: options.filename || 'image.jpg' }
  });
  return { success: true, gateway: 'gowa', raw: json };
}
async function sendGowaDocument(toPhone, documentBuffer, filename = 'file.pdf', caption = '', mimetype = 'application/pdf', options = {}) {
  const buf = Buffer.isBuffer(documentBuffer) ? documentBuffer : Buffer.from(documentBuffer || []);
  if (!buf.length) throw new Error('Buffer dokumen kosong');
  const json = await postForm('/send/file', {
    phone: normalizePhoneJid(toPhone),
    caption: String(caption || ''),
    filename: filename || 'file.pdf',
    file: { __file: true, buffer: buf, mimetype: mimetype || 'application/pdf', filename: filename || 'file.pdf' }
  });
  return { success: true, gateway: 'gowa', raw: json };
}
async function testReachability(opts = {}) {
  // Nilai form boleh dipakai tanpa menyimpan pengaturan lebih dulu.
  const base = String(opts.baseUrl || baseUrl()).trim().replace(/\/+$/, '') || baseUrl();
  const headers = {};
  if (opts.username && opts.password) {
    headers.Authorization = 'Basic ' + Buffer.from(opts.username + ':' + opts.password).toString('base64');
  } else {
    Object.assign(headers, commonHeaders());
  }
  const out = { baseUrl: base, reachable: false, healthStatus: 0, authOk: false, devices: 0, message: '' };
  try {
    const res = await fetch(base + '/health');
    out.healthStatus = res.status;
    out.reachable = res.ok;
  } catch (e) {
    out.message = 'Tidak terjangkau: ' + e.message;
    return out;
  }
  if (!out.reachable) {
    out.message = 'GOWA menjawab, tetapi /health mengembalikan HTTP ' + out.healthStatus;
    return out;
  }
  try {
    const res = await fetch(base + '/devices', { headers: headers });
    out.authStatus = res.status;
    const json = await res.json().catch(function () { return null; });
    const list = (json && Array.isArray(json.results)) ? json.results : [];
    if (res.ok) {
      out.authOk = true;
      out.devices = list.length;
      out.message = 'GOWA terjangkau' + (list.length ? ' — ' + list.length + ' device terdaftar' : ' — belum ada device, scan QR untuk menautkan');
    } else if (res.status === 401) {
      out.message = 'GOWA terjangkau, tetapi username/password Basic Auth salah atau kosong';
    } else {
      out.message = 'GOWA terjangkau, tetapi /devices membalas HTTP ' + res.status;
    }
  } catch (e) {
    out.message = 'GOWA terjangkau, tetapi gagal cek kredensial: ' + e.message;
  }
  return out;
}

async function testGowaConnection(phone, message) {
  return await sendGowaMessage(phone, message || 'Tes koneksi GOWA berhasil ✅');
}
async function gowaStatus() {
  try {
    const dev = deviceHeader();
    const url = baseUrl() + (dev ? '/devices/' + encodeURIComponent(dev) + '/status' : '/devices');
    const res = await fetch(url, { headers: commonHeaders() });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: json };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function listDevices() {
  try {
    const res = await fetch(baseUrl() + '/devices', { headers: commonHeaders() });
    const json = await res.json().catch(function () { return null; });
    return (json && Array.isArray(json.results)) ? json.results : [];
  } catch (e) { return []; }
}
async function createDevice() {
  const res = await fetch(baseUrl() + '/devices', { method: 'POST', headers: commonHeaders({ 'Content-Type': 'application/json' }), body: '{}' });
  const json = await res.json().catch(function () { return null; });
  return (json && json.results) ? json.results : null;
}
let _lastQr = { link: null, at: 0 };
async function ensureDevice() {
  const list = await listDevices();
  const configured = deviceHeader();
  if (configured && list.some(function (d) { return String(d.id) === configured; })) return configured;
  if (list.length) return String(list[0].id);
  const created = await createDevice().catch(function () { return null; });
  return created && created.id ? String(created.id) : (configured || null);
}
async function getLoginQr(deviceId) {
  const dev = deviceId || deviceHeader();
  const url = baseUrl() + '/app/login' + (dev ? ('?device_id=' + encodeURIComponent(dev)) : '');
  try {
    const res = await fetch(url, { headers: commonHeaders() });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (!res.ok) {
      const detail = String(
        (json && (json.message || json.error || json.code)) || text || ''
      ).replace(/\s+/g, ' ').trim().slice(0, 160);
      return {
        ok: false,
        status: res.status,
        code: (json && json.code) || null,
        message: detail || ('HTTP ' + res.status)
      };
    }
    const r = (json && json.results) || {};
    const link = r.qr_link || r.image_path || null;
    if (link) _lastQr = { link: link, at: Date.now() };
    return { ok: !!link, qr_link: link, duration: r.qr_duration || null, device_id: r.device_id || dev || null, code: (json && json.code) || null };
  } catch (e) {
    return { ok: false, status: 0, code: null, message: e.message };
  }
}
// GOWA bisa mengembalikan qr_link absolut ke host internal (127.0.0.1 / nama
// container). Ambil path-nya saja lalu tempel ke base URL yang dikonfigurasi,
// supaya gambar tetap bisa diambil saat GOWA diakses lewat domain/reverse proxy.
function resolveQrLink(link) {
  const l = String(link || '').trim();
  if (!l) return '';
  if (/^data:/i.test(l)) return l;
  try {
    const u = new URL(l, baseUrl() + '/');
    const base = new URL(baseUrl());
    return base.origin + u.pathname + u.search;
  } catch (e) {
    return baseUrl() + (l.charAt(0) === '/' ? l : '/' + l);
  }
}

async function getLastQrImage() {
  if (!_lastQr.link) return null;
  const url = resolveQrLink(_lastQr.link);
  try {
    const res = await fetch(url, { headers: commonHeaders() });
    if (!res.ok) {
      logger.warn(`[GOWA] Gagal ambil gambar QR: HTTP ${res.status} (${url})`);
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, contentType: res.headers.get('content-type') || 'image/png' };
  } catch (e) {
    logger.warn(`[GOWA] Gagal ambil gambar QR: ${e.message} (${url})`);
    return null;
  }
}

module.exports = { sendGowaMessage, sendGowaImage, sendGowaDocument, testGowaConnection, testReachability, gowaStatus, listDevices, ensureDevice, getLoginQr, getLastQrImage, normalizePhoneJid, baseUrl, resolveDeviceId, invalidateDeviceCache };
