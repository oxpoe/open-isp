'use strict';
/**
 * serviceNoticeService.js
 * Pengumuman status layanan (NORMAL / GANGGUAN MASAL / PERBAIKAN SISTEM).
 *
 * Mode diatur di panel admin (settings.json):
 *   notice_mode            : 'NORMAL' | 'GANGGUAN_MASAL' | 'PERBAIKAN'
 *   notice_start           : jam mulai gangguan/perbaikan (ISO lokal, mis. 2026-10-05T07:00)
 *   notice_interval_hours  : interval estimasi (jam), default 5
 *   notice_note            : catatan kustom (opsional)
 *
 * Estimasi selesai dihitung dinamis dan MAJU OTOMATIS tiap interval
 * selama admin belum mengubah mode kembali ke NORMAL:
 *   estimate = start + (floor((now - start) / interval) + 1) * interval
 * Contoh: start 07:00, interval 5 jam -> 12:00, 17:00, 22:00, ...
 */
const { getSetting } = require('../config/settingsManager');

const MODE_NORMAL = 'NORMAL';
const MODE_GANGGUAN = 'GANGGUAN_MASAL';
const MODE_PERBAIKAN = 'PERBAIKAN';

let _cache = { at: 0, value: null };

function getTimezone() {
  return getSetting('timezone', 'Asia/Jakarta') || 'Asia/Jakarta';
}

function fmtDateTime(d) {
  if (!d) return '-';
  try {
    const date = d instanceof Date ? d : new Date(d);
    if (!date || isNaN(date.getTime())) return '-';
    const timeZone = getTimezone();
    const tgl = date.toLocaleDateString('id-ID', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
    const jam = date.toLocaleTimeString('id-ID', { timeZone, hour: '2-digit', minute: '2-digit' });
    return `${jam} ${tgl}`;
  } catch (e) {
    return '-';
  }
}

function getIntervalHours() {
  let n = parseInt(getSetting('notice_interval_hours', 5), 10);
  if (!Number.isFinite(n) || n < 1) n = 5;
  if (n > 168) n = 168; // maksimal 1 minggu
  return n;
}

function normalizeMode(raw) {
  const mode = String(raw || '').trim().toUpperCase();
  if (mode === MODE_GANGGUAN || mode === MODE_PERBAIKAN) return mode;
  return MODE_NORMAL;
}

function computeNotice(nowInput) {
  const now = nowInput ? new Date(nowInput) : new Date();
  const mode = normalizeMode(getSetting('notice_mode', MODE_NORMAL));

  if (mode === MODE_NORMAL) {
    return { mode: MODE_NORMAL, active: false, tone: 'normal', label: 'Normal', badgeLabel: 'Normal' };
  }

  const isMass = mode === MODE_GANGGUAN;
  const label = isMass ? 'Gangguan Masal' : 'Perbaikan Sistem';
  const defaultText = isMass
    ? 'Sedang terjadi gangguan pada jaringan kami. Tim teknis sedang menangani dan akan segera memulihkan layanan.'
    : 'Sedang ada sedikit perbaikan sistem. Mohon kesabarannya ya, layanan akan kembali normal secepatnya.';
  const note = String(getSetting('notice_note', '') || '').trim();
  const text = note || defaultText;

  const intervalHours = getIntervalHours();
  const startStr = String(getSetting('notice_start', '') || '').trim();
  let start = startStr ? new Date(startStr) : null;
  if (start && isNaN(start.getTime())) start = null;

  let estimate = null;
  if (start) {
    const ms = intervalHours * 3600 * 1000;
    const elapsed = now.getTime() - start.getTime();
    const steps = Math.max(1, Math.floor(elapsed / ms) + 1);
    estimate = new Date(start.getTime() + steps * ms);
  }

  return {
    mode,
    active: true,
    tone: isMass ? 'danger' : 'primary',
    label,
    badgeLabel: isMass ? 'Gamas' : 'Perbaikan Sistem',
    text,
    intervalHours,
    start,
    startText: start ? fmtDateTime(start) : null,
    estimate,
    estimateText: estimate ? fmtDateTime(estimate) : null
  };
}

function getServiceNotice() {
  const t = Date.now();
  if (_cache.value && (t - _cache.at) < 5000) return _cache.value;
  let value;
  try {
    value = computeNotice();
  } catch (e) {
    value = { mode: MODE_NORMAL, active: false, tone: 'normal', label: 'Normal', badgeLabel: 'Normal' };
  }
  _cache = { at: t, value };
  return value;
}

module.exports = {
  computeNotice,
  getServiceNotice,
  fmtDateTime,
  MODE_NORMAL,
  MODE_GANGGUAN,
  MODE_PERBAIKAN
};
