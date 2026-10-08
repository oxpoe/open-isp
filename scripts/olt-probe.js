#!/usr/bin/env node
/**
 * OLT Probe — deteksi cepat kompatibilitas OLT baru (multi-vendor).
 *
 * Tujuan: sebelum/saat membeli OLT merk baru, jalankan probe ini untuk tahu:
 *   1. SNMP hidup? vendor-nya siapa (dari sysObjectID / enterprise OID)?
 *   2. Profil brand bawaan mana yang cocok (hioso/hsgq/cdata/vsol/generic/...)?
 *   3. Telnet/SSH/Web UI terbuka? keluarga CLI-nya apa?
 *   4. Rekomendasi: brand yang dipilih di aplikasi + apakah rename perlu adapter.
 *
 * HANYA perintah BACA (read-only). Tidak mengubah konfigurasi apa pun.
 *
 * Contoh:
 *   node scripts/olt-probe.js --from-db 1
 *   node scripts/olt-probe.js --host 192.168.16.2 --user admin --pass admin
 *   node scripts/olt-probe.js --host 10.0.0.9 --community public --cmds "show version,show onu"
 *   node scripts/olt-probe.js --from-db 1 --json /tmp/probe-olt1.json
 */
const net = require('net');
const http = require('http');
const https = require('https');
const snmp = require('net-snmp');
const oltSvc = require('../services/oltService');

/* ── Pemetaan enterprise OID → vendor (untuk tebakan cepat) ───────────── */
const ENTERPRISE_VENDOR = {
  '25355': 'Hioso',
  '3320': 'CTC-style EPON (umum di OLT China)',
  '3902': 'ZTE',
  '2011': 'Huawei',
  '34592': 'C-Data',
  '37950': 'V-SOL',
  '27332': 'FiberHome',
  '35048': 'BDCOM?',
  '13158': 'Cisco (umum)',
  '8072': 'Net-SNMP generik — vendor tidak menyetel sysObjectID (banyak OLT embedded Linux); penentuan pakai hasil "Profil brand" di bawah',
};

/* ── util ─────────────────────────────────────────────────────────────── */
function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return (v && !v.startsWith('--')) ? v : true;
}
function tcpCheck(host, port, timeout = 3000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const done = (ok) => { try { s.destroy(); } catch (e) {} resolve(ok); };
    s.setTimeout(timeout);
    s.once('connect', () => done(true));
    s.once('timeout', () => done(false));
    s.once('error', () => done(false));
    s.connect(port, host);
  });
}
function snmpValueToString(value) {
  try {
    let v = value;
    if (Buffer.isBuffer(v)) v = v.toString('utf8');
    v = String(v == null ? '' : v).replace(/\0/g, '').trim();
    // beberapa perangkat mengembalikan string ber-quote
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1).trim();
    return v;
  } catch (e) { return String(value); }
}
function looksLikeOidString(s) {
  return /^\d+(\.\d+){4,}$/.test(String(s || '').trim());
}
function decodeOid(buf) {
  try {
    const b = Buffer.from(buf);
    if (!b.length) return '';
    const out = [Math.floor(b[0] / 40), b[0] % 40];
    let val = 0;
    for (let i = 1; i < b.length; i++) {
      val = (val << 7) | (b[i] & 0x7f);
      if (!(b[i] & 0x80)) { out.push(val); val = 0; }
    }
    return out.join('.');
  } catch (e) { return String(buf); }
}
function snmpGet(session, oids, timeout = 4000) {
  return new Promise((resolve) => {
    let finished = false;
    const t = setTimeout(() => { if (!finished) { finished = true; resolve(null); } }, timeout);
    try {
      session.get(oids, (err, vbs) => {
        if (finished) return;
        finished = true; clearTimeout(t);
        resolve(err ? null : vbs);
      });
    } catch (e) { if (!finished) { finished = true; clearTimeout(t); resolve(null); } }
  });
}
function snmpSubtreeCount(session, oid, limit = 8, timeout = 5000) {
  return new Promise((resolve) => {
    const rows = [];
    let finished = false;
    const done = () => { if (!finished) { finished = true; resolve(rows); } };
    const t = setTimeout(done, timeout);
    try {
      session.subtree(oid, 20, (vbs) => {
        for (const vb of vbs) {
          if (rows.length >= limit) break;
          let val = vb.value;
          if (Buffer.isBuffer(val)) {
            const s = val.toString('utf8').replace(/\0/g, '').trim();
            val = /^[\x20-\x7E]+$/.test(s) && s.length >= 2 ? s : val.toString('hex').toUpperCase();
          }
          rows.push({ oid: vb.oid, value: String(val).slice(0, 60) });
        }
        if (rows.length >= limit) { try { session.close(); } catch (e) {} }
      }, () => { clearTimeout(t); done(); });
    } catch (e) { clearTimeout(t); done(); }
  });
}
function httpProbe(url, timeout = 5000, allowSelfSigned = false) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request({
        host: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: u.pathname,
        method: 'GET', timeout,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'OPEN-ISP-OLT-Probe/1.0' },
      }, (res) => {
        let body = '';
        res.on('data', (d) => { if (body.length < 4000) body += d.toString('utf8'); });
        res.on('end', () => {
          const title = (body.match(/<title[^>]*>([^<]{0,80})</i) || [])[1] || '';
          resolve({ ok: true, status: res.statusCode, server: res.headers.server || '', title: title.trim() });
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, why: 'timeout' }); });
      req.on('error', (e) => resolve({ ok: false, why: e.code || e.message }));
      req.end();
    } catch (e) { resolve({ ok: false, why: e.message }); }
  });
}
/* Fallback telnet yang tahan terhadap prompt aneh (mis. '#' tanpa newline) */
async function rawTelnetRun(host, port, user, pass, cmds, waitMs = 2200) {
  const sock = new net.Socket();
  let buf = '';
  sock.setTimeout(15000);
  sock.on('data', (d) => { buf += d.toString('utf8'); });
  await new Promise((resolve, reject) => {
    sock.connect(port, host, resolve);
    sock.once('error', reject);
  });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const drain = () => { const x = buf; buf = ''; return x; };
  const clean = (t) => String(t).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\0/g, '').replace(/[^\x20-\x7E\r\n]/g, '');
  await wait(2500);
  let banner = clean(drain());
  if (/(login|username)\s*[:>]/i.test(banner)) { sock.write(String(user || 'admin') + '\r\n'); await wait(1600); banner += clean(drain()); }
  if (/(password|passwd)\s*[:>]/i.test(banner)) { sock.write(String(pass || 'admin') + '\r\n'); await wait(1800); banner += clean(drain()); }
  sock.write('\r\n'); await wait(800); banner += clean(drain());
  const outputs = [];
  for (const cmd of cmds) {
    sock.write(cmd + '\r\n');
    await wait(waitMs);
    outputs.push(clean(drain()));
  }
  try { sock.end(); sock.destroy(); } catch (e) {}
  return { banner: banner.trim(), outputs };
}

