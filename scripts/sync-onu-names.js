#!/usr/bin/env node
/**
 * Jalankan manual sinkronisasi ONU (auto-isi MAC pelanggan + rename nama ONU).
 *
 * Contoh:
 *   node scripts/sync-onu-names.js --dry-run
 *   node scripts/sync-onu-names.js --olt 1
 *   node scripts/sync-onu-names.js --skip-fill
 *   node scripts/sync-onu-names.js
 */
const onuSync = require('../services/onuSyncService');

function printOltSummary(s) {
  console.log(`${s.oltName} (id=${s.oltId}): total=${s.total}, rename=${s.renamed}, sama=${s.same}, belum-match=${s.unmatch}, gagal=${s.failed}`);
  for (const e of s.errors || []) {
    console.log(`  GAGAL ${e.onu || ''}${e.sn ? ' (' + e.sn + ')' : ''} => ${e.target || ''}: ${e.error || ''}`);
  }
}

function printMacSummary(m) {
  if (!m || m.skipped) {
    console.log('Auto-isi mac_address: dilewati (--skip-fill)');
    return;
  }
  console.log(
    `Auto-isi mac_address: total=${m.total}, diisi=${m.filled}, diperbarui=${m.refreshed}, ` +
    `bukan-MAC-ONU=${m.skippedNonOnu}, tanpa-pelanggan=${m.noCustomer}, konflik=${m.conflict}, gagal=${m.errors.length}`
  );
  for (const e of m.errors) console.log(`  GAGAL ${e.customer}: ${e.error}`);
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipFill = args.includes('--skip-fill');
  const skipNames = args.includes('--skip-names');
  const oltIdx = args.indexOf('--olt');
  const oltId = oltIdx >= 0 && args[oltIdx + 1] ? args[oltIdx + 1] : null;

  if (dryRun) console.log('MODE: DRY-RUN (tidak ada perubahan nyata)');

  const { mac, olts } = await onuSync.runSyncOnu({ dryRun, oltId, skipFill, skipNames });

  console.log('-- Auto-isi/perbarui mac_address pelanggan (dari PPPoE aktif) --');
  printMacSummary(mac);

  if (!skipNames) {
    console.log('-- Sinkronisasi nama ONU --');
    for (const s of olts || []) printOltSummary(s);
  }

  process.exit(0);
})().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});