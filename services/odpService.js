const db = require('../config/database');

/**
 * ODP SERVICE
 * Mengelola data Optical Distribution Point (ODP) + skema port.
 * - port_capacity = jumlah maksimal port pada ODP.
 * - customers.pon_port = nomor port ODP yang dipakai pelanggan.
 */

function getAllOdps() {
  return db.prepare(`
    SELECT o.*, olt.name as olt_name 
    FROM odps o 
    LEFT JOIN olts olt ON o.olt_id = olt.id 
    ORDER BY o.name ASC
  `).all();
}

function getOdpById(id) {
  return db.prepare('SELECT * FROM odps WHERE id = ?').get(id);
}

function parseCapacity(v) {
  const n = parseInt(v, 10);
  return (Number.isFinite(n) && n > 0) ? n : 16;
}

function createOdp(data) {
  const capacity = parseCapacity(data.port_capacity);
  const stmt = db.prepare(`
    INSERT INTO odps (name, olt_id, pon_port, port_capacity, lat, lng, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    data.name,
    data.olt_id ? parseInt(data.olt_id) : null,
    data.pon_port || '',
    capacity,
    data.lat || '',
    data.lng || '',
    data.description || ''
  );
}

function updateOdp(id, data) {
  const capacity = parseCapacity(data.port_capacity);
  const usage = getOdpPortUsage(id);
  if (usage && capacity < usage.usedCount) {
    throw new Error('Kapasitas port (' + capacity + ') lebih kecil dari jumlah port yang sudah terpakai (' + usage.usedCount + ').');
  }
  const stmt = db.prepare(`
    UPDATE odps 
    SET name = ?, olt_id = ?, pon_port = ?, port_capacity = ?, lat = ?, lng = ?, description = ?
    WHERE id = ?
  `);
  return stmt.run(
    data.name,
    data.olt_id ? parseInt(data.olt_id) : null,
    data.pon_port || '',
    capacity,
    data.lat || '',
    data.lng || '',
    data.description || '',
    id
  );
}

function deleteOdp(id) {
  return db.prepare('DELETE FROM odps WHERE id = ?').run(id);
}

function getOdpPortUsage(odpId) {
  const odp = getOdpById(odpId);
  if (!odp) return null;
  const usedRaw = db.prepare("SELECT pon_port, name, pppoe_username FROM customers WHERE odp_id = ? AND pon_port IS NOT NULL AND TRIM(pon_port) != ''").all(odpId);
  const usedBy = {};
  for (const r of usedRaw) {
    const p = String(r.pon_port).trim();
    if (p && usedBy[p] === undefined) usedBy[p] = { name: r.name || '', pppoe: String(r.pppoe_username || '').toLowerCase() };
  }
  const usedPorts = Object.keys(usedBy).sort((a, b) => a.localeCompare(b, 'id-ID', { numeric: true }));
  const capacity = parseCapacity(odp.port_capacity);
  const usedCount = usedPorts.length;
  const remaining = Math.max(0, capacity - usedCount);
  return { odpId: Number(odpId), capacity, usedCount, remaining, usedPorts, usedBy };
}

/**
 * Validasi penempatan port pelanggan pada sebuah ODP.
 * - Port tidak boleh melebihi kapasitas (maksimal port) ODP.
 * - Port tidak boleh dipakai pelanggan lain pada ODP yang sama.
 * Nilai non-numerik (data lama) dilewatkan agar tetap kompatibel.
 */
function validateOdpPort(odpId, ponPort, excludeCustomerId) {
  if (odpId === undefined || odpId === null || String(odpId).trim() === '') return;
  const portStr = String(ponPort === undefined || ponPort === null ? '' : ponPort).trim();
  if (!portStr) return;
  if (!/^\d+$/.test(portStr)) return;

  const odp = getOdpById(Number(odpId));
  if (!odp) throw new Error('ODP tidak ditemukan.');

  const capacity = parseCapacity(odp.port_capacity);
  const portNo = parseInt(portStr, 10);
  if (portNo < 1 || portNo > capacity) {
    throw new Error('Port ODP ' + portNo + ' melebihi kapasitas ODP "' + odp.name + '" (maksimal ' + capacity + ' port). Ubah kapasitas ODP bila perlu.');
  }

  const ex = (excludeCustomerId === undefined || excludeCustomerId === null || excludeCustomerId === '') ? null : Number(excludeCustomerId);
  const dup = ex
    ? db.prepare("SELECT id, name FROM customers WHERE odp_id = ? AND TRIM(COALESCE(pon_port,'')) = ? AND id != ? LIMIT 1").get(Number(odpId), portStr, ex)
    : db.prepare("SELECT id, name FROM customers WHERE odp_id = ? AND TRIM(COALESCE(pon_port,'')) = ? LIMIT 1").get(Number(odpId), portStr);
  if (dup) throw new Error('Port ODP ' + portNo + ' sudah dipakai oleh pelanggan "' + dup.name + '".');
}

module.exports = {
  getAllOdps,
  getOdpById,
  createOdp,
  updateOdp,
  deleteOdp,
  getOdpPortUsage,
  validateOdpPort
};
