/**
 * Service: CRUD Pelanggan & Paket
 */
const db = require('../config/database');
const { logger } = require('../config/logger');
const { getCurrentDateInTimezone, getSetting } = require('../config/settingsManager');
const { generateCustomerCode, backfillCustomerCodes } = require('./customerIdService');

// Backfill ID Pelanggan (customer_code) yang masih kosong saat startup
try { const n = backfillCustomerCodes(); if (n > 0) logger.info('[CustomerID] Backfill ' + n + ' customer_code'); } catch (e) {}

// ─── HELPER FUNCTIONS ─────────────────────────────────────────
/**
 * Get effective router_id for a customer
 * Respects multi-router mode setting:
 * - If mode is 'active': returns customer's router_id if set.
 *   For legacy single-router customers with NULL router_id, it falls back to
 *   explicit default_router_id or the only active router (if exactly one exists).
 * - If mode is 'disabled': returns customer's router_id if set, else auto-detect
 *   - First tries explicit default_router_id setting
 *   - If not set, auto-detects first (smallest ID) available router
 */
function getEffectiveRouterId(customerRouterId) {
  const mode = getSetting('multi_router_mode', 'disabled');

  if (customerRouterId && customerRouterId > 0) {
    return customerRouterId;
  }

  const explicitDefault = getSetting('default_router_id', null);
  if (explicitDefault) {
    const parsed = parseInt(explicitDefault, 10);
    if (parsed && parsed > 0) {
      return parsed;
    }
  }

  try {
    if (mode === 'active') {
      // In multi-router mode, only fall back automatically if there is exactly one active router.
      const routers = db.prepare('SELECT id FROM routers WHERE is_active = 1 ORDER BY id ASC LIMIT 2').all();
      if (routers.length === 1 && routers[0].id > 0) {
        logger.warn(`[getEffectiveRouterId] router_id pelanggan kosong saat multi-router aktif. Fallback ke satu-satunya router aktif: ${routers[0].id}`);
        return routers[0].id;
      }
      return null;
    }

    // Mode: disabled (single router with fallback) - auto-detect first active router
    const router = db.prepare('SELECT id FROM routers WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get();
    if (router && router.id > 0) {
      return router.id;
    }
  }

  catch (e) {
    // Ignore if routers table doesn't exist or query fails
  }

  return null;
}

// ─── CUSTOMERS ───────────────────────────────────────────────
function calculateExpiredAt(startDateStr, durationDays = 30) {
  const d = startDateStr ? new Date(startDateStr) : new Date();
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + (parseInt(durationDays, 10) || 30));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} 23:59:59`;
}

function getAllCustomers(search = '', routerId = null, filterStatus = '', filterArea = '', opts = {}) {
  const now = getCurrentDateInTimezone();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const base = `
    SELECT c.*, p.name as package_name, p.price as package_price,
           p.billing_type as package_billing_type, p.duration_days as package_duration_days,
           p.promo_cycles as package_promo_cycles,
           p.prorate_first_invoice as package_prorate_first_invoice,
           p.speed_down, p.speed_up, p.fup_limit_gb, p.use_fup,
           r.name as router_name,
           o.name as olt_name,
           odp.name as odp_name,
           (SELECT COUNT(*) FROM invoices WHERE customer_id=c.id AND status='unpaid') as unpaid_count,
           u.bytes_in, u.bytes_out
    FROM customers c
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN routers r ON c.router_id = r.id
    LEFT JOIN olts o ON c.olt_id = o.id
    LEFT JOIN odps odp ON c.odp_id = odp.id
    LEFT JOIN customer_usage u ON u.customer_id = c.id AND u.period_month = ${month} AND u.period_year = ${year}
  `;

  const whereClauses = [];
  const params = [];

  if (search) {
    const s = `%${search}%`;
    whereClauses.push(`(c.name LIKE ? OR c.phone LIKE ? OR c.nik LIKE ? OR c.genieacs_tag LIKE ? OR c.address LIKE ? OR c.area LIKE ? OR c.pppoe_username LIKE ? OR c.static_ip LIKE ? OR c.hotspot_username LIKE ? OR c.customer_code LIKE ?)`);
    params.push(s, s, s, s, s, s, s, s, s, s);
  }

  const rId = routerId ? Number(routerId) : null;
  if (rId && rId > 0) {
    whereClauses.push(`c.router_id = ?`);
    params.push(rId);
  }

  if (filterStatus) {
    if (filterStatus === 'inactive') {
      whereClauses.push(`c.status = ? AND COALESCE(c.reg_status,'') != 'rejected'`);
    } else {
      whereClauses.push(`c.status = ?`);
    }
    params.push(filterStatus);
  }

  if (filterArea) {
    whereClauses.push(`LOWER(TRIM(c.area)) = LOWER(TRIM(?))`);
    params.push(filterArea);
  }

  // ── Filter lanjutan ──
  const { packageId, collectorId, oltId, connectionType, billing, autoIsolate } = opts || {};
  if (packageId) { whereClauses.push('c.package_id = ?'); params.push(Number(packageId)); }
  if (collectorId) { whereClauses.push('c.collector_id = ?'); params.push(Number(collectorId)); }
  if (oltId) { whereClauses.push('c.olt_id = ?'); params.push(Number(oltId)); }
  if (connectionType) { whereClauses.push('c.connection_type = ?'); params.push(String(connectionType)); }
  if (autoIsolate === 'on') whereClauses.push('c.auto_isolate = 1');
  else if (autoIsolate === 'off') whereClauses.push('(c.auto_isolate = 0 OR c.auto_isolate IS NULL)');
  if (billing === 'unpaid') whereClauses.push("(SELECT COUNT(*) FROM invoices WHERE customer_id=c.id AND status='unpaid') > 0");
  else if (billing === 'paid') whereClauses.push("(SELECT COUNT(*) FROM invoices WHERE customer_id=c.id AND status='unpaid') = 0");

  const whereSql = whereClauses.length > 0 ? ` WHERE ` + whereClauses.join(' AND ') : '';
  return db.prepare(base + whereSql + ` ORDER BY c.name ASC`).all(...params);
}

function getAllCustomerAreas() {
  try {
    const hasCustArea = db.prepare("PRAGMA table_info(customers)").all().some(c => c.name === 'area');
    const hasColArea = db.prepare("PRAGMA table_info(collectors)").all().some(c => c.name === 'area');
    const hasTechArea = db.prepare("PRAGMA table_info(technicians)").all().some(c => c.name === 'area');

    const queries = [];
    if (hasCustArea) queries.push("SELECT area FROM customers WHERE area IS NOT NULL AND TRIM(area) != ''");
    if (hasColArea) queries.push("SELECT area FROM collectors WHERE area IS NOT NULL AND TRIM(area) != ''");
    if (hasTechArea) queries.push("SELECT area FROM technicians WHERE area IS NOT NULL AND TRIM(area) != ''");

    if (queries.length === 0) return [];

    const unionSql = `SELECT DISTINCT TRIM(area) as area FROM (` + queries.join(' UNION ') + `) ORDER BY area ASC`;
    const rows = db.prepare(unionSql).all();
    return rows.map(r => r.area).filter(Boolean);
  } catch (e) {
    logger.warn('[CustomerService] getAllCustomerAreas error:', e.message);
    return [];
  }
}

function resetPromoCyclesUsed(customerId) {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('ID pelanggan tidak valid');
  return db.prepare('UPDATE customers SET promo_cycles_used = 0 WHERE id=?').run(id);
}

function getCustomerById(id) {
  return db.prepare(`
    SELECT c.*, p.name as package_name, p.price as package_price,
           p.billing_type as package_billing_type, p.duration_days as package_duration_days,
           p.promo_cycles as package_promo_cycles,
           p.prorate_first_invoice as package_prorate_first_invoice,
           r.name as router_name, o.name as olt_name, odp.name as odp_name
    FROM customers c 
    LEFT JOIN packages p ON c.package_id = p.id 
    LEFT JOIN routers r ON c.router_id = r.id
    LEFT JOIN olts o ON c.olt_id = o.id
    LEFT JOIN odps odp ON c.odp_id = odp.id
    WHERE c.id = ?
  `).get(id);
}

function assertCustomerUnique(data, excludeId) {
  const ex = excludeId ? Number(excludeId) : 0;
  const phone = String(data.phone || '').trim();
  const name = String(data.name || '').trim();
  const pppoe = String(data.pppoe_username || '').trim();
  const hotspot = String(data.hotspot_username || '').trim();
  const staticIp = String(data.static_ip || '').trim();
  if (phone) {
    const r = db.prepare('SELECT id, name FROM customers WHERE phone = ? AND id != ? LIMIT 1').get(phone, ex);
    if (r) throw new Error('Nomor HP sudah terdaftar untuk pelanggan: ' + r.name);
  }
  if (name) {
    const r = db.prepare('SELECT id, name FROM customers WHERE lower(trim(name)) = lower(trim(?)) AND id != ? LIMIT 1').get(name, ex);
    if (r) throw new Error('Nama pelanggan sudah terdaftar: ' + r.name + ' (ID ' + r.id + ')');
  }
  if (pppoe) {
    const r = db.prepare('SELECT id, name FROM customers WHERE pppoe_username = ? AND id != ? LIMIT 1').get(pppoe, ex);
    if (r) throw new Error('PPPoE Username sudah dipakai pelanggan: ' + r.name);
  }
  if (hotspot) {
    const r = db.prepare('SELECT id, name FROM customers WHERE hotspot_username = ? AND id != ? LIMIT 1').get(hotspot, ex);
    if (r) throw new Error('Hotspot Username sudah dipakai pelanggan: ' + r.name);
  }
  if (staticIp) {
    const r = db.prepare('SELECT id, name FROM customers WHERE static_ip = ? AND id != ? LIMIT 1').get(staticIp, ex);
    if (r) throw new Error('Static IP sudah dipakai pelanggan: ' + r.name);
  }
}

function slugifyPppoeName(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 28) || 'user';
}
// Buat akun PPPoE otomatis: <nama>@<domain>, password default dari setting. Unik.
function generatePppoeAccount(customerId) {
  const { getSetting } = require('../config/settingsManager');
  const c = getCustomerById(customerId);
  if (!c) throw new Error('Pelanggan tidak ditemukan');
  const domain = String(getSetting('pppoe_domain', 'sky.id') || 'sky.id').replace(/^@/, '').trim() || 'sky.id';
  const _pat = String(getSetting('pppoe_username_pattern', 'name') || 'name');
  const base = slugifyPppoeName(_pat === 'customer_code' ? (c.customer_code || c.name) : c.name);
  let username = base + '@' + domain;
  let n = 1;
  while (db.prepare('SELECT id FROM customers WHERE pppoe_username = ? AND id != ?').get(username, customerId)) {
    n++; username = base + n + '@' + domain;
  }
  const password = String(getSetting('pppoe_default_password', 'openisp') || 'openisp');
  db.prepare("UPDATE customers SET pppoe_username=?, pppoe_password=?, connection_type = CASE WHEN connection_type IS NULL OR connection_type='' THEN 'pppoe' ELSE connection_type END WHERE id=?").run(username, password, customerId);
  return { username: username, password: password };
}

function createCustomer(data) {
  assertCustomerUnique(data, null);
  require('./odpService').validateOdpPort(data.odp_id, data.pon_port, null);
  let expiredAt = data.expired_at || null;
  if (!expiredAt && data.package_id) {
    const pkg = db.prepare('SELECT billing_type, duration_days FROM packages WHERE id=?').get(data.package_id);
    if (pkg && pkg.billing_type === 'prepaid') {
      const baseDate = data.install_date || new Date().toISOString().slice(0, 10);
      expiredAt = calculateExpiredAt(baseDate, pkg.duration_days || 30);
    }
  }

  return db.prepare(`
    INSERT INTO customers (customer_code, nik, name, phone, email, address, area, package_id, router_id, olt_id, odp_id, pon_port, lat, lng, genieacs_tag, pppoe_username, pppoe_password, pppoe_remote_address, isolir_profile, status, install_date, expired_at, notes, auto_isolate, isolate_day, connection_type, static_ip, mac_address, hotspot_username, hotspot_password, hotspot_profile, collector_id, is_radius)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateCustomerCode(),
    data.nik ? String(data.nik).trim() : '',
    data.name, data.phone || '', data.email || '', data.address || '',
    data.area ? String(data.area).trim() : '',
    data.package_id ? parseInt(data.package_id) : null,
    data.router_id ? parseInt(data.router_id) : null,
    data.olt_id ? parseInt(data.olt_id) : null,
    data.odp_id ? parseInt(data.odp_id) : null,
    data.pon_port || '',
    data.lat || '',
    data.lng || '',
    data.genieacs_tag || '', data.pppoe_username || '',
    data.pppoe_password || '',
    data.pppoe_remote_address || '',
    data.isolir_profile || 'isolir',
    data.status || 'active',
    data.install_date || null,
    expiredAt,
    data.notes || '',
    data.auto_isolate !== undefined ? parseInt(data.auto_isolate) : 1,
    data.isolate_day !== undefined ? parseInt(data.isolate_day) : 10,
    data.connection_type || 'pppoe',
    data.static_ip || '',
    data.mac_address || '',
    data.hotspot_username || '',
    data.hotspot_password || '',
    data.hotspot_profile || '',
    data.collector_id ? parseInt(data.collector_id) : null,
    data.is_radius !== undefined ? parseInt(data.is_radius) : 1
  );
}

