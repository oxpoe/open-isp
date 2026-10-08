/**
 * Mikhmon On-Login Script Parser (Shared Utility)
 * 
 * Parse metadata harga, validity, dan cost dari on-login script profile hotspot MikroTik.
 * Format yang didukung:
 *   1. Mikhmon standar:  :put (",rem,COST,VALIDITY,PRICE,...");
 *   2. Comma-split lama: ...,rem,COST,VALIDITY,PRICE,...
 * 
 * Digunakan oleh:
 *   - routes/customerPortal.js  (route handler voucher)
 *   - services/voucherCacheWarmer.js (background cache warmer)
 */

'use strict';

/**
 * @param {string} script - Isi field on-login dari hotspot user profile MikroTik
 * @returns {{ validity: string, price: number, cost: number } | null}
 */
function parseMikhmonOnLogin(script) {
  if (!script) return null;
  const s = String(script).trim();

  // Format 1: :put (",rem,COST,VALIDITY,PRICE,...)
  // Support ROS6 dan ROS7 (script bisa berbeda struktur)
  // Cari pattern :put (",rem, ... , ... , ...
  // Updated regex untuk support format: :put (",rem,4000,2d,5000,,Disable,");
  const putMatch = s.match(/:\s*put\s*\(\s*[",]rem[",]?\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)/i);
  if (putMatch) {
    const cost = String(putMatch[1] || '').trim();
    const validity = String(putMatch[2] || '').trim();
    const priceStr = String(putMatch[3] || '').trim();
    const price = Number(priceStr.replace(/[^\d]/g, '')) || 0;

    if (validity && price > 0) {
      return { validity, price, cost: Number(cost.replace(/[^\d]/g, '')) || 0 };
    }
  }

  // Format 2: $HARGA^VALIDITAS (shorthand Mikhmon v2 / custom)
  // Contoh: $5000^1d atau $10000^7d
  const shortMatch = s.match(/\$(\d+)\^([\w]+)/i);
  if (shortMatch) {
    const price = Number(shortMatch[1]) || 0;
    const validity = String(shortMatch[2] || '').trim();
    if (price > 0 && validity) {
      return { price, validity, cost: 0 };
    }
  }

  // Format 3: HARGA^VALIDITAS (tanpa dollar, untuk script custom)
  // Contoh: 5000^1d atau 10000^7d dalam on-login
  const bareMatch = s.match(/(?:^|[\s,;])(\d{3,})\^([\d]+[dhwm])/i);
  if (bareMatch) {
    const price = Number(bareMatch[1]) || 0;
    const validity = String(bareMatch[2] || '').trim();
    if (price > 0 && validity) {
      return { price, validity, cost: 0 };
    }
  }

  // Format 4: Fallback split by comma (untuk format lama)
  const parts = s.split(',').map(p => String(p).trim());
  let remIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const norm = String(parts[i] || '').toLowerCase().replace(/[^a-z]/g, '');
    if (norm === 'rem') {
      remIdx = i;
      break;
    }
  }

  if (remIdx >= 0 && remIdx + 3 < parts.length) {
    const cost = String(parts[remIdx + 1] || '').trim();
    const validity = String(parts[remIdx + 2] || '').trim();
    const priceStr = String(parts[remIdx + 3] || '').trim();
    const price = Number(priceStr.replace(/[^\d]/g, '')) || 0;

    if (validity && price > 0) {
      return { validity, price, cost: Number(cost.replace(/[^\d]/g, '')) || 0 };
    }
  }

  return null;
}

module.exports = { parseMikhmonOnLogin };
