#!/usr/bin/env node
/**
 * OPEN-ISP — Seed Data Demo untuk Tester
 * ======================================
 * Mengisi database dengan data contoh agar dashboard bisa langsung dilihat:
 * paket, area, pelanggan, tagihan (sebagian lunas), tiket, dan voucher.
 *
 * Jalankan (SEKALI saja, aman — tidak menimpa bila sudah ada data):
 *   node scripts/seed-demo.js
 *
 * Untuk Docker:
 *   docker exec open-isp node scripts/seed-demo.js
 *
 * Login default hasil seed:
 *   ADMIN : admin / demo-isp123
 *   PELANGGAN: lihat "Login Pelanggan" di output (ID Pelanggan / No. WhatsApp)
 */
const db = require('../config/database');
const customerSvc = require('../services/customerService');
const billingSvc = require('../services/billingService');

const log = (...a) => console.log('[seed-demo]', ...a);

function count(tbl) {
  try { return db.prepare(`SELECT COUNT(*) c FROM ${tbl}`).get().c; } catch (e) { return 0; }
}

(async () => {
  /* ── Guard: jangan timpa data yang sudah ada ─────────────────────────── */
  const existing = count('customers') + count('packages');
  if (existing > 0) {
    log('Database sudah berisi data (customers/packages > 0) — seed DILEWATI.');
    log('(Hapus isi database bila ingin seed ulang di instalasi bersih.)');
    process.exit(0);
  }

  /* ── 1. Paket ─────────────────────────────────────────────────────────── */
  const pkgs = [
    { name: 'Demo Lite 10 Mbps', speed_down: 10, speed_up: 10, price: 100000, description: 'Paket hemat untuk kebutuhan dasar', billing_type: 'postpaid' },
    { name: 'Demo Home 20 Mbps', speed_down: 20, speed_up: 20, price: 130000, description: 'Paket favorit keluarga', billing_type: 'postpaid' },
    { name: 'Demo Pro 30 Mbps', speed_down: 30, speed_up: 30, price: 175000, description: 'Bekerja & streaming lancar', billing_type: 'postpaid' },
    { name: 'Demo Bisnis 50 Mbps', speed_down: 50, speed_up: 50, price: 275000, description: 'Untuk kantor & usaha', billing_type: 'postpaid' },
  ];
  const pkgIds = [];
  for (const p of pkgs) {
    try { const r = customerSvc.createPackage(p); pkgIds.push(r.lastInsertRowid); log('Paket:', p.name); }
    catch (e) { log('Gagal paket', p.name, e.message); }
  }

  /* ── 2. Area ──────────────────────────────────────────────────────────── */
  const areas = ['Demo Area Pusat', 'Demo Area Timur', 'Demo Area Barat'];
  for (const a of areas) {
    try { db.prepare('INSERT OR IGNORE INTO areas (name, description) VALUES (?, ?)').run(a, 'Area contoh (data demo)'); log('Area:', a); }
    catch (e) { log('Gagal area', a, e.message); }
  }

  /* ── 3. Pelanggan ─────────────────────────────────────────────────────── */
  const custs = [
    ['Budi Santoso', '081200000001', 'Jl. Merdeka No. 1'],
    ['Siti Aminah', '081200000002', 'Jl. Sudirman No. 12'],
    ['Agus Wijaya', '081200000003', 'Jl. Diponegoro No. 3'],
    ['Dewi Lestari', '081200000004', 'Jl. Gajah Mada No. 44'],
    ['Rudi Hartono', '081200000005', 'Jl. Hayam Wuruk No. 8'],
    ['Sri Wahyuni', '081200000006', 'Jl. Pahlawan No. 21'],
    ['Joko Susilo', '081200000007', 'Jl. Ahmad Yani No. 5'],
    ['Ratna Sari', '081200000008', 'Jl. Kartini No. 17'],
    ['Hendra Gunawan', '081200000009', 'Jl. Cendrawasih No. 9'],
    ['Maya Putri', '081200000010', 'Jl. Melati No. 2'],
    ['Anton Prasetyo', '081200000011', 'Jl. Kenanga No. 30'],
    ['Lina Marlina', '081200000012', 'Jl. Anggrek No. 7'],
  ];
  const today = new Date();
  const installDate = new Date(today.getTime() - 35 * 86400000).toISOString().slice(0, 10);
  const custIds = [];
  let i = 0;
  for (const [name, phone, address] of custs) {
    i++;
    const pkgId = pkgIds[(i - 1) % (pkgIds.length || 1)];
    try {
      const r = customerSvc.createCustomer({
        name, phone, address,
        area: areas[(i - 1) % areas.length],
        package_id: pkgId,
        status: (i === 11 || i === 12) ? 'inactive' : 'active', // 2 pelanggan nonaktif utk variasi
        install_date: installDate,
        connection_type: 'pppoe',
        pppoe_username: `demo${String(i).padStart(2, '0')}@demo.id`,
        pppoe_password: 'demo-isp123',
        auto_isolate: 1,
        isolate_day: 10,
        notes: 'Data demo — silakan hapus',
      });
      custIds.push({ id: r.lastInsertRowid, name, phone });
      log('Pelanggan:', name);
    } catch (e) { log('Gagal pelanggan', name, e.message); }
  }

  /* ── 4. Tagihan bulan ini + sebagian dibuat LUNAS ─────────────────────── */
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  let invCount = 0;
  try { invCount = billingSvc.generateMonthlyInvoices(month, year); log(`Generate tagihan ${month}/${year}:`, invCount); }
  catch (e) { log('Gagal generate tagihan:', e.message); }

  // 8 pelanggan pertama -> LUNAS, sisanya dibiarkan belum bayar
  let paid = 0;
  for (let k = 0; k < Math.min(8, custIds.length); k++) {
    try { billingSvc.payInvoiceForCustomerPeriod(custIds[k].id, month, year, 'Admin Demo', 'Pembayaran demo'); paid++; }
    catch (e) { log('Gagal pelunasan', custIds[k].name, e.message); }
  }
  log(`Pelunasan demo: ${paid} pelanggan`);

  /* ── 5. Tiket contoh ──────────────────────────────────────────────────── */
  try {
    const ticketSvc = require('../services/ticketService');
    if (custIds[0]) ticketSvc.createTicket(custIds[0].id, 'Koneksi lambat', 'Sejak tadi malam internet terasa lambat, mohon dicek. (data demo)');
    if (custIds[1]) ticketSvc.createTicket(custIds[1].id, 'Modem mati', 'Lampu modem tidak menyala sejak pagi. (data demo)');
    log('Tiket demo: 2');
  } catch (e) { log('Tiket dilewati:', e.message); }

  /* ── Ringkasan ────────────────────────────────────────────────────────── */
  const demo = db.prepare("SELECT customer_code, name, phone FROM customers WHERE notes LIKE 'Data demo%' LIMIT 2").all();
  log('==================== SELESAI ====================');
  log('Login ADMIN    : admin / demo-isp123');
  log('Login PELANGGAN: gunakan ID Pelanggan atau No. WhatsApp di bawah ini');
  demo.forEach(d => log(`   • ${d.name} — ${d.customer_code} / ${d.phone}`));
  log('=================================================');
  process.exit(0);
})().catch(e => { console.error('[seed-demo] ERROR:', e.message); process.exit(1); });