function updateCustomer(id, data) {
  assertCustomerUnique(data, id);
  require('./odpService').validateOdpPort(data.odp_id, data.pon_port, id);
  const prev = db.prepare('SELECT package_id, expired_at, install_date, nik FROM customers WHERE id=?').get(id);
  const newPkgId = data.package_id ? parseInt(data.package_id, 10) : null;
  const pkgChanged = prev && Number(prev.package_id || 0) !== Number(newPkgId || 0);

  let expiredAt = data.expired_at !== undefined ? data.expired_at : (prev ? prev.expired_at : null);
  if (!expiredAt && newPkgId) {
    const pkg = db.prepare('SELECT billing_type, duration_days FROM packages WHERE id=?').get(newPkgId);
    if (pkg && pkg.billing_type === 'prepaid') {
      const baseDate = data.install_date || (prev ? prev.install_date : null) || new Date().toISOString().slice(0, 10);
      expiredAt = calculateExpiredAt(baseDate, pkg.duration_days || 30);
    }
  }

  const result = db.prepare(`
    UPDATE customers SET nik=?, name=?, phone=?, email=?, address=?, area=?, package_id=?, router_id=?, olt_id=?, odp_id=?, pon_port=?, lat=?, lng=?, genieacs_tag=?, pppoe_username=?, pppoe_password=?, pppoe_remote_address=?, isolir_profile=?, status=?, install_date=?, expired_at=?, notes=?, auto_isolate=?, isolate_day=?, cable_path=?, connection_type=?, static_ip=?, mac_address=?, hotspot_username=?, hotspot_password=?, hotspot_profile=?, collector_id=?, is_radius=?
    WHERE id=?
  `).run(
    data.nik !== undefined ? (data.nik ? String(data.nik).trim() : '') : (prev.nik || ''),
    data.name, data.phone || '', data.email || '', data.address || '',
    data.area ? String(data.area).trim() : '',
    data.package_id ? parseInt(data.package_id) : null,
    data.router_id ? parseInt(data.router_id) : null,
    data.olt_id ? parseInt(data.olt_id) : null,
    data.odp_id ? parseInt(data.odp_id) : null,
    data.pon_port || '',
    data.lat || '',
    data.lng || '',
    data.genieacs_tag || '', data.pppoe_username || '',
    data.pppoe_password || '',
    data.pppoe_remote_address || '',
    data.isolir_profile || 'isolir',
    data.status || 'active',
    data.install_date || null,
    expiredAt,
    data.notes || '',
    data.auto_isolate !== undefined ? parseInt(data.auto_isolate) : 1,
    data.isolate_day !== undefined ? parseInt(data.isolate_day) : 10,
    data.cable_path || null,
    data.connection_type || 'pppoe',
    data.static_ip || '',
    data.mac_address || '',
    data.hotspot_username || '',
    data.hotspot_password || '',
    data.hotspot_profile || '',
    data.collector_id ? parseInt(data.collector_id) : null,
    data.is_radius !== undefined ? parseInt(data.is_radius) : 1,
    id
  );

  if (pkgChanged) {
    db.prepare('UPDATE customers SET promo_cycles_used = 0 WHERE id=?').run(id);
  }

  // Retroaktif: bila auto_isolate=0, lunaskan tagihan unpaid pelanggan ini
  try {
    if (data && Number(data.auto_isolate) === 0) {
      const billingSvc = require('./billingService');
      if (billingSvc && typeof billingSvc.autoLunasUnpaidForCustomer === 'function') {
        const res = billingSvc.autoLunasUnpaidForCustomer(id, { notify: true });
        if (res && res.count > 0) logger.info('[updateCustomer] Auto-lunas retroaktif ' + res.count + ' tagihan untuk "' + (data.name || id) + '"');
      }
    }
  } catch (e) { logger.error('[updateCustomer] auto-lunas retroaktif gagal: ' + e.message); }

  return result;
}

