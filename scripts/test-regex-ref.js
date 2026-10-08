// Test regex dari referensi billing-rtrw-main
const tests = [
  ':put (",rem,4000,2d,5000,,Disable,");',
  ':put (",rem,4000,2d,5000,,Disable,"); {:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment];}',
  ':put (",rem,10000,1d,15000,,Disable,");',
  ':put (",rem,0,30m,3000,,Disable,");',
  // Format tanpa harga beli (COST=0)
  ':put (",rem,,1h,5000,,Disable,");',
];

// Regex dari referensi
function parseMikhmonRef(script) {
  if (!script) return null;
  const m = String(script).match(/",rem,.*?,(.*?),(.*?),.*?"/);
  if (!m) return null;
  const validity = String(m[1] || '').trim();
  const price = Number(String(m[2] || '').replace(/[^\d]/g, '')) || 0;
  return { validity, price };
}

// Regex yang sedang dipakai di project
function parseMikhmonCurrent(script) {
  if (!script) return null;
  const s = String(script).trim();
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
  // Fallback split
  const parts = s.split(',').map(p => String(p).trim());
  let remIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('rem')) { remIdx = i; break; }
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

console.log('=== PERBANDINGAN REGEX ===\n');
for (const t of tests) {
  const ref = parseMikhmonRef(t);
  const cur = parseMikhmonCurrent(t);
  const match = JSON.stringify(ref) === JSON.stringify({validity: cur?.validity, price: cur?.price});
  console.log('Script:', t.substring(0, 60));
  console.log('  Referensi :', ref);
  console.log('  Sekarang  :', cur);
  console.log('  Sama?     :', match ? '✅' : '❌');
  console.log();
}
