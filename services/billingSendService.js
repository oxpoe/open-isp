'use strict';
/**
 * billingSendService.js — Kirim notifikasi tagihan (manual) dengan opsi:
 * - target tanggal isolir (isolate_day)
 * - template (dapat dipilih)
 * - interval statis atau random (anti-ban)
 * Status dipantau dari halaman admin.
 */
const db = require('../config/database');
const { getSetting } = require('../config/settingsManager');
const billingSvc = require('./billingService');

const TEMPLATE_LABELS = {
  whatsapp_auto_billing_message: 'Pengingat Tagihan',
  whatsapp_billing_qris_message: 'Tagihan QRIS (dengan gambar QR)',
  whatsapp_arrears_warning_message: 'Peringatan Tunggakan',
  whatsapp_isolir_message: 'Pemberitahuan Isolir',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let STATUS = {
  running: false, total: 0, sent: 0, failed: 0, skipped: 0,
  startedAt: null, finishedAt: null, last: '', label: '', stopped: false,
};

function getStatus() { return STATUS; }

function stop() { STATUS.stopped = true; return STATUS; }

function portalLink() {
  let b = String(getSetting('public_base_url', '') || '').trim();
  if (!b) { const h = String(getSetting('server_host', '') || '').trim(); if (h) b = (/^https?:\/\//i.test(h) ? h : 'http://' + h); }
  return (b ? b.replace(/\/+$/, '') : '') + '/customer';
}

function spintax(t) {
  return String(t || '').replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, function (m, c) {
    const a = c.split('|'); return a[Math.floor(Math.random() * a.length)].trim();
  });
}

function buildMessage(tplRaw, c, inv) {
  const amount = Number(inv.amount || 0);
  const period = inv.period_month + '/' + inv.period_year;
  return spintax(String(tplRaw || '')
    .replace(/{{id_pelanggan}}/gi, c.customer_code || ('ID:' + c.id))
    .replace(/{{nama}}/gi, c.name || 'Pelanggan')
    .replace(/{{paket}}/gi, inv.package_name || '-')
    .replace(/{{tagihan}}/gi, amount.toLocaleString('id-ID'))
    .replace(/{{qris_nominal}}/gi, amount.toLocaleString('id-ID'))
    .replace(/{{rincian}}/gi, period)
    .replace(/{{periode}}/gi, period)
    .replace(/{{bulan_nunggak}}/gi, String(c.unpaid_streak || 0))
    .replace(/{{batas}}/gi, String(getSetting('auto_deactivate_months', 3) || 3))
    .replace(/{{link}}/gi, portalLink())
    .replace(/{{link_portal}}/gi, portalLink())
    .replace(/{{company}}/gi, getSetting('company_header', '') || '-')
    .replace(/{{company_phone}}/gi, getSetting('company_phone', '') || '-')
    .replace(/{{qris_qr}}/gi, 'QRIS terlampir'));
}

function buildTargets(isolateDay) {
  const targets = [];
  let q = "SELECT * FROM customers WHERE package_id IS NOT NULL AND status IN ('active','ditangguhkan','suspended')";
  const params = [];
  if (Number(isolateDay) > 0) { q += ' AND COALESCE(isolate_day,0)=?'; params.push(Number(isolateDay)); }
  q += ' ORDER BY name';
  const custs = db.prepare(q).all(...params);
  for (const c of custs) {
    let invs = [];
    try { invs = billingSvc.getUnpaidInvoicesByCustomerId(c.id) || []; } catch (e) {}
    if (!invs.length) continue;
    if (!c.phone || String(c.phone).replace(/\D/g, '').length < 9) continue;
    targets.push({ c, inv: invs[invs.length - 1] });
  }
  return targets;
}

async function start(opts = {}) {
  if (STATUS.running) throw new Error('Pengiriman sedang berjalan. Tunggu selesai atau hentikan dulu.');
  const isolateDay = parseInt(opts.isolateDay, 10) || 0;
  const templateKey = String(opts.templateKey || 'whatsapp_auto_billing_message');
  const intervalMode = String(opts.intervalMode || 'static').toLowerCase();
  const intervalValue = Math.max(3, parseInt(opts.intervalValue, 10) || 15);
  const intervalMin = Math.max(3, parseInt(opts.intervalMin, 10) || 15);
  const intervalMax = Math.max(intervalMin, parseInt(opts.intervalMax, 10) || 40);
  const isQris = /qris/i.test(templateKey) || templateKey === 'whatsapp_billing_qris_message';

  const def = 'Yth. {{nama}},\n\nBerikut tagihan internet Anda:\n📦 {{paket}}\n💰 Rp {{tagihan}}\n📅 {{rincian}}\n\nBayar: {{link}}';
  const tplRaw = db.getAppSetting(templateKey, def) || def;

  const targets = buildTargets(isolateDay);
  if (!targets.length) {
    try { db.prepare("INSERT INTO automation_runs (type, template_key, isolate_day, mode, interval_label, target, sent, failed, status, note) VALUES ('manual',?,?,?,'-',0,0,0,'empty','Tidak ada target')").run(templateKey, isolateDay, intervalMode); } catch (e) {}
    return { started: false, total: 0, message: 'Tidak ada target (pelanggan belum bayar) untuk tanggal isolir tsb.' };
  }

  STATUS = {
    running: true, total: targets.length, sent: 0, failed: 0, skipped: 0,
    startedAt: new Date().toISOString(), finishedAt: null, last: '',
    label: (isolateDay ? ('Isolir tgl ' + isolateDay) : 'Semua') + ' • ' + (TEMPLATE_LABELS[templateKey] || templateKey) + ' • ' + (intervalMode === 'random' ? ('acak ' + intervalMin + '-' + intervalMax + 's') : ('statis ' + intervalValue + 's')),
    stopped: false,
  };

  let runId = 0;
  try { runId = Number(db.prepare("INSERT INTO automation_runs (type, template_key, isolate_day, mode, interval_label, target, sent, failed, status) VALUES ('manual',?,?,?,?,?,0,0,'running')").run(templateKey, isolateDay, intervalMode, STATUS.label, targets.length).lastInsertRowid) || 0; } catch (e) {}

  const waNotify = require('./waNotifyService');
  let QRCode = null, ensureInvoiceQris = null;
  if (isQris) { try { QRCode = require('/opt/billing-rtrw/node_modules/qrcode'); } catch (e) {} try { ensureInvoiceQris = require('./invoiceQrisService').ensureInvoiceQris; } catch (e) {} }

  (async () => {
    for (let i = 0; i < targets.length; i++) {
      if (STATUS.stopped) break;
      const { c, inv } = targets[i];
      try {
        const caption = buildMessage(tplRaw, c, inv);
        if (isQris && QRCode && ensureInvoiceQris) {
          const qr = ensureInvoiceQris(inv) || {};
          if (qr.payload) {
            const url = await QRCode.toDataURL(qr.payload, { errorCorrectionLevel: 'M', margin: 1, width: 520 });
            const buf = Buffer.from(String(url).split(',')[1], 'base64');
            await waNotify.sendImage(c.phone, buf, caption);
          } else {
            await waNotify.sendText(c.phone, caption);
          }
        } else {
          await waNotify.sendText(c.phone, caption);
        }
        STATUS.sent++; STATUS.last = c.name;
      } catch (e) { STATUS.failed++; STATUS.last = c.name + ' (gagal)'; }
      if (i < targets.length - 1 && !STATUS.stopped) {
        const d = intervalMode === 'random'
          ? (intervalMin + Math.floor(Math.random() * (intervalMax - intervalMin + 1)))
          : intervalValue;
        await sleep(d * 1000);
      }
    }
    STATUS.running = false;
    STATUS.finishedAt = new Date().toISOString();
    if (runId) { try { db.prepare("UPDATE automation_runs SET sent=?, failed=?, status=?, finished_at=(NOW_LOCAL()) WHERE id=?").run(STATUS.sent, STATUS.failed, STATUS.stopped ? 'stopped' : 'done', runId); } catch (e) {} }
  })();

  return { started: true, total: targets.length, label: STATUS.label };
}

module.exports = { start, getStatus, stop, TEMPLATE_LABELS, buildTargets };
