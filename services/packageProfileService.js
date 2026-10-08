'use strict';
/**
 * packageProfileService.js — Sinkronisasi paket → (IP pool + profil PPP) MikroTik, RADIUS-aware.
 *
 * Kapan objek MikroTik (pool/profil) diperlukan?
 *  - Mode MikroTik (radius_enabled != '1')                         → YA (profil: rate-limit + pool IP)
 *  - Mode RADIUS + radius_use_profile = '1' (pakai profil/GROUP)  → YA (RADIUS kirim Mikrotik-Group = nama paket; profil+pool dipakai MikroTik)
 *  - Mode RADIUS + radius_use_profile = '0' (rate-limit atribut)  → TIDAK (rate-limit & IP dari atribut RADIUS)
 *
 * Comment objek = "manage by cloud" (penanda objek dikelola aplikasi).
 */
const { getSetting } = require('../config/settingsManager');
const mikrotikService = require('./mikrotikService');
const { logger } = require('../config/logger');

const MANAGE_COMMENT = 'manage by cloud';

function kbpsToStr(kbps) {
  kbps = Math.round(Number(kbps) || 0);
  if (kbps <= 0) return null;
  if (kbps >= 1000 && kbps % 1000 === 0) return (kbps / 1000) + 'M';
  return kbps + 'k';
}

// Format rate-limit native MikroTik: rx/tx rxBurst/txBurst rxThreshold/txThreshold burstTime(rx/tx)
// Threshold = rate dasar; burst-time = 8/8. Contoh: 10M/10M 13M/13M 10M/10M 8/8
function rateLimitStr(pkg) {
  // rx/tx = dari sudut pandang router: rx = UPLOAD klien, tx = DOWNLOAD klien
  const rx = kbpsToStr(pkg.speed_up);
  const tx = kbpsToStr(pkg.speed_down);
  if (!rx || !tx) return null;
  const rxB = kbpsToStr(pkg.speed_up_upto);
  const txB = kbpsToStr(pkg.speed_down_upto);
  if (rxB && txB && (Number(pkg.speed_up_upto) > Number(pkg.speed_up) || Number(pkg.speed_down_upto) > Number(pkg.speed_down))) {
    return rx + '/' + tx + ' ' + rxB + '/' + txB + ' ' + rx + '/' + tx + ' 8/8';
  }
  return rx + '/' + tx;
}

function currentProfileMode() {
  const radiusEnabled = String(getSetting('radius_enabled', '0')) === '1';
  const useProfile = String(getSetting('radius_use_profile', '0')) === '1';
  if (!radiusEnabled) return 'mikrotik';                 // mode MikroTik
  return useProfile ? 'radius-profile' : 'radius-attributes';
}

// Bangun object field profil PPP dari paket (hanya field yang diisi).
function buildProfileFields(pkg) {
  const rl = rateLimitStr(pkg);
  const data = { name: pkg.name, comment: MANAGE_COMMENT };
  if (rl) data['rate-limit'] = rl;
  data['only-one'] = (pkg.only_one === 0 || pkg.only_one === '0') ? 'no' : 'yes';
  const poolName = String(pkg.pool_name || '').trim();
  if (poolName) data['remote-address'] = poolName;
  if (String(pkg.local_address || '').trim()) data['local-address'] = String(pkg.local_address).trim().split('/')[0].trim();
  if (String(pkg.parent_queue || '').trim()) data['parent-queue'] = String(pkg.parent_queue).trim();
  if (String(pkg.queue_type || '').trim()) data['queue-type'] = String(pkg.queue_type).trim();
  return { data, rl };
}

async function ensureIpPool(pkg, routerId) {
  const poolName = String(pkg.pool_name || '').trim();
  const poolRanges = String(pkg.pool_ranges || '').trim();
  if (!poolName || !poolRanges) return null;
  try {
    const pools = await mikrotikService.getIpPools(routerId).catch(() => []);
    const ex = (pools || []).find((p) => String(p.name || '').trim().toLowerCase() === poolName.toLowerCase());
    if (ex) {
      await mikrotikService.updateIpPool(ex.id || ex['.id'], { ranges: poolRanges, comment: MANAGE_COMMENT }, routerId);
      return 'IP pool "' + poolName + '" diperbarui';
    }
    await mikrotikService.addIpPool({ name: poolName, ranges: poolRanges, comment: MANAGE_COMMENT }, routerId);
    return 'IP pool "' + poolName + '" dibuat';
  } catch (e) {
    logger.warn('[PackageProfile] Gagal sinkron IP pool "' + poolName + '": ' + e.message);
    return 'IP pool GAGAL: ' + e.message;
  }
}