function updateCustomerCablePath(id, path) {
  return db.prepare('UPDATE customers SET cable_path = ? WHERE id = ?').run(path, id);
}

async function deleteCustomer(id) {
  const customer = getCustomerById(id);
  const mikrotikSvc = require('./mikrotikService');
  
  // WARNING: Check if customer has MikroTik connections without router_id
  const hasMikrotikConnection = customer && (
    customer.connection_type === 'pppoe' && customer.pppoe_username
    || customer.connection_type === 'static' && customer.static_ip
    || customer.connection_type === 'hotspot' && customer.hotspot_username
  );
  
  if (hasMikrotikConnection && !customer.router_id) {
    logger.warn(`[deleteCustomer] Pelanggan "${customer.name}" (ID: ${id}) memiliki koneksi ${customer.connection_type} tapi router_id NULL. Akun tidak akan dihapus dari MikroTik.`);
  }
  
  // Remove static IP if connection type is static
  if (customer && customer.connection_type === 'static' && customer.static_ip && customer.router_id) {
    try {
      await mikrotikSvc.removeStaticIp(customer.static_ip, customer.router_id);
    } catch (e) {
      console.error('Failed to remove static IP from MikroTik during customer deletion:', e);
    }
  }
  
  // CATATAN: Sesuai permintaan, akun/secret PPPoE di MikroTik TIDAK dihapus saat pelanggan dihapus
  // agar data user PPPoE di MikroTik tetap aman dan tidak ikut terhapus.
  if (customer && customer.connection_type === 'pppoe' && customer.pppoe_username) {
    logger.info(`[deleteCustomer] Pelanggan "${customer.name}" dihapus dari billing. Akun PPPoE "${customer.pppoe_username}" di MikroTik dipertahankan.`);
  }

  // Remove Hotspot user if connection type is hotspot and username exists
  if (customer && customer.connection_type === 'hotspot' && customer.hotspot_username && customer.router_id) {
    try {
      // Get hotspot user to find the ID
      const hotspotUser = await mikrotikSvc.getHotspotUserByName(customer.hotspot_username, customer.router_id);
      
      if (hotspotUser && hotspotUser.id) {
        await mikrotikSvc.deleteHotspotUser(hotspotUser.id, customer.router_id);
        console.log(`Successfully removed Hotspot user ${customer.hotspot_username} from MikroTik`);
      } else {
        console.warn(`Hotspot user ${customer.hotspot_username} not found in MikroTik`);
      }
    } catch (e) {
      console.error('Failed to remove Hotspot user from MikroTik during customer deletion:', e);
    }
  }
  
  return db.prepare('DELETE FROM customers WHERE id=?').run(id);
}

