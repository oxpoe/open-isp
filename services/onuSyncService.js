/**
 * Service: Sinkronisasi ONU (OLT) dengan Data Pelanggan.
 *
 * Dua tugas dalam satu siklus:
 *  1. Auto-isi/perbarui `mac_address` pelanggan dari caller-id sesi PPPoE aktif
 *     HANYA bila caller-id terverifikasi sebagai serial ONU yang benar-benar ada
 *     di OLT (agar MAC router/Cpe bridge tidak tersimpan salah). Nilai lama akan
 *     diperbarui sehingga penggantian ONU ikut terdeteksi otomatis.
 *  2. Ganti nama ONU di OLT menjadi `pppoe_username` / nama pelanggan berdasarkan
 *     kecocokan: mac_address pelanggan, enrichment stats, atau caller-id PPPoE live.
 *
 * Satu kali pengambilan daftar ONU per OLT (SNMP walk) dipakai untuk kedua tugas.
 */
const { logger } = require('../config/logger');
const db = require('../config/database');
const oltService = require('./oltService');
const mikrotikService = require('./mikrotikService');

function normalizeKey(s) {
  return String(s || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * Normalisasi MAC menjadi format AA:BB:CC:DD:EE:FF. Kembalikan null bila bukan 12 hex.
 */
function formatMac(raw) {
  const hex = String(raw || '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

function loadCustomerContext() {
  const custs = db.prepare('SELECT id, name, pppoe_username, mac_address FROM customers').all() || [];
  const byId = new Map();
  const byMac = new Map();
  const byUser = new Map();
  for (const c of custs) {
    byId.set(c.id, c);
    if (c.mac_address) byMac.set(normalizeKey(c.mac_address), c);
    if (c.pppoe_username) byUser.set(String(c.pppoe_username).trim().toLowerCase(), c);
  }
  return { custs, byId, byMac, byUser };
}

/**
 * Bangun peta caller-id (MAC) -> username PPPoE dari sesi aktif.
 */
function buildMacToUser(sessions) {
  const map = new Map();
  for (const [username, s] of sessions.entries()) {
    const k = normalizeKey(s.callerId);
    if (k && !map.has(k)) map.set(k, username);
  }
  return map;
}

/**
 * Isi/perbarui mac_address pelanggan dari caller-id PPPoE, hanya untuk MAC ONU
 * yang terverifikasi ada di daftar serial OLT. Tampilkan/lewati konflik.
 */
function refreshCustomerMacs(sessions, byUser, byMac, onuSerialSet, dryRun) {
  const stmt = db.prepare('UPDATE customers SET mac_address = ? WHERE id = ?');
  const summary = { total: sessions.size, filled: 0, refreshed: 0, skippedNonOnu: 0, noCustomer: 0, conflict: 0, errors: [] };

  for (const [username, s] of sessions.entries()) {
    const cust = byUser.get(username);
    if (!cust) {
      summary.noCustomer++;
      continue;
    }
    const mac = formatMac(s.callerId);
    if (!mac) {
      summary.skippedNonOnu++;
      continue;
    }
    const norm = normalizeKey(mac);
    if (!onuSerialSet.has(norm)) {
      summary.skippedNonOnu++;
      continue;
    }
    const owner = byMac.get(norm);
    if (owner && owner.id !== cust.id) {
      summary.conflict++;
      logger.warn(`[SyncMAC] MAC ONU ${mac} sudah terpakai pelanggan lain (${owner.name}); lewati ${cust.name}`);
      continue;
    }
    const current = String(cust.mac_address || '').trim();
    if (current && normalizeKey(current) === norm) continue;
    try {
      if (!dryRun) stmt.run(mac, cust.id);
      if (current) summary.refreshed++;
      else summary.filled++;
      if (current) byMac.delete(normalizeKey(current));
      byMac.set(norm, cust);
      logger.info(`[SyncMAC] ${dryRun ? '[DRY-RUN] ' : ''}${current ? 'update' : 'isi'} mac_address ${cust.name} => ${mac}`);
    } catch (err) {
      summary.errors.push({ customer: cust.name, error: err.message });
      logger.error(`[SyncMAC] Gagal ${current ? 'update' : 'isi'} mac_address ${cust.name}: ${err.message}`);
    }
  }

  return summary;
}

/**
 * Tentukan target nama untuk satu ONU.
 * @returns {{customer: object|null, target: string|null, via: string|null}}
 */
function resolveOnuTarget(onu, byId, byMac, byUser, macToUser) {
  const snNorm = normalizeKey(onu.sn);
  let customer = onu.customer_id ? byId.get(onu.customer_id) : null;
  let via = 'mac_map';
  if (!customer) {
    if (snNorm && byMac.has(snNorm)) {
      customer = byMac.get(snNorm);
      via = 'mac_map';
    } else if (snNorm && macToUser.has(snNorm)) {
      const uname = macToUser.get(snNorm);
      customer = byUser.get(uname) || null;
      via = customer ? 'pppoe_live' : null;
    }
  }
  if (!customer) return { customer: null, target: null, via: null };
  const target = (customer.pppoe_username && String(customer.pppoe_username).trim())
    ? String(customer.pppoe_username).trim()
    : String(customer.name || '').trim();
  return { customer, target, via };
}

async function syncOnuNamesFromStats(olt, onus, ctx, macToUser, dryRun) {
  const summary = { oltId: olt.id, oltName: olt.name, total: onus.length, renamed: 0, failed: 0, same: 0, unmatch: 0, errors: [] };
  for (const onu of onus) {
    const { customer, target, via } = resolveOnuTarget(onu, ctx.byId, ctx.byMac, ctx.byUser, macToUser);
    if (!customer || !target) {
      summary.unmatch++;
      continue;
    }
    const writable = target.slice(0, 30);
    if (String(onu.name || '').trim() === writable) {
      summary.same++;
      continue;
    }
    try {
      if (!dryRun) await oltService.renameOnu(olt.id, onu.index, target);
      summary.renamed++;
      logger.info(`[SyncONU] ${dryRun ? '[DRY-RUN] akan rename' : 'rename'} ${onu.id} (${onu.sn}) => ${target} (${via})`);
    } catch (err) {
      summary.failed++;
      summary.errors.push({ onu: onu.id, sn: onu.sn, target, error: err.message });
      logger.error(`[SyncONU] Gagal rename ${onu.id} => ${target}: ${err.message}`);
    }
  }
  return summary;
}

/**
 * Orkestrator sinkronisasi: mengambil daftar ONU sekali per OLT, lalu
 * (1) auto-isi/perbarui mac_address dan (2) rename nama ONU.
 * @param {{dryRun?: boolean, oltId?: number|string, skipFill?: boolean, skipNames?: boolean}} opts
 */
async function runSyncOnu(opts = {}) {
  const dryRun = !!opts.dryRun;
  const onlyOltId = opts.oltId != null ? String(opts.oltId) : null;

  let olts = (oltService.getAllOlts() || []).filter((o) => o.is_active === 1 || o.is_active === true);
  if (onlyOltId) olts = olts.filter((o) => String(o.id) === onlyOltId);

  // 1) Ambil daftar ONU (satu walk per OLT) + kumpulkan serial ONU
  const onusByOlt = [];
  const onuSerialSet = new Map();
  for (const olt of olts) {
    try {
      const stats = await oltService.getOltStats(olt.id, true);
      const onus = (stats && stats.onus) || [];
      onusByOlt.push({ olt, onus });
      for (const onu of onus) {
        const k = normalizeKey(onu.sn);
        if (k && !onuSerialSet.has(k)) onuSerialSet.set(k, { oltId: olt.id, oltName: olt.name, onuId: onu.id });
      }
    } catch (err) {
      logger.error(`[SyncONU] Gagal ambil daftar ONU ${olt.name}: ${err.message}`);
      onusByOlt.push({ olt, onus: [], error: err.message });
    }
  }

  // 2) Sesi PPPoE aktif
  let sessions = new Map();
  try {
    sessions = await mikrotikService.getActivePppoeSessionsMap();
  } catch (e) {
    logger.error(`[SyncMAC] Gagal ambil sesi PPPoE: ${e.message}`);
  }

  // 3) Auto-isi/perbarui mac_address (hanya MAC ONU terverifikasi)
  let mac;
  if (opts.skipFill) {
    mac = { skipped: true, total: sessions.size };
  } else {
    const ctx0 = loadCustomerContext();
    mac = refreshCustomerMacs(sessions, ctx0.byUser, ctx0.byMac, onuSerialSet, dryRun);
  }

  // 4) Sinkronkan nama ONU (pakai data pelanggan terbaru)
  let summaries = [];
  if (!opts.skipNames) {
    const macToUser = buildMacToUser(sessions);
    const ctx1 = loadCustomerContext();
    for (const { olt, onus } of onusByOlt) {
      summaries.push(await syncOnuNamesFromStats(olt, onus, ctx1, macToUser, dryRun));
    }
  }

  return { mac, olts: summaries };
}

/**
 * Sinkronkan nama ONU untuk satu OLT (kompatibilitas).
 */
async function syncOnuCustomerNames(oltId, opts = {}) {
  const res = await runSyncOnu({ dryRun: !!opts.dryRun, oltId, skipFill: true });
  const s = (res.olts && res.olts[0]) || null;
  if (!s) throw new Error('OLT tidak ditemukan');
  return s;
}

module.exports = { runSyncOnu, syncOnuCustomerNames, formatMac };
