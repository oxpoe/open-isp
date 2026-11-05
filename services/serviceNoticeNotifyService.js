'use strict';
/**
 * serviceNoticeNotifyService.js
 * Notifikasi WhatsApp ke pelanggan untuk:
 *  - tiket gangguan yang baru dibuat
 *  - pengumuman gangguan/perbaikan dari halaman Status Layanan
 *  - pemberitahuan layanan pulih (mode kembali NORMAL)
 *
 * Pengiriman broadcast berjalan di latar belakang dengan jeda acak
 * mengikuti setting whatsapp_broadcast_delay (anti-banned).
 */
const customerSvc = require('./customerService');
const waNotify = require('./waNotifyService');
const { getSetting } = require('../config/settingsManager');
const { logger } = require('../config/logger');

let _running = false;

function digits(p) {
  return String(p || '').replace(/\D/g, '');
}

function companyName() {
  return getSetting('company_header', 'OPEN-ISP') || 'OPEN-ISP';
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function delayMs() {
  const sec = Number(getSetting('whatsapp_broadcast_delay', 5)) || 5;
  return Math.max(2000, sec * 1000) + Math.floor(Math.random() * 1500);
}

function ticketMessage(customer, ticketId, subject) {
  return `✅ *Laporan Diterima*\n\n` +
    `Halo *${customer.name || 'Pelanggan'}*, laporan gangguan Anda sudah kami terima.\n\n` +
    `🎫 *No. Tiket:* #TCK-${ticketId}\n` +
    `📝 *Subjek:* ${subject}\n\n` +
    `Tim teknisi akan segera menindaklanjuti. Kami akan mengabari lagi setelah laporan selesai.\n\n` +
    `_${companyName()}_`;
}

function noticeMessage(notice, customer) {
  let text = `⚠️ *${notice.label || 'Informasi Layanan'}*\n\n` +
    `Halo *${customer.name || 'Pelanggan'}*,\n${notice.text || ''}\n`;
  if (notice.startText) text += `\n🕒 *Mulai:* ${notice.startText}`;
  if (notice.estimateText) text += `\n⏳ *Estimasi Selesai:* ${notice.estimateText}`;
  text += `\n\nMohon maaf atas ketidaknyamanannya.\n\n_${companyName()}_`;
  return text;
}

function recoveryMessage(customer) {
  return `✅ *Layanan Kembali Normal*\n\n` +
    `Halo *${customer.name || 'Pelanggan'}*, gangguan/perbaikan layanan sudah selesai dan internet Anda dapat digunakan kembali seperti biasa.\n\n` +
    `Terima kasih atas kesabaran Anda.\n\n_${companyName()}_`;
}

async function notifyTicketCreated(customer, ticketId, subject) {
  try {
    if (!getSetting('whatsapp_enabled', false)) return false;
    const phone = digits(customer && customer.phone);
    if (phone.length < 8) return false;
    return await waNotify.sendText(phone, ticketMessage(customer, ticketId, subject || 'Gangguan Layanan'));
  } catch (e) {
    logger.error(`[NoticeWA] notifyTicketCreated: ${e.message}`);
    return false;
  }
}

function selectTargets({ target, area, routerId }) {
  let list = [];
  try {
    list = customerSvc.getAllCustomers(
      '',
      target === 'router' && routerId ? Number(routerId) : null,
      'active',
      target === 'area' ? String(area || '') : '',
      {}
    ) || [];
  } catch (e) {
    logger.warn(`[NoticeWA] gagal memilih target: ${e.message}`);
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const phone = digits(c.phone);
    if (phone.length >= 8 && !seen.has(phone)) {
      seen.add(phone);
      out.push({ ...c, phone });
    }
  }
  return out;
}

/**
 * Kirim pengumuman ke pelanggan aktif (latar belakang).
 * @returns {{ok:boolean,total?:number,reason?:string}}
 */
async function broadcastNotice({ mode, target, area, routerId, notice }) {
  if (_running) return { ok: false, reason: 'busy' };
  if (!getSetting('whatsapp_enabled', false)) return { ok: false, reason: 'wa_disabled' };

  const recipients = selectTargets({ target: target || 'all', area, routerId });
  if (!recipients.length) return { ok: false, reason: 'empty' };

  const isRecovery = mode === 'NORMAL';
  _running = true;
  logger.info(`[NoticeWA] mulai mode=${mode} target=${target || 'all'} total=${recipients.length}`);

  (async () => {
    let sent = 0;
    let failed = 0;
    for (const c of recipients) {
      await sleep(delayMs());
      try {
        const ok = await waNotify.sendText(c.phone, isRecovery ? recoveryMessage(c) : noticeMessage(notice, c));
        if (ok) sent++; else failed++;
      } catch (e) {
        failed++;
      }
    }
    _running = false;
    logger.info(`[NoticeWA] selesai mode=${mode} terkirim=${sent} gagal=${failed}`);
  })();

  return { ok: true, total: recipients.length };
}

function isRunning() {
  return _running;
}

module.exports = { notifyTicketCreated, broadcastNotice, isRunning };