/**
 * Sinkronkan paket → IP pool + profil PPP MikroTik (RADIUS-aware).
 * @returns {Promise<{needed:boolean, action?:string, mode:string, message:string}>}
 */
async function ensurePppProfileForPackage(pkg) {
  const mode = currentProfileMode();
  if (mode === 'radius-attributes') {
    return { needed: false, mode, message: 'Mode RADIUS (rate-limit & IP dari atribut) — pool/profil MikroTik tidak dibuat.' };
  }
  if (!pkg || !pkg.name) return { needed: true, mode, message: 'Nama paket kosong.' };

  const routerId = pkg.router_id || null;
  const parts = [];

  const poolMsg = await ensureIpPool(pkg, routerId);
  if (poolMsg) parts.push(poolMsg);

  const { data, rl } = buildProfileFields(pkg);
  if (!rl) parts.push('speed 0 → rate-limit tidak dibuat');
  try {
    const profiles = await mikrotikService.getPppoeProfiles(routerId);
    const ex = (profiles || []).find((p) => String(p.name || '').trim().toLowerCase() === String(pkg.name).trim().toLowerCase());
    if (ex) {
      await mikrotikService.updatePppoeProfile(ex.id || ex['.id'], data, routerId);
      parts.push('profil PPP diperbarui');
    } else {
      await mikrotikService.addPppoeProfile(data, routerId);
      parts.push('profil PPP dibuat');
    }
  } catch (e) {
    logger.warn('[PackageProfile] Gagal sinkron profil "' + pkg.name + '": ' + e.message);
    parts.push('profil GAGAL: ' + e.message);
  }

  // Profil isolir paket (dibuat bila belum ada)
  const isolirP = String(pkg.isolir_profile || '').trim();
  if (isolirP) {
    try {
      const profs2 = await mikrotikService.getPppoeProfiles(routerId);
      const ex2 = (profs2 || []).find((p) => String(p.name || '').trim().toLowerCase() === isolirP.toLowerCase());
      if (!ex2) {
        await mikrotikService.addPppoeProfile({ name: isolirP, 'rate-limit': '512k/512k', comment: MANAGE_COMMENT }, routerId);
        parts.push('profil isolir "' + isolirP + '" dibuat (512k/512k)');
      }
    } catch (e) { parts.push('profil isolir GAGAL: ' + e.message); }
  }

  const prefix = (mode === 'radius-profile') ? '[RADIUS profil] ' : '';
  const rlTxt = rl ? (' · rate-limit ' + rl) : '';
  return { needed: true, mode, message: prefix + parts.join('; ') + rlTxt };
}

async function removePppProfileForPackage(pkg, opts) {
  opts = opts || {};
  const mode = currentProfileMode();
  const out = [];
  if (!pkg) return { mode, message: '' };
  const routerId = pkg.router_id || null;
  const name = String(pkg.name || '').trim();
  if (mode !== 'radius-attributes' && name) {
    try {
      const profiles = await mikrotikService.getPppoeProfiles(routerId);
      const ex = (profiles || []).find((p) => String(p.name || '').trim().toLowerCase() === name.toLowerCase());
      if (ex && String(ex.comment || '').trim() === MANAGE_COMMENT) {
        await mikrotikService.deletePppoeProfile(ex.id || ex['.id'], routerId);
        out.push('profil PPP "' + name + '" dihapus');
      } else if (ex) {
        out.push('profil PPP "' + name + '" dibiarkan (bukan dikelola aplikasi)');
      }
    } catch (e) { out.push('profil gagal dihapus: ' + e.message); }
  }
  const poolName = String(pkg.pool_name || '').trim();
  if (opts.removePool && poolName && mode !== 'radius-attributes') {
    try {
      const pools = await mikrotikService.getIpPools(routerId).catch(() => []);
      const pex = (pools || []).find((p) => String(p.name || '').trim().toLowerCase() === poolName.toLowerCase());
      if (pex && String(pex.comment || '').trim() === MANAGE_COMMENT) {
        await mikrotikService.deleteIpPool(pex.id || pex['.id'], routerId);
        out.push('IP pool "' + poolName + '" dihapus');
      }
    } catch (e) { out.push('pool gagal dihapus: ' + e.message); }
  }
  return { mode, message: out.join('; ') };
}

module.exports = { ensurePppProfileForPackage, removePppProfileForPackage, currentProfileMode, rateLimitStr, buildProfileFields, MANAGE_COMMENT };
