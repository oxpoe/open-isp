/**
 * Service: batas jumlah sesi login per akun.
 *
 * - admin / kasir / teknisi / kolektor : maksimal 2 sesi aktif per akun
 * - pelanggan                          : maksimal 3 sesi aktif per akun
 *
 * Sesi yang melebihi batas akan dihapus dari tabel `sessions` (cookie lama
 * otomatis tidak berlaku), bukan sekadar diabaikan. Rotasi session id saat
 * login mencegah session fixation.
 */
const db = require('../config/database');
const { logger } = require('../config/logger');

const DEFAULT_LIMITS = {
  admin: 2,
  cashier: 2,
  technician: 2,
  collector: 2,
  customer: 3
};

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS login_sessions (
      sid TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      account_id TEXT NOT NULL,
      ip TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_login_sessions_account ON login_sessions(role, account_id);
  `);
} catch (e) {
  logger.error('[SessionLimit] Gagal membuat tabel login_sessions: ' + e.message);
}

function now() { return Date.now(); }

/** Hapus baris yang sesi aslinya sudah tidak ada / kedaluwarsa. */
function purgeDead() {
  try {
    db.prepare(`
      DELETE FROM login_sessions
      WHERE sid NOT IN (SELECT sid FROM sessions WHERE expires_at IS NULL OR expires_at > ?)
    `).run(now());
  } catch (e) { /* tabel sessions belum ada saat init awal */ }
}

function rotateSession(req) {
  return new Promise((resolve, reject) => {
    const oldSid = req.sessionID;
    req.session.regenerate((err) => {
      if (err) return reject(err);
      try {
        if (oldSid && oldSid !== req.sessionID) {
          db.prepare('DELETE FROM login_sessions WHERE sid = ?').run(oldSid);
          db.prepare('DELETE FROM sessions WHERE sid = ?').run(oldSid);
        }
      } catch (e) { /* abaikan */ }
      resolve();
    });
  });
}

/**
 * Catat sesi login dan terapkan batas maksimal.
 * @returns {{ allowed: boolean, active: number, limit: number }}
 */
function registerLoginSession(req, { role, accountId, limit, ip = '', userAgent = '' }) {
  const r = String(role || '').toLowerCase();
  const acc = String(accountId == null ? '' : accountId);
  const max = Number(limit) > 0 ? Number(limit) : (DEFAULT_LIMITS[r] || 2);
  const sid = req.sessionID;

  if (!sid || !r || !acc) return { allowed: false, active: 0, limit: max };

  purgeDead();

  const existing = db.prepare('SELECT sid FROM login_sessions WHERE sid = ?').get(sid);
  if (existing) {
    db.prepare('UPDATE login_sessions SET last_seen = ? WHERE sid = ?').run(now(), sid);
    return { allowed: true, active: countActive(r, acc), limit: max };
  }

  const rows = db.prepare(
    'SELECT sid FROM login_sessions WHERE role = ? AND account_id = ? ORDER BY created_at ASC'
  ).all(r, acc);

  const excess = rows.length - max + 1;
  if (excess > 0) {
    for (const row of rows.slice(0, excess)) {
      try {
        db.prepare('DELETE FROM login_sessions WHERE sid = ?').run(row.sid);
        db.prepare('DELETE FROM sessions WHERE sid = ?').run(row.sid);
        logger.info(`[SessionLimit] Sesi lama ${r}:${acc} diputus (${row.sid.slice(0, 8)}…) karena melebihi batas ${max}.`);
      } catch (e) { /* abaikan */ }
    }
  }

  db.prepare(`
    INSERT INTO login_sessions (sid, role, account_id, ip, user_agent, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(sid, r, acc, String(ip || '').slice(0, 64), String(userAgent || '').slice(0, 255), now(), now());

  return { allowed: true, active: countActive(r, acc), limit: max };
}

function countActive(role, accountId) {
  try {
    const row = db.prepare(
      'SELECT COUNT(*) as c FROM login_sessions WHERE role = ? AND account_id = ?'
    ).get(String(role), String(accountId));
    return Number(row?.c || 0);
  } catch (e) { return 0; }
}

function removeLoginSession(req) {
  try {
    if (req.sessionID) db.prepare('DELETE FROM login_sessions WHERE sid = ?').run(req.sessionID);
  } catch (e) { /* abaikan */ }
}

module.exports = {
  DEFAULT_LIMITS,
  rotateSession,
  registerLoginSession,
  removeLoginSession,
  countActive,
  purgeDead
};
