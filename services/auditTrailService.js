/**
 * Service: Audit Trail untuk Operasi Sensitif
 * Mencatat semua operasi sensitif untuk tracking dan security
 */
const db = require('../config/database');
const { logger } = require('../config/logger');

// Inisialisasi tabel audit_trail
function initAuditTrailTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT,
        actor_type TEXT NOT NULL,
        actor_id TEXT,
        actor_name TEXT,
        details TEXT,
        ip_address TEXT,
        user_agent TEXT,
        created_at DATETIME DEFAULT (NOW_LOCAL())
      );

      CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_trail(actor_type, actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_trail(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_trail(action);
      CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_trail(created_at);
    `);
  } catch (e) {
    logger.error(`[Audit Trail] Gagal inisialisasi tabel: ${e.message}`);
  }
}

// Inisialisasi saat module dimuat
initAuditTrailTable();

/**
 * Catat audit trail
 * @param {Object} data - Data audit
 * @param {string} data.action - Tipe aksi (CREATE, UPDATE, DELETE, LOGIN, LOGOUT, dll)
 * @param {string} data.entity_type - Tipe entity (customer, invoice, package, dll)
 * @param {string} data.entity_id - ID entity
 * @param {string} data.actor_type - Tipe actor (admin, cashier, technician, agent, customer, system)
 * @param {string} data.actor_id - ID actor
 * @param {string} data.actor_name - Nama actor
 * @param {Object} data.details - Detail aksi (akan di-JSON.stringify)
 * @param {string} data.ip_address - IP address
 * @param {string} data.user_agent - User agent
 */
function logAuditTrail(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_trail (
        action, entity_type, entity_id, actor_type, actor_id, actor_name,
        details, ip_address, user_agent
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      data.action,
      data.entity_type,
      data.entity_id || null,
      data.actor_type,
      data.actor_id || null,
      data.actor_name || null,
      data.details ? JSON.stringify(data.details) : null,
      data.ip_address || null,
      data.user_agent || null
    );

    logger.info(`[Audit Trail] ${data.action} ${data.entity_type} by ${data.actor_type} - ${data.actor_name}`);
  } catch (e) {
    logger.error(`[Audit Trail] Gagal mencatat audit: ${e.message}`);
  }
}

/**
 * Ambil audit trail berdasarkan filter
 * @param {Object} filters - Filter pencarian
 * @param {string} filters.action - Filter berdasarkan aksi
 * @param {string} filters.entity_type - Filter berdasarkan tipe entity
 * @param {string} filters.actor_type - Filter berdasarkan tipe actor
 * @param {string} filters.actor_id - Filter berdasarkan ID actor
 * @param {number} filters.limit - Batas hasil
 * @param {number} filters.offset - Offset hasil
 */
function getAuditTrail(filters = {}) {
  try {
    let query = 'SELECT * FROM audit_trail WHERE 1=1';
    const params = [];

    if (filters.action) {
      query += ' AND action = ?';
      params.push(filters.action);
    }

    if (filters.entity_type) {
      query += ' AND entity_type = ?';
      params.push(filters.entity_type);
    }

    if (filters.actor_type) {
      query += ' AND actor_type = ?';
      params.push(filters.actor_type);
    }

    if (filters.actor_id) {
      query += ' AND actor_id = ?';
      params.push(filters.actor_id);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = db.prepare(query);
    const results = stmt.all(...params);

    // Parse details JSON
    return results.map(row => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : null
    }));
  } catch (e) {
    logger.error(`[Audit Trail] Gagal mengambil audit: ${e.message}`);
    return [];
  }
}

/**
 * Ambil statistik audit trail
 */
function getAuditStats() {
  try {
    const stats = {
      total: 0,
      by_action: {},
      by_entity_type: {},
      by_actor_type: {},
      recent_24h: 0
    };

    // Total audit
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM audit_trail');
    stats.total = totalStmt.get().count;

    // By action
    const actionStmt = db.prepare(`
      SELECT action, COUNT(*) as count
      FROM audit_trail
      GROUP BY action
      ORDER BY count DESC
    `);
    stats.by_action = actionStmt.all();

    // By entity type
    const entityStmt = db.prepare(`
      SELECT entity_type, COUNT(*) as count
      FROM audit_trail
      GROUP BY entity_type
      ORDER BY count DESC
    `);
    stats.by_entity_type = entityStmt.all();

    // By actor type
    const actorStmt = db.prepare(`
      SELECT actor_type, COUNT(*) as count
      FROM audit_trail
      GROUP BY actor_type
      ORDER BY count DESC
    `);
    stats.by_actor_type = actorStmt.all();

    // Recent 24h
    const recentStmt = db.prepare(`
      SELECT COUNT(*) as count
      FROM audit_trail
      WHERE created_at >= datetime(NOW_LOCAL(), '-24 hours')
    `);
    stats.recent_24h = recentStmt.get().count;

    return stats;
  } catch (e) {
    logger.error(`[Audit Trail] Gagal mengambil statistik: ${e.message}`);
    return null;
  }
}

/**
 * Hapus audit trail lama (retention policy)
 * @param {number} days - Jumlah hari untuk dipertahankan (default 90 hari)
 */
function cleanupOldAuditTrail(days = 90) {
  try {
    const stmt = db.prepare(`
      DELETE FROM audit_trail
      WHERE created_at < datetime('now', '-${days} days')
    `);
    const result = stmt.run();
    logger.info(`[Audit Trail] Cleaned up ${result.changes} old records (older than ${days} days)`);
    return result.changes;
  } catch (e) {
    logger.error(`[Audit Trail] Gagal cleanup: ${e.message}`);
    return 0;
  }
}

module.exports = {
  logAuditTrail,
  getAuditTrail,
  getAuditStats,
  cleanupOldAuditTrail
};
