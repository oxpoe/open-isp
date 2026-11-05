/**
 * Isolir Redirector
 * Menerima HTTP request dari pelanggan terisolir (host/path apa pun) dan
 * mengalihkan (302) ke halaman isolir dinamis milik portal billing.
 *
 * Dipakai oleh rule NAT MikroTik: dst-address=<server> to-ports=<PORT ini>.
 * Karena edge publik (Traefik/NetBird) melakukan 308 ke HTTPS dan TLS hanya
 * melayani domain kanonik, DNAT polos tidak cukup — harus redirect ke URL kanonik.
 */
const http = require('http');

const PORT = parseInt(process.env.ISOLIR_REDIRECT_PORT || '8099', 10);

// Target dibaca ulang dari settings (bisa diubah dari dashboard tanpa restart).
function currentTarget() {
  try {
    const { getSetting } = require('./config/settingsManager');
    const s = String(getSetting('isolir_portal_url', '') || '').trim();
    if (s) return s;
  } catch (_) {}
  return String(process.env.ISOLIR_REDIRECT_URL || '').trim() || 'http://localhost:3001/isolated';
}

const server = http.createServer((req, res) => {
  const TARGET = currentTarget();
  // Jangan cache supaya pelanggan selalu diarahkan ke portal terbaru
  res.writeHead(302, {
    Location: TARGET,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Content-Type': 'text/html; charset=utf-8',
  });
  res.end(
    '<!doctype html><meta charset="utf-8"><title>Mengalihkan…</title>' +
    '<meta http-equiv="refresh" content="0;url=' + TARGET + '">' +
    '<p>Mengalihkan ke portal pembayaran… <a href="' + TARGET + '">Lanjut</a></p>'
  );
});

server.on('error', (e) => console.error('[isolir-redirect] listen error:', e.message));

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[isolir-redirect] listening on 0.0.0.0:${PORT} -> ${currentTarget()}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
