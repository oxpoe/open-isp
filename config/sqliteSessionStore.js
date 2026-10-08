/* config/sqliteSessionStore.js
   Session store berbasis SQLite (better-sqlite3) agar sesi PERSISTEN
   lintas restart proses — penting untuk alur OTP (pending_login di session)
   dan agar pelanggan tidak terlempar ke halaman login saat server restart. */
const session = require('express-session');

module.exports = function createSqliteSessionStore(db) {
  const Store = session.Store;

  class SqliteSessionStore extends Store {
    constructor() {
      super();
      db.exec(`CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        expires_at INTEGER
      )`);
      this._get = db.prepare('SELECT data, expires_at FROM sessions WHERE sid = ?');
      this._set = db.prepare('INSERT OR REPLACE INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)');
      this._del = db.prepare('DELETE FROM sessions WHERE sid = ?');
      this._clean = db.prepare('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at < ?');
      const timer = setInterval(() => { try { this._clean.run(Date.now()); } catch (e) {} }, 15 * 60 * 1000);
      if (timer.unref) timer.unref();
    }
    get(sid, cb) {
      try {
        const row = this._get.get(sid);
        if (!row) return cb(null, null);
        if (row.expires_at && row.expires_at < Date.now()) { this._del.run(sid); return cb(null, null); }
        return cb(null, JSON.parse(row.data));
      } catch (e) { return cb(e); }
    }
    set(sid, sess, cb) {
      try {
        let exp = null;
        const c = sess && sess.cookie;
        if (c && c.expires) exp = new Date(c.expires).getTime();
        else if (c && c.maxAge) exp = Date.now() + c.maxAge;
        this._set.run(sid, JSON.stringify(sess), exp);
        if (cb) cb(null);
      } catch (e) { if (cb) cb(e); }
    }
    destroy(sid, cb) { try { this._del.run(sid); if (cb) cb(null); } catch (e) { if (cb) cb(e); } }
    touch(sid, sess, cb) { return this.set(sid, sess, cb); }
  }

  return new SqliteSessionStore();
};