async function bulkDeleteCustomers(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  let deleted = 0;
  for (const id of ids) {
    const numId = Number(id);
    if (!Number.isFinite(numId) || numId <= 0) continue;
    try {
      await deleteCustomer(numId);
      deleted++;
    } catch (e) {
      logger.error(`[bulkDeleteCustomers] Gagal menghapus pelanggan ${numId}: ${e.message}`);
    }
  }
  return deleted;
}

function getCustomerStats() {
  return {
    total:        db.prepare('SELECT COUNT(*) as c FROM customers').get().c,
    active:       db.prepare("SELECT COUNT(*) as c FROM customers WHERE status IN ('active', 'ditangguhkan')").get().c,
    ditangguhkan: db.prepare("SELECT COUNT(*) as c FROM customers WHERE status='ditangguhkan'").get().c,
    suspended:    db.prepare("SELECT COUNT(*) as c FROM customers WHERE status='suspended'").get().c,
    inactive:     db.prepare("SELECT COUNT(*) as c FROM customers WHERE status='inactive' AND COALESCE(reg_status,'')!='rejected'").get().c,
  };
}

// ─── PACKAGES ────────────────────────────────────────────────
function getAllPackages(routerId = null) {
  const rId = routerId ? Number(routerId) : null;
  try {
    if (rId && rId > 0) {
      return db.prepare(`
        SELECT p.*, r.name as router_name, COUNT(c.id) as customer_count
        FROM packages p 
        LEFT JOIN customers c ON c.package_id = p.id
        LEFT JOIN routers r ON p.router_id = r.id
        WHERE p.router_id IS NULL OR p.router_id = ?
        GROUP BY p.id ORDER BY p.price ASC
      `).all(rId);
    }
    return db.prepare(`
      SELECT p.*, r.name as router_name, COUNT(c.id) as customer_count
      FROM packages p 
      LEFT JOIN customers c ON c.package_id = p.id
      LEFT JOIN routers r ON p.router_id = r.id
      GROUP BY p.id ORDER BY p.price ASC
    `).all();
  } catch (e) {
    if (String(e?.message || '').includes('no such column')) {
      return db.prepare(`
        SELECT p.*, NULL as router_name, COUNT(c.id) as customer_count
        FROM packages p 
        LEFT JOIN customers c ON c.package_id = p.id
        GROUP BY p.id ORDER BY p.price ASC
      `).all();
    }
    throw e;
  }
}

function getPackageById(id) {
  return db.prepare('SELECT * FROM packages WHERE id=?').get(id);
}

