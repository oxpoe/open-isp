'use strict';
/**
 * waNotifyService.js — kirim notifikasi WA mengikuti gateway aktif
 * (gowa / baileys / fonnte / meta). Mendukung teks, gambar, dan dokumen.
 */
const fs = require('fs');
const path = require('path');
const { getSetting } = require('../config/settingsManager');

function gateway() {
  return String(getSetting('wa_gateway_type', 'baileys') || 'baileys').toLowerCase();
}

function spx(t) {
  return String(t || '').replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, function (m, c) {
    const arr = c.split('|');
    return arr[Math.floor(Math.random() * arr.length)].trim();
  });
}

function publicBaseUrl() {
  let base = String(getSetting('public_base_url', '') || '').trim();
  if (base) return base.replace(/\/+$/, '');
  const host = String(getSetting('server_host', '') || '').trim();
  const port = Number(getSetting('server_port', 3001) || 3001);
  if (!host) return '';
  const proto = port === 443 ? 'https' : 'http';
  const h = /^https?:\/\//i.test(host) ? host.replace(/\/+$/, '') : (proto + '://' + host);
  return (port === 80 || port === 443) ? h : (h + ':' + port);
}

function saveTemp(buffer, ext) {
  try {
    const dir = path.join(__dirname, '..', 'public', 'uploads', 'notif');
    fs.mkdirSync(dir, { recursive: true });
    const name = 'notif-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'bin');
    fs.writeFileSync(path.join(dir, name), buffer);
    const base = publicBaseUrl();
    return (base ? base : '') + '/uploads/notif/' + name;
  } catch (e) { return ''; }
}

async function sendText(phone, text) {
  try {
    const whatsappService = require('./whatsappService');
    await whatsappService.sendWhatsAppMessage(phone, spx(text));
    return true;
  } catch (e) { return false; }
}

async function sendMetaImage(phone, buffer, caption) {
  try {
    const phoneId = getSetting('meta_phone_number_id', '');
    const token = getSetting('meta_access_token', '');
    if (!phoneId || !token) return await sendText(phone, caption || '');
    const fd = new FormData();
    fd.append('messaging_product', 'whatsapp');
    fd.append('type', 'image/png');
    fd.append('file', new Blob([buffer], { type: 'image/png' }), 'qris.png');
    const up = await fetch('https://graph.facebook.com/v20.0/' + phoneId + '/media', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    const upj = await up.json().catch(() => null);
    if (!up.ok || !upj || !upj.id) return await sendText(phone, caption || '');
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '62' + digits.slice(1);
    const send = await fetch('https://graph.facebook.com/v20.0/' + phoneId + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: digits, type: 'image', image: { id: upj.id, caption: caption || '' } })
    });
    return send.ok;
  } catch (e) { return false; }
}

async function sendImage(phone, imageBuffer, caption) {
  const gw = gateway();
  caption = spx(caption || '');
  try {
    if (gw === 'gowa') { await require('./gowaWhatsappService').sendGowaImage(phone, imageBuffer, caption || ''); return true; }
    if (gw === 'baileys') { const mod = await import('./whatsappBot.mjs'); return await mod.sendWAImage(phone, imageBuffer, caption || ''); }
    if (gw === 'fonnte') {
      const url = saveTemp(imageBuffer, 'png');
      if (!url) return await sendText(phone, caption || '');
      const fonnte = require('./fonnteWhatsappService');
      await fonnte.sendFonnteMessage(phone, caption || '', { url: url, filename: 'qris.png' });
      return true;
    }
    if (gw === 'meta') return await sendMetaImage(phone, imageBuffer, caption);
    return await sendText(phone, caption || '');
  } catch (e) { return false; }
}

async function sendDocument(phone, docBuffer, filename, caption, mimetype) {
  const gw = gateway();
  const fn = filename || 'file.pdf';
  caption = spx(caption || '');
  try {
    if (gw === 'gowa') { await require('./gowaWhatsappService').sendGowaDocument(phone, docBuffer, fn, caption || '', mimetype || 'application/pdf'); return true; }
    if (gw === 'baileys') { const mod = await import('./whatsappBot.mjs'); return await mod.sendWADocument(phone, docBuffer, fn, caption || '', mimetype || 'application/pdf'); }
    if (gw === 'fonnte') {
      const ext = (fn.split('.').pop() || 'bin');
      const url = saveTemp(docBuffer, ext);
      if (!url) return await sendText(phone, caption || '');
      const fonnte = require('./fonnteWhatsappService');
      await fonnte.sendFonnteMessage(phone, caption || '', { url: url, filename: fn });
      return true;
    }
    // meta + lain: fallback teks
    return await sendText(phone, caption || '');
  } catch (e) { return false; }
}

function normalizeNum(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return d.length >= 8 ? d : '';
}

async function sendToStaff(text) {
  const set = new Set();
  try {
    const admins = getSetting('whatsapp_admin_numbers', []);
    (Array.isArray(admins) ? admins : String(admins || '').split(',')).forEach((p) => { const n = normalizeNum(p); if (n) set.add(n); });
  } catch (e) {}
  try {
    const techs = require('./techService').getAllTechnicians() || [];
    techs.filter((t) => t.is_active === 1 && t.phone).forEach((t) => { const n = normalizeNum(t.phone); if (n) set.add(n); });
  } catch (e) {}
  let sent = 0;
  for (const p of set) { if (await sendText(p, text)) sent++; }
  return { sent: sent, total: set.size };
}

let _connCache = { at: 0, val: false };
async function isConnected() {
  const now = Date.now();
  if (now - _connCache.at < 5000) return _connCache.val;
  const gw = gateway();
  let val = false;
  try {
    if (gw === 'gowa') {
      const st = await require('./gowaWhatsappService').gowaStatus();
      const d = (st && st.data && st.data.results) || (st && st.data) || {};
      val = !!(d.is_connected || d.is_logged_in || d.connected);
    } else if (gw === 'baileys') {
      const mod = await import('./whatsappBot.mjs');
      const s = mod.whatsappStatus;
      val = !!(s && s.connection === 'open');
    } else {
      val = true;
    }
  } catch (e) { val = false; }
  _connCache = { at: now, val: val };
  return val;
}

module.exports = { sendText, sendImage, sendDocument, sendToStaff, isConnected, gateway };