function truncate(s, n) { s = String(s || ''); return s.length > n ? (s.slice(0, n) + '\n…[dipotong]') : s; }

/* ── main ─────────────────────────────────────────────────────────────── */
(async () => {
  const fromDb = arg('from-db');
  let host = arg('host');
  let community = arg('community', 'public');
  let snmpPort = Number(arg('snmp-port', 161));
  let user = arg('user', 'admin');
  let pass = arg('pass', 'admin');
  let telnetPort = Number(arg('telnet-port', 23));
  let cmds = String(arg('cmds', 'show version')).split(',').map(s => s.trim()).filter(Boolean);
  const jsonOut = arg('json');
  const enablePassword = arg('enable-password');

  if (fromDb) {
    const db = require('../config/database');
    const olt = db.prepare('SELECT * FROM olts WHERE id = ?').get(Number(fromDb));
    if (!olt) { console.error('OLT id=' + fromDb + ' tidak ditemukan di database'); process.exit(1); }
    host = host || olt.host;
    community = (community === 'public') ? (olt.snmp_community || community) : community;
    snmpPort = snmpPort || Number(olt.snmp_port || 161);
    user = (user === 'admin') ? (olt.web_user || user) : user;
    pass = (pass === 'admin') ? (olt.web_password || pass) : pass;
    telnetPort = telnetPort || Number(olt.telnet_port || 23);
    console.log(`[i] Memakai data OLT dari DB: id=${olt.id} "${olt.name}" brand=${olt.brand} host=${host}`);
  }

  if (!host) {
    console.log('Penggunaan: node scripts/olt-probe.js --host <ip> [--community public] [--user admin --pass admin]\n' +
      '            node scripts/olt-probe.js --from-db <id-olt> [--json hasil.json]');
    process.exit(1);
  }

  const result = { host, at: new Date().toISOString(), snmp: null, tcp: {}, profiles: [], telnet: null, web: null, verdict: [] };
  console.log(`\n=== OLT PROBE — ${host} ===\n`);

  /* 1) cek port TCP */
  console.log('-- Konektivitas --');
  for (const p of [23, 22, 80, 443]) {
    const ok = await tcpCheck(host, p);
    result.tcp[p] = ok;
    console.log(`  port ${String(p).padEnd(3)} : ${ok ? 'TERBUKA' : 'tertutup/tidak merespons'}`);
  }

  /* 2) SNMP: identitas */
  console.log('\n-- SNMP --');
  const session = snmp.createSession(host, community, { port: snmpPort, version: snmp.Version2c, timeout: 4000, retries: 1 });
  const idVbs = await snmpGet(session, ['1.3.6.1.2.1.1.1.0', '1.3.6.1.2.1.1.2.0', '1.3.6.1.2.1.1.5.0', '1.3.6.1.2.1.1.3.0'], 5000);
  if (!idVbs) {
    console.log('  SNMP: TIDAK MERESPONS (community salah / SNMP mati / port beda)');
    result.snmp = { ok: false };
  } else {
    const sysDescr = idVbs[0] && idVbs[0].value != null ? snmpValueToString(idVbs[0].value) : '-';
    const sysObjRaw = idVbs[1] && idVbs[1].value != null ? snmpValueToString(idVbs[1].value) : '';
    const sysObjFromBuf = idVbs[1] && idVbs[1].value != null ? decodeOid(idVbs[1].value) : '-';
    const sysObj = looksLikeOidString(sysObjRaw) ? sysObjRaw : (looksLikeOidString(sysObjFromBuf) ? sysObjFromBuf : sysObjFromBuf);
    const sysName = idVbs[2] && idVbs[2].value != null ? snmpValueToString(idVbs[2].value) : '-';
    const uptime = idVbs[3] && idVbs[3].value != null ? String(idVbs[3].value) : '-';
    const ent = (sysObj.split('.')[6] || '');
    let vendor = ENTERPRISE_VENDOR[ent] || '';
    if (!vendor) {
      // fallback: cari enterprise di daftar berdasarkan kemunculan substring OID
      for (const [k, v] of Object.entries(ENTERPRISE_VENDOR)) {
        if (sysObj.includes('4.1.' + k + '.')) { vendor = v + ' (terdeteksi dari OID)'; break; }
      }
    }
    if (!vendor) vendor = ent ? `(enterprise ${ent} — belum terdaftar, laporkan ke developer)` : '-';
    result.snmp = { ok: true, sysDescr, sysObjectID: sysObj, sysName, uptime, enterprise: ent, vendorGuess: vendor };
    console.log(`  sysDescr    : ${truncate(sysDescr, 120)}`);
    console.log(`  sysObjectID : ${sysObj}`);
    console.log(`  enterprise  : ${ent} → tebakan vendor: ${vendor}`);
    console.log(`  sysName     : ${sysName}`);
  }

  /* 3) probe semua profil brand bawaan */
  if (result.snmp && result.snmp.ok) {
    console.log('\n-- Profil brand bawaan (uji OID probe) --');
    for (const brandKey of Object.keys(oltSvc.BRAND_PROFILES || {})) {
      for (const prof of (oltSvc.BRAND_PROFILES[brandKey] || [])) {
        const probe = prof.probe_oid;
        if (!probe) continue;
        const vbs = await snmpGet(session, [probe], 3500);
        if (vbs) {
          const sample = await snmpSubtreeCount(session, prof.status_table || probe, 5, 5000);
          result.profiles.push({ brandKey, profile: prof.name, ok: true, sample: sample.slice(0, 5) });
          console.log(`  ✅ ${brandKey.toUpperCase()} / ${prof.name} — HIDUP (contoh ${sample.length} entri: ${sample[0] ? sample[0].value : '-'} ...)`);
        } else {
          result.profiles.push({ brandKey, profile: prof.name, ok: false });
        }
      }
    }
    if (!result.profiles.some(p => p.ok)) console.log('  (tidak ada profil yang cocok — kemungkinan MIB privat; kirim hasil JSON ini ke developer)');
  }
  try { session.close(); } catch (e) {}

  /* 4) Telnet (read-only) */
  console.log('\n-- Telnet CLI --');
  try {
    const out = await oltSvc.telnetLoginAndRun(host, user, pass, cmds, {
      port: telnetPort,
      enablePassword: enablePassword !== null ? String(enablePassword) : null,
    });
    result.telnet = { ok: true, cmds, output: truncate(out, 2500) };
    const head = String(out).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 12).join('\n    ');
    console.log(`  ✅ Login telnet BERHASIL (${cmds.join(' | ')}) — cuplikan:\n    ${head}`);
    const hay = String(out).toLowerCase();
    const fam = hay.includes('hioso') ? 'Hioso' : hay.includes('hsgq') ? 'HSGQ' : hay.includes('c-data') || hay.includes('cdata') ? 'C-Data' : hay.includes('vsol') ? 'V-SOL' : null;
    if (fam) console.log(`  [i] Keluarga CLI terdeteksi: ${fam}`);
  } catch (e) {
    result.telnet = { ok: false, error: e.message || String(e) };
    console.log('  ✖ Telnet gagal: ' + (e.message || String(e)));
    // Diagnostik: tangkap banner mentah 4 detik agar terlihat prompt/flow-nya
    try {
      const raw = await new Promise((resolve) => {
        const sock = new net.Socket();
        let buf = '';
        const t = setTimeout(() => { try { sock.destroy(); } catch (e2) {} resolve(buf); }, 4000);
        sock.setTimeout(4000);
        sock.on('data', (d) => { buf += d.toString('utf8').replace(/\0/g, ''); });
        sock.once('error', () => { clearTimeout(t); resolve(buf); });
        sock.once('timeout', () => { clearTimeout(t); try { sock.destroy(); } catch (e2) {} resolve(buf); });
        sock.connect(telnetPort, host, () => {});
      });
      const clean = String(raw).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/[^\x20-\x7E\r\n]/g, '').trim();
      result.telnet.rawBanner = truncate(clean, 600);
      console.log('  [i] Banner telnet mentah:\n    ' + truncate(clean, 400).split('\n').join('\n    '));
    } catch (e2) {}

    // Fallback: mode raw (prompt longgar) — tetap READ-ONLY
    try {
      console.log('  [i] Mencoba mode telnet raw (prompt longgar)…');
      const raw = await rawTelnetRun(host, telnetPort, user, pass, cmds);
      result.telnetRaw = { ok: true, banner: truncate(raw.banner, 500), outputs: raw.outputs.map(o => truncate(o, 1200)) };
      const joined = (raw.banner + '\n' + raw.outputs.join('\n'));
      const head = String(joined).split('\n').map(l => l.trim()).filter(Boolean).slice(0, 10).join('\n    ');
      console.log('  ✅ Telnet RAW berhasil — cuplikan:\n    ' + head);
      const hay = joined.toLowerCase();
      const fam = hay.includes('hioso') ? 'Hioso' : hay.includes('hsgq') ? 'HSGQ' : hay.includes('c-data') || hay.includes('cdata') ? 'C-Data' : hay.includes('vsol') ? 'V-SOL' : hay.includes('gpon') ? 'GPON-generik' : hay.includes('epon') ? 'EPON-generik' : null;
      if (fam) console.log('  [i] Keluarga CLI terdeteksi (raw): ' + fam);
    } catch (e3) {
      console.log('  ✖ Telnet raw juga gagal: ' + (e3.message || String(e3)));
    }
  }

  /* 5) Web UI */
  console.log('\n-- Web UI --');
  for (const url of [`http://${host}/`, `https://${host}/`]) {
    const w = await httpProbe(url, 5000);
    if (w.ok) {
      result.web = { url, ...w };
      console.log(`  ${url} → HTTP ${w.status} | Server: ${w.server || '-'} | Title: ${w.title || '-'}`);
      break;
    } else {
      console.log(`  ${url} → ${w.why}`);
    }
  }

  /* 6) kesimpulan */
  console.log('\n=== KESIMPULAN ===');
  const live = [...new Set(result.profiles.filter(p => p.ok).map(p => p.brandKey))];
  if (result.snmp && result.snmp.ok) {
    if (live.length) console.log(`✅ Pilih brand di aplikasi: ${live.map(s => s.toUpperCase()).join(' / ')} (monitoring SNMP siap)`);
    else console.log('⚠️ SNMP hidup tapi tidak ada profil cocok → perlu profil baru (kirim JSON hasil ini).');
  } else {
    console.log('⚠️ SNMP mati/kosong. Jika telnet hidup, monitoring bisa dibuat via driver CLI (kirim cuplikan telnet ini).');
  }
  if (result.telnet && result.telnet.ok) console.log('ℹ️ Telnet hidup → jalur rename/authorize CLI memungkinkan (tergantung keluarga CLI).');
  console.log('ℹ️ Rename nama pelanggan→OLT saat ini: hioso/hsgq (SNMP) & zte/huawei (CLI). Brand lain perlu adapter.');

  if (jsonOut) {
    require('fs').writeFileSync(String(jsonOut), JSON.stringify(result, null, 2));
    console.log(`\n[i] Hasil lengkap disimpan: ${jsonOut} (kirim file ini untuk analisis lanjutan)`);
  }
  process.exit(0);
})().catch((e) => { console.error('Probe error:', e); process.exit(1); });