function createPackage(data) {
  const pkgName = String(data.name || '').trim();
  if (!pkgName) throw new Error('Nama paket wajib diisi.');
  const _dup = db.prepare('SELECT id FROM packages WHERE lower(trim(name)) = lower(trim(?))').get(pkgName);
  if (_dup) throw new Error('Nama paket sudah dipakai: ' + pkgName);
  const down = Math.round(parseFloat(data.speed_down || 0) * 1000);
  const up = Math.round(parseFloat(data.speed_up || 0) * 1000);
  if (!(down > 0) || !(up > 0)) throw new Error('Kecepatan Download & Upload wajib diisi dan > 0.');
  const down_upto = Math.round(parseFloat(data.speed_down_upto || 0) * 1000);
  const up_upto = Math.round(parseFloat(data.speed_up_upto || 0) * 1000);
  const n_down = Math.round(parseFloat(data.night_speed_down || 0) * 1000);
  const n_up = Math.round(parseFloat(data.night_speed_up || 0) * 1000);
  const f_down = Math.round(parseFloat(data.fup_speed_down || 0) * 1000);
  const f_limit = parseFloat(data.fup_limit_gb || 0);

  const promoPrice = parsePromoPrice(data.promo_price);
  const promoCycles = Math.max(0, parseInt(data.promo_cycles, 10) || 0);
  const prorateFirst = data.prorate_first_invoice ? 1 : 0;
  const usePpn = data.use_ppn ? 1 : 0;
  const ppnPercentage = parseFloat(data.ppn_percentage || 11.0);
  const useUso = data.use_uso ? 1 : 0;
  const usoPercentage = parseFloat(data.uso_percentage || 1.75);
  const routerId = data.router_id ? parseInt(data.router_id, 10) : null;
  const billingType = (data.billing_type === 'prepaid') ? 'prepaid' : 'postpaid';
  const durationDays = Math.max(1, parseInt(data.duration_days, 10) || 30);

  return db.prepare(`
    INSERT INTO packages (
      name, price, promo_price, promo_cycles, prorate_first_invoice,
      speed_down, speed_up, speed_down_upto, speed_up_upto,
      use_night_speed, night_profile_name, night_speed_down, night_speed_up, 
      use_fup, fup_profile_name, fup_limit_gb, fup_speed_down, 
      description,
      billing_type, duration_days,
      use_ppn, ppn_percentage, use_uso, uso_percentage, router_id, is_active,
      pool_name, pool_ranges, local_address, only_one, parent_queue, queue_type, isolir_profile
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    pkgName, parseInt(data.price) || 0, promoPrice, promoCycles, prorateFirst,
    down, up, down_upto, up_upto,
    data.use_night_speed ? 1 : 0, data.night_profile_name || null, n_down, n_up,
    data.use_fup ? 1 : 0, data.fup_profile_name || null, f_limit, f_down,
    data.description || '',
    billingType, durationDays,
    usePpn, ppnPercentage, useUso, usoPercentage, routerId, (data.is_active == '0' ? 0 : 1),
    (data.pool_name || null), (data.pool_ranges || null), (data.local_address || null), (data.only_one == '0' ? 0 : 1), (data.parent_queue || null), (data.queue_type || null), (data.isolir_profile || null)
  );
}

function parsePromoPrice(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function updatePackage(id, data) {
  const pkgName = String(data.name || '').trim();
  if (!pkgName) throw new Error('Nama paket wajib diisi.');
  const _dup = db.prepare('SELECT id FROM packages WHERE lower(trim(name)) = lower(trim(?)) AND id != ?').get(pkgName, id);
  if (_dup) throw new Error('Nama paket sudah dipakai: ' + pkgName);
  const down = Math.round(parseFloat(data.speed_down || 0) * 1000);
  const up = Math.round(parseFloat(data.speed_up || 0) * 1000);
  if (!(down > 0) || !(up > 0)) throw new Error('Kecepatan Download & Upload wajib diisi dan > 0.');
  const down_upto = Math.round(parseFloat(data.speed_down_upto || 0) * 1000);
  const up_upto = Math.round(parseFloat(data.speed_up_upto || 0) * 1000);
  const n_down = Math.round(parseFloat(data.night_speed_down || 0) * 1000);
  const n_up = Math.round(parseFloat(data.night_speed_up || 0) * 1000);
  const f_down = Math.round(parseFloat(data.fup_speed_down || 0) * 1000);
  const f_limit = parseFloat(data.fup_limit_gb || 0);
  const promoPrice = parsePromoPrice(data.promo_price);
  const promoCycles = Math.max(0, parseInt(data.promo_cycles, 10) || 0);
  const prorateFirst = data.prorate_first_invoice ? 1 : 0;
  const usePpn = data.use_ppn ? 1 : 0;
  const ppnPercentage = parseFloat(data.ppn_percentage || 11.0);
  const useUso = data.use_uso ? 1 : 0;
  const usoPercentage = parseFloat(data.uso_percentage || 1.75);
  const routerId = data.router_id ? parseInt(data.router_id, 10) : null;
  const billingType = (data.billing_type === 'prepaid') ? 'prepaid' : 'postpaid';
  const durationDays = Math.max(1, parseInt(data.duration_days, 10) || 30);

  return db.prepare(`
    UPDATE packages 
    SET name=?, price=?, promo_price=?, promo_cycles=?, prorate_first_invoice=?,
        speed_down=?, speed_up=?, speed_down_upto=?, speed_up_upto=?,
        use_night_speed=?, night_profile_name=?, night_speed_down=?, night_speed_up=?, 
        use_fup=?, fup_profile_name=?, fup_limit_gb=?, fup_speed_down=?, 
        description=?, is_active=?,
        billing_type=?, duration_days=?,
        use_ppn=?, ppn_percentage=?, use_uso=?, uso_percentage=?, router_id=?,
        pool_name=?, pool_ranges=?, local_address=?, only_one=?, parent_queue=?, queue_type=?, isolir_profile=?
    WHERE id=?
  `).run(
    pkgName, parseInt(data.price) || 0, promoPrice, promoCycles, prorateFirst,
    down, up, down_upto, up_upto,
    data.use_night_speed ? 1 : 0, data.night_profile_name || null, n_down, n_up,
    data.use_fup ? 1 : 0, data.fup_profile_name || null, f_limit, f_down,
    data.description || '', data.is_active == '1' ? 1 : 0,
    billingType, durationDays,
    usePpn, ppnPercentage, useUso, usoPercentage, routerId,
    (data.pool_name || null), (data.pool_ranges || null), (data.local_address || null), (data.only_one == '0' ? 0 : 1), (data.parent_queue || null), (data.queue_type || null), (data.isolir_profile || null),
    id
  );
}

function deletePackage(id) {
  return db.prepare('DELETE FROM packages WHERE id=?').run(id);
}

// Resolver khusus HALAMAN LOGIN: hanya menerima ID Pelanggan (SKY-xxxxx) atau Nomor WhatsApp.
function findCustomerForLogin(val) {
  if (!val) return null;
  const raw = String(val).trim();
  if (!raw) return null;

  // 1) ID Pelanggan: PREFIX-angka (mis. SKY-48213)
  if (/^[A-Za-z0-9]+-\d{4,10}$/.test(raw)) {
    const byCode = db.prepare('SELECT id FROM customers WHERE customer_code = ? COLLATE NOCASE').get(raw);
    return byCode ? getCustomerById(byCode.id) : null;
  }

  // 2) Nomor HP: hanya angka (boleh spasi/tanda hubung), minimal 10 digit
  if (!/^\+?\d[\d\s.\-]*$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;

  const suffix = digits.slice(-9);
  const byPhone = db.prepare(
    "SELECT id FROM customers WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone,' ',''),'-',''),'(',''),')',''),'+','') LIKE ? ORDER BY id ASC LIMIT 1"
  ).get('%' + suffix);
  return byPhone ? getCustomerById(byPhone.id) : null;
}

function findCustomerByAny(val) {
  if (!val) return null;
  const cleanVal = val.toString().trim();
  
  // 1. Try Phone (Priority for Login)
  const phoneDigits = cleanVal.replace(/\D/g, '');
  if (phoneDigits.length >= 8) {
    // Cari yang 8-10 digit terakhirnya sama (lebih akurat untuk 08 vs 62)
    const suffix = phoneDigits.slice(-9);
    const p1 = db.prepare('SELECT id FROM customers WHERE phone LIKE ?').get(`%${suffix}`);
    if (p1) return getCustomerById(p1.id);
  }

  // 2. Try Customer Code / ID Pelanggan (mis. SKY-48213) — exact, case-insensitive
  const byCode = db.prepare('SELECT id FROM customers WHERE customer_code = ? COLLATE NOCASE').get(cleanVal);
  if (byCode) return getCustomerById(byCode.id);

  // 3. Try GenieACS Tag (Exact Match)
  const byTag = db.prepare('SELECT id FROM customers WHERE genieacs_tag = ?').get(cleanVal);
  if (byTag) return getCustomerById(byTag.id);

  // 3. Try PPPoE Username (Exact Match)
  const byPppoe = db.prepare('SELECT id FROM customers WHERE pppoe_username = ?').get(cleanVal);
  if (byPppoe) return getCustomerById(byPppoe.id);

  // 4. Try MAC Address (Exact Match or Partial Match for ONU MAC format)
  // Handle ONU MAC format like: F4B5AA-ZXHN%20F477-01FFFFFFFF011FFF23F4B5AA7D806FBA
  const byMac = db.prepare('SELECT id FROM customers WHERE mac_address = ?').get(cleanVal);
  if (byMac) return getCustomerById(byMac.id);
  
  // Try partial MAC match (first part before dash for ONU format)
  if (cleanVal.includes('-')) {
    const macPrefix = cleanVal.split('-')[0];
    if (macPrefix.length >= 6) {
      const byMacPrefix = db.prepare('SELECT id FROM customers WHERE mac_address LIKE ?').get(`${macPrefix}%`);
      if (byMacPrefix) return getCustomerById(byMacPrefix.id);
    }
  }

  // 5. Try ID if numeric
  if (/^\d+$/.test(cleanVal) && cleanVal.length < 8) {
    const c = getCustomerById(parseInt(cleanVal));
    if (c) return c;
  }
  
  return null;
}

async function suspendCustomer(id) {
  const customer = getCustomerById(id);
  if (!customer) throw new Error('Pelanggan tidak ditemukan');
  
  const mikrotikSvc = require('./mikrotikService');

  // Get effective router_id (respects multi-router mode setting)
  const effectiveRouterId = getEffectiveRouterId(customer.router_id);

  // Validate router_id is present if customer has MikroTik connection
  const hasMikrotikConnection = customer.connection_type === 'pppoe' && customer.pppoe_username
    || customer.connection_type === 'static' && customer.static_ip
    || customer.connection_type === 'hotspot' && customer.hotspot_username;
  
  if (hasMikrotikConnection && !effectiveRouterId) {
    logger.warn(`[suspendCustomer] Pelanggan "${customer.name}" (ID: ${id}) memiliki koneksi ${customer.connection_type} tapi router_id NULL dan tidak ada default router. Isolir lokal hanya, MikroTik tidak diupdate.`);
    updateCustomer(id, { ...customer, status: 'suspended' });
    return;
  }

  // UPDATE MIKROTIK DULU sebelum update database status (priority: network change)
  try {
    if (customer.connection_type === 'static' && customer.static_ip) {
      const pkg = getPackageById(customer.package_id);
      let limit = '5M/5M';
      if (pkg) {
        const up = Number(pkg.speed_up || 0) || 0;
        const down = Number(pkg.speed_down || 0) || 0;
        const upMbps = up > 0 ? Math.max(1, Math.round(up / 1000)) : 5;
        const downMbps = down > 0 ? Math.max(1, Math.round(down / 1000)) : 5;
        limit = `${upMbps}M/${downMbps}M`;
      }
      await mikrotikSvc.manageStaticIp({
        ip: customer.static_ip,
        name: customer.name,
        limit: limit,
        isolate: true
      }, effectiveRouterId);
    } else if (customer.pppoe_username) {
      const _pkgS = customer.package_id ? getPackageById(customer.package_id) : null;
      const isolirProfile = (_pkgS && _pkgS.isolir_profile) || customer.isolir_profile || getSetting('mikrotik_isolir_profile', 'isolir') || 'isolir';
      await mikrotikSvc.setPppoeProfile(customer.pppoe_username, isolirProfile, effectiveRouterId);
      if (effectiveRouterId) {
        try {
          await mikrotikSvc.ensurePppProfileIsolirAddressListHook(isolirProfile, effectiveRouterId);
        } catch (e) {
          logger.warn(`[suspendCustomer] Hook profil isolir "${isolirProfile}" di router ${effectiveRouterId}: ${e.message}`);
        }
      }
    } else if (customer.connection_type === 'hotspot' && customer.hotspot_username) {
      await mikrotikSvc.setHotspotUserDisabled(customer.hotspot_username, true, effectiveRouterId);
    }
  } catch (mikrotikErr) {
    logger.error(`[suspendCustomer] GAGAL ubah profil di MikroTik: ${mikrotikErr.message}. Tetap update status ke database.`);
    // Continue execution - update database status despite MikroTik error (graceful degradation)
  }

  // Update database status SETELAH MikroTik berhasil (atau gagal tapi continue)
  updateCustomer(id, { ...customer, status: 'suspended' });

  // WhatsApp Notification
  if (customer.phone) {
    try {
      const { getSetting } = require('../config/settingsManager');
      if (getSetting('whatsapp_enabled', false)) {
        const { sendWA, whatsappStatus } = await import('./whatsappBot.mjs');
        if (true) {
          const defaultIsolir = `Yth. Pelanggan {{nama}},\n\nLayanan internet Anda (Paket {{paket}}) saat ini ditangguhkan (Terisolir) karena belum melunasi tagihan sebesar *Rp {{tagihan}}*.\n\nSilakan lakukan pembayaran segera melalui portal pelanggan: {{link}}\n\nTerima kasih.`;
          const template = db.getAppSetting('whatsapp_isolir_message', defaultIsolir);

          // Get unpaid invoices & calculate total amount
          const billingSvc = require('./billingService');
          const waNotify = require('./waNotifyService'); // FIX: sebelumnya undefined (54x error di log)
          const { formatUnpaidInvoicesSummary } = require('./whatsappService');
          const unpaidInvoices = billingSvc.getUnpaidInvoicesByCustomerId(customer.id);
          const summary = formatUnpaidInvoicesSummary(unpaidInvoices);
          const totalTagihan = summary.totalAmount;
          const displayPeriode = summary.isMultiple
            ? `${summary.periodText}\n\n📋 *Rincian Tunggakan:*\n${summary.breakdownText}`
            : summary.periodText;

          // Generate Login Link
          const explicitBaseUrl = String(getSetting('public_base_url', '') || '').trim();
          let baseUrl = explicitBaseUrl.replace(/\/+$/, '');
          if (!baseUrl) {
            const hostRaw = String(getSetting('server_host', 'localhost') || 'localhost').trim();
            const port = Number(getSetting('server_port', 3001) || 3001);
            const proto = port === 443 ? 'https' : 'http';
            const host = /^https?:\/\//i.test(hostRaw) ? hostRaw.replace(/\/+$/, '') : `${proto}://${hostRaw}`;
            baseUrl = (port === 80 || port === 443) ? host : `${host}:${port}`;
          }
          const loginLink = `${baseUrl}/customer/login`;

          let formattedMsg = template
            .replace(/{{nama}}/gi, customer.name || 'Pelanggan')
            .replace(/{{id_pelanggan}}/gi, customer.customer_code || '-')
            .replace(/{{username}}/gi, customer.pppoe_username || '-')
            .replace(/{{pppoe}}/gi, customer.pppoe_username || '-')
            .replace(/{{paket}}/gi, customer.package_name || '-')
            .replace(/{{tagihan}}/gi, summary.totalAmountStr || totalTagihan.toLocaleString('id-ID'))
            .replace(/{{rincian_detail}}/gi, summary.isMultiple ? `📋 *Rincian Tunggakan:*\n${summary.breakdownText}` : '')
            .replace(/{{rincian}}/gi, displayPeriode || '-')
            .replace(/{{periode}}/gi, displayPeriode || '-')
            .replace(/{{company}}/gi, getSetting('company_header', '') || '-')
            .replace(/{{company_phone}}/gi, getSetting('company_phone', '') || '-')
            .replace(/{{link}}/gi, loginLink);

          if (summary.isMultiple && !template.includes('{{periode}}') && !template.includes('{{rincian}}')) {
            const extraInfo = `\n\n📌 *Periode Tunggakan:* ${summary.periodText}\n📋 *Rincian Tunggakan:*\n${summary.breakdownText}`;
            if (formattedMsg.includes('Silakan lakukan pembayaran')) {
              formattedMsg = formattedMsg.replace('Silakan lakukan pembayaran', extraInfo + '\n\nSilakan lakukan pembayaran');
            } else {
              formattedMsg += extraInfo;
            }
          }

          await waNotify.sendText(customer.phone, formattedMsg);
        }
      }
    } catch (waErr) {
      logger.error(`[suspendCustomer] Gagal kirim notif WhatsApp isolir: ${waErr.message}`);
    }
  }

  return true;
}

