const crypto = require('crypto');
const db = require('../config/database');
const { logger } = require('../config/logger');

// Pastikan tabel customer_auth_tokens ada
db.exec(`
  CREATE TABLE IF NOT EXISTS customer_auth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    customer_id INTEGER,
    login_id TEXT NOT NULL,
    pppoe_username TEXT,
    user_agent TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT (datetime('now', 'localtime'))
  );
  CREATE INDEX IF NOT EXISTS idx_cat_token ON customer_auth_tokens(token);
`);

/**
 * Buat persistent token baru (90 hari) untuk auto-login PWA
 */
function createToken(loginId, pppoeUsername, customer, req) {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const custId = customer ? customer.id : null;
    const userAgent = req?.headers ? req.headers['user-agent'] : null;
    
    // 90 hari masa berlaku token
    const expiryDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const expiresAt = expiryDate.toISOString().replace('T', ' ').slice(0, 19);

    db.prepare(`
      INSERT INTO customer_auth_tokens 
        (token, customer_id, login_id, pppoe_username, user_agent, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, custId, String(loginId).trim(), pppoeUsername || null, userAgent, expiresAt);

    return token;
  } catch (err) {
    logger.error(`[AuthToken] Gagal membuat auth token: ${err.message}`);
    return null;
  }
}

/**
 * Verifikasi token auto-login
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const row = db.prepare(`
      SELECT * FROM customer_auth_tokens 
      WHERE token = ? AND expires_at > datetime('now', 'localtime')
    `).get(token.trim());

    return row || null;
  } catch (err) {
    logger.error(`[AuthToken] Gagal verifikasi auth token: ${err.message}`);
    return null;
  }
}

/**
 * Cabut / hapus token (saat logout)
 */
function revokeToken(token) {
  if (!token) return;
  try {
    db.prepare('DELETE FROM customer_auth_tokens WHERE token = ?').run(token.trim());
  } catch (err) {
    logger.error(`[AuthToken] Gagal cabut auth token: ${err.message}`);
  }
}

/**
 * Bersihkan token yang sudah kadaluarsa
 */
function cleanupExpiredTokens() {
  try {
    db.prepare("DELETE FROM customer_auth_tokens WHERE expires_at <= datetime('now', 'localtime')").run();
  } catch (err) {}
}

module.exports = {
  createToken,
  verifyToken,
  revokeToken,
  cleanupExpiredTokens
};
