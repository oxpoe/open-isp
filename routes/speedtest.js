/**
 * Backend LibreSpeed (kompatibel protokol speedtest) untuk self-hosted speed test.
 *  - GET  /speedtest/garbage.php  -> stream data acak (unduh)
 *  - ALL  /speedtest/empty.php    -> terima & buang data (unggah / ping)
 *  - ALL  /speedtest/getIP.php    -> info IP klien
 *
 * Dipasang SEBELUM body-parser global agar unggahan besar tidak dibuffer.
 */
const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// Buffer acak 4 MB yang dipakai berulang (hindari alokasi per-chunk)
const RANDOM_CHUNK = crypto.randomBytes(4 * 1024 * 1024);
const MAX_MB = 512;

router.get('/garbage.php', (req, res) => {
  let mb = parseInt(req.query.ckSize, 10);
  if (!Number.isFinite(mb) || mb <= 0) mb = 100;
  if (mb > MAX_MB) mb = MAX_MB;
  const total = mb * 1024 * 1024;

  res.set('Content-Type', 'application/octet-stream');
  res.set('Content-Description', 'File Transfer');
  res.set('Content-Transfer-Encoding', 'binary');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');

  let sent = 0;
  const pump = () => {
    while (sent < total) {
      const size = Math.min(RANDOM_CHUNK.length, total - sent);
      sent += size;
      const chunk = size === RANDOM_CHUNK.length ? RANDOM_CHUNK : RANDOM_CHUNK.subarray(0, size);
      if (!res.write(chunk)) {
        res.once('drain', pump);
        return;
      }
    }
    res.end();
  };
  pump();
});

router.all('/empty.php', (req, res) => {
  // Buang seluruh body (unggahan) tanpa menyimpan
  req.on('data', () => {});
  req.on('error', () => {});
  const finish = () => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.status(200).type('text/plain').send('OK');
  };
  if (req.readableEnded || req.complete) finish();
  else req.on('end', finish);
});

router.all('/getIP.php', (req, res) => {
  let ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  if (!ip) ip = (req.socket && req.socket.remoteAddress) || '';
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.json({ processedString: ip, rawIspInfo: '' });
});

// Telemetry (tidak dipakai bila telemetry_level=disabled, tetap disediakan)
router.all('/telemetry.php', (req, res) => {
  req.on('data', () => {});
  if (req.readableEnded || req.complete) { res.status(200).json({ ok: true }); return; }
  req.on('end', () => res.status(200).json({ ok: true }));
});

module.exports = router;