function _handleUnsuspendInvoice(id, customer, wasSuspended, targetStatus) {
  if (wasSuspended && (targetStatus === 'active' || targetStatus === 'ditangguhkan') && customer.package_id) {
    try {
      const now = new Date();
      const curMonth = now.getMonth() + 1;
      const curYear = now.getFullYear();
      const existingCurInv = db.prepare('SELECT id FROM invoices WHERE customer_id = ? AND period_month = ? AND period_year = ? LIMIT 1').get(id, curMonth, curYear);
      if (!existingCurInv) {
        const billingSvc = require('./billingService');
        billingSvc.generateInvoiceForCustomer(id, curMonth, curYear);
        logger.info(`[activateCustomer] Pelanggan "${customer.name}" (ID: ${id}) dibuka dari isolir (status: ${targetStatus}). Tagihan periode berjalan ${curMonth}/${curYear} otomatis diterbitkan.`);
      }
    } catch (invErr) {
      logger.error(`[activateCustomer] Gagal generate tagihan periode berjalan untuk pelanggan "${customer.name}" (ID: ${id}): ${invErr.message}`);
    }
  }
}

async function activateCustomer(id, targetStatus = 'active') {
  const customer = getCustomerById(id);
  if (!customer) throw new Error('Pelanggan tidak ditemukan');
  
  const wasSuspended = (customer.status === 'suspended' || customer.status === 'isolated');

  // Get effective router_id (respects multi-router mode setting)
  const effectiveRouterId = getEffectiveRouterId(customer.router_id);

  // Validate router_id is present if customer has MikroTik connection
  const hasMikrotikConnection = customer.connection_type === 'pppoe' && customer.pppoe_username
    || customer.connection_type === 'static' && customer.static_ip
    || customer.connection_type === 'hotspot' && customer.hotspot_username;
  
  if (hasMikrotikConnection && !effectiveRouterId) {
    logger.warn(`[activateCustomer] Pelanggan "${customer.name}" (ID: ${id}) memiliki koneksi ${customer.connection_type} tapi router_id NULL dan tidak ada default router. Aktivasi lokal hanya, MikroTik tidak diupdate.`);
    updateCustomer(id, { ...customer, status: targetStatus });
    _handleUnsuspendInvoice(id, customer, wasSuspended, targetStatus);
    return;
  }

  const mikrotikSvc = require('./mikrotikService');

  // UPDATE MIKROTIK DULU sebelum update database status (priority: network change)
  try {
    if (customer.connection_type === 'static' && customer.static_ip) {
      const pkg = getPackageById(customer.package_id);
      let limit = '5M/5M';
      if (pkg) {
        const up = Number(pkg.speed_up || 0) || 0;
        const down = Number(pkg.speed_down || 0) || 0;
        const upMbps = up > 0 ? Math.max(1, Math.round(up / 1000)) : 5;
        const downMbps = down > 0 ? Math.max(1, Math.round(down / 1000)) : 5;
        limit = `${upMbps}M/${downMbps}M`;
      }
      await mikrotikSvc.manageStaticIp({
        ip: customer.static_ip,
        name: customer.name,
        limit: limit,
        isolate: false
      }, effectiveRouterId);
    } else if (customer.pppoe_username) {
      const pkg = getPackageById(customer.package_id);
      const targetProfile = pkg ? pkg.name : 'default';
      
      // Validasi profile tidak kosong
      if (!targetProfile || String(targetProfile).trim() === '') {
        logger.warn(`[activateCustomer] Profile kosong untuk PPPoE user "${customer.pppoe_username}". Gunakan profile 'default'.`);
      }
      
      await mikrotikSvc.setPppoeProfile(customer.pppoe_username, targetProfile, effectiveRouterId);
    } else if (customer.connection_type === 'hotspot' && customer.hotspot_username) {
      const pkg = getPackageById(customer.package_id);
      const targetProfile = String(customer.hotspot_profile || '').trim() || (pkg ? pkg.name : '');
      await mikrotikSvc.upsertHotspotUser({
        username: String(customer.hotspot_username || '').trim(),
        password: String(customer.hotspot_password || '').trim(),
        profile: targetProfile,
        macAddress: String(customer.mac_address || '').trim(),
        disabled: false
      }, effectiveRouterId);
    }
  } catch (mikrotikErr) {
    logger.error(`[activateCustomer] GAGAL ubah profil di MikroTik: ${mikrotikErr.message}. Tetap update status ke database.`);
    // Continue execution - update database status despite MikroTik error (graceful degradation)
  }

  // Update database status SETELAH MikroTik berhasil (atau gagal tapi continue)
  updateCustomer(id, { ...customer, status: targetStatus });
  _handleUnsuspendInvoice(id, customer, wasSuspended, targetStatus);
  return true;
}

