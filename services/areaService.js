const db = require('../config/database');

/**
 * Get all areas with customer and collector statistics
 */
function getAllAreas() {
  const sql = `
    SELECT a.*,
           (SELECT COUNT(*) FROM customers c WHERE LOWER(TRIM(c.area)) = LOWER(TRIM(a.name))) as customer_count,
           (SELECT COUNT(*) FROM collectors col WHERE LOWER(TRIM(col.area)) = LOWER(TRIM(a.name))) as collector_count,
           (SELECT COUNT(*) FROM technicians t WHERE LOWER(TRIM(t.area)) = LOWER(TRIM(a.name))) as technician_count
    FROM areas a
    ORDER BY a.name ASC
  `;
  return db.prepare(sql).all();
}

/**
 * Get single area by ID
 */
function getAreaById(id) {
  return db.prepare('SELECT * FROM areas WHERE id = ?').get(id);
}

/**
 * Create new area
 */
function createArea(data) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Nama Area / Wilayah tidak boleh kosong');

  const existing = db.prepare('SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name);
  if (existing) throw new Error(`Area "${name}" sudah ada.`);

  const stmt = db.prepare('INSERT INTO areas (name, description) VALUES (?, ?)');
  return stmt.run(name, String(data.description || '').trim());
}

/**
 * Update existing area
 */
function updateArea(id, data) {
  const oldArea = getAreaById(id);
  if (!oldArea) throw new Error('Data Area tidak ditemukan');

  const newName = String(data.name || '').trim();
  if (!newName) throw new Error('Nama Area / Wilayah tidak boleh kosong');

  const existing = db.prepare('SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ?').get(newName, id);
  if (existing) throw new Error(`Nama Area "${newName}" sudah digunakan oleh area lain.`);

  const description = String(data.description || '').trim();

  // If area name changed, update references in customers, collectors, technicians
  if (oldArea.name !== newName) {
    db.prepare('UPDATE customers SET area = ? WHERE LOWER(TRIM(area)) = LOWER(TRIM(?))').run(newName, oldArea.name);
    db.prepare('UPDATE collectors SET area = ? WHERE LOWER(TRIM(area)) = LOWER(TRIM(?))').run(newName, oldArea.name);
    db.prepare('UPDATE technicians SET area = ? WHERE LOWER(TRIM(area)) = LOWER(TRIM(?))').run(newName, oldArea.name);
  }

  const stmt = db.prepare('UPDATE areas SET name = ?, description = ? WHERE id = ?');
  return stmt.run(newName, description, id);
}

/**
 * Delete area
 */
function deleteArea(id) {
  const area = getAreaById(id);
  if (!area) throw new Error('Data Area tidak ditemukan');

  return db.prepare('DELETE FROM areas WHERE id = ?').run(id);
}

module.exports = {
  getAllAreas,
  getAreaById,
  createArea,
  updateArea,
  deleteArea
};
