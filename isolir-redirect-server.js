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
let TARGET = process.env.ISOLIR_REDIRECT_URL || '';

// Coba ambil target dari settings.json bila tersedia
try {
  const { getSetting } = require('/opt/billing-rtrw/config/settingsManager');
  const s = getSetting('isolir_portal_url', '') || '';
  if (s) TARGET = s;
} catch (_) { /* abaikan */ }

if (!TARGET) TARGET = 'http://localhost:3001/isolated';

const server = http.createServer((req, res) => {
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

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[isolir-redirect] listening on 0.0.0.0:${PORT} -> ${TARGET}`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