/**
 * Top-up / Deposit or Adjust Customer Balance manually by Admin/Cashier
 * @param {number|string} customerId 
 * @param {number} amount - positive number
 * @param {string} note - memo or payment source
 * @param {string} actorName - admin or cashier name
 * @param {'add'|'deduct'} actionType - 'add' or 'deduct'
 * @param {boolean} sendWhatsApp - whether to send WA notification
 */
async function autoDeactivateOverdueCustomers(months = 3, actor = null) {
  const m = Math.max(1, parseInt(months, 10) || 3);
  const waNotify = require('./waNotifyService');
  const waOn = getSetting('whatsapp_enabled', false);
  const delRaw = getSetting('auto_delete_overdue_enabled', true);
  const delEnabled = !(delRaw === false || delRaw === 'false');

  // ── 1) Nonaktifkan pelanggan AKTIF yang menunggak >= m bulan BERTURUT-TURUT ──
  const rows = db.prepare(`
    SELECT id, name, phone, unpaid_streak FROM customers
    WHERE status = 'active' AND package_id IS NOT NULL AND COALESCE(unpaid_streak, 0) >= ?
  `).all(m);

  let processed = 0;
  let failed = 0;
  const names = [];
  for (const c of rows) {
    try {
      await suspendCustomer(c.id);
      db.prepare("UPDATE customers SET deactivated_at = NOW_LOCAL(), deactivate_cause = 'auto_unpaid' WHERE id = ?").run(c.id);
      processed++;
      names.push(c.name);
      logger.info(`[AutoDeactivate] "${c.name}" (ID ${c.id}) dinonaktifkan otomatis (menunggak ${c.unpaid_streak} bulan).`);
      if (waOn && c.phone) {
        try {
          {
            const _def = '⚠️ *Layanan Dinonaktifkan*\n\nYth. Bapak/Ibu *{{nama}}* (ID Pelanggan: {{id_pelanggan}}),\n\nLayanan internet Anda untuk sementara kami *nonaktifkan* karena tagihan belum diselesaikan selama *{{bulan_nunggak}} bulan berturut-turut*.\n\nApabila bulan depan masih belum dibayar, akun Anda akan *DIHAPUS OTOMATIS* dan untuk berlangganan kembali harus *mendaftar dari awal*.\n\nBayar: {{link}}\n— {{company}}';
            const _tpl = String(db.getAppSetting('whatsapp_deactivated_message', _def) || _def);
            const _msg = _tpl.replace(/{{nama}}/gi, c.name || 'Pelanggan').replace(/{{id_pelanggan}}/gi, c.customer_code || ('ID:' + c.id)).replace(/{{bulan_nunggak}}/gi, String(c.unpaid_streak || 0)).replace(/{{batas}}/gi, String(getSetting('auto_deactivate_months', 3) || 3)).replace(/{{link}}/gi, String(getSetting('public_base_url', '') || '').replace(/\/+$/, '') + '/customer').replace(/{{company}}/gi, getSetting('company_header', '') || '-');
            await waNotify.sendText(c.phone, _msg);
          }
        } catch (e) {}
      }
    } catch (e) {
      failed++;
      logger.error(`[AutoDeactivate] Gagal menonaktifkan "${c.name}" (ID ${c.id}): ${e.message}`);
    }
  }

  // ── 2) Hapus pelanggan yang menunggak LEBIH dari m bulan (bulan ke-(m+1)) ──
  const removed = [];
  if (delEnabled) {
    const overdue = db.prepare(`
      SELECT id, name, phone, unpaid_streak FROM customers
      WHERE package_id IS NOT NULL AND COALESCE(unpaid_streak, 0) >= ?
    `).all(m + 1);
    for (const c of overdue) {
      try {
        logger.warn(`[AutoDelete] Menghapus pelanggan "${c.name}" (ID ${c.id}) — menunggak ${c.unpaid_streak} bulan berturut-turut (> ${m}).`);
        // Void dulu tagihan unpaid agar tidak menjadi 'piutang yatim'
        try { db.prepare("UPDATE invoices SET status='void', voided_at=NOW_LOCAL(), void_reason='Auto-hapus: menunggak > ? bulan' WHERE customer_id=? AND status='unpaid'").run(m, c.id); } catch (e) {}
        if (waOn && c.phone) { try { const _def = '🗑️ *Akun Dihapus*\n\nYth. *{{nama}}*,\n\nAkun layanan internet Anda telah *DIHAPUS OTOMATIS* karena tagihan tidak dibayar *{{bulan_nunggak}} bulan berturut-turut*.\n\nUntuk berlangganan kembali, silakan *mendaftar dari awal*. Terima kasih.\n— {{company}}'; const _tpl = String(db.getAppSetting('whatsapp_deleted_message', _def) || _def); const _msg = _tpl.replace(/{{nama}}/gi, c.name || 'Pelanggan').replace(/{{id_pelanggan}}/gi, c.customer_code || ('ID:' + c.id)).replace(/{{bulan_nunggak}}/gi, String(c.unpaid_streak || 0)).replace(/{{company}}/gi, getSetting('company_header','') || '-'); await waNotify.sendText(c.phone, _msg); } catch (e) {} }
        await deleteCustomer(c.id);
        removed.push(c.name);
      } catch (e) {
        logger.error(`[AutoDelete] Gagal menghapus "${c.name}" (ID ${c.id}): ${e.message}`);
      }
    }
  }

  // ── 3) Ringkasan ke admin ──
  if (waOn && (processed > 0 || removed.length > 0)) {
    try {
      const parts = [];
      if (processed) parts.push(`${processed} pelanggan NONAKTIF (menunggak ${m} bln)`);
      if (removed.length) parts.push(`${removed.length} pelanggan DIHAPUS (menunggak > ${m} bln)`);
      await waNotify.notifyAdmin(`📋 *Auto-Tunggakan*
${parts.join('; ')}.

Nonaktif: ${names.join(', ') || '-'}
Dihapus: ${removed.join(', ') || '-'}`);
    } catch (e) {}
  }

  return { candidates: rows.length, processed, failed, names, removed };
}

module.exports = {
  getAllCustomers, getAllCustomerAreas, getCustomerById, createCustomer, updateCustomer, deleteCustomer, bulkDeleteCustomers, getCustomerStats,
  getAllPackages, getPackageById, createPackage, updatePackage, deletePackage,
  suspendCustomer, activateCustomer, autoDeactivateOverdueCustomers, generatePppoeAccount, findCustomerByAny, findCustomerForLogin, updateCustomerCablePath,
  resetPromoCyclesUsed, getEffectiveRouterId
};
