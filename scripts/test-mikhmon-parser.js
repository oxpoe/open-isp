/**
 * Test script untuk Mikhmon parser
 * Format: :put (",rem,4000,2d,5000,,Disable,");
 */

// Copy parser dari customerPortal.js
function parseMikhmonOnLogin(script) {
  if (!script) return null;
  const s = String(script).trim();
  
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
  
  // Fallback: split by comma
  const parts = s.split(',').map(p => String(p).trim());
  let remIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].includes('rem')) {
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

// Test cases
const testCases = [
  {
    name: 'Format Mikhmon Baru (ROS6/ROS7)',
    script: ':put (",rem,4000,2d,5000,,Disable,");',
    expected: { validity: '2d', price: 5000, cost: 4000 }
  },
  {
    name: 'Format Mikhmon Baru (tanpa koma di akhir)',
    script: ':put (",rem,4000,2d,5000,,Disable,")',
    expected: { validity: '2d', price: 5000, cost: 4000 }
  },
  {
    name: 'Format Mikhmon Baru (dengan spasi)',
    script: ':put ( "rem" , 4000 , 2d , 5000 , , Disable , ) ;',
    expected: { validity: '2d', price: 5000, cost: 4000 }
  },
  {
    name: 'Format Mikhmon Lama (tanpa rem)',
    script: ':put (",10000,1d,15000,");',
    expected: null
  },
  {
    name: 'Script lengkap dengan banyak baris',
    script: `:put (",rem,4000,2d,5000,,Disable,");
:local comment [ /ip hotspot user get [/ip hotspot user find where name="$user"] comment];
:local ucode [:pic $comment 0 2];
:if ($ucode = "vc" or $ucode = "up" or $comment = "") do={
  :local date [ /system clock get date ];
  :local year [ :pick $date 7 11 ];
  :local month [ :pick $date 0 3 ];
  /sys sch add name="$user" disable=no start-date=$date interval="2d";
  :delay 5s;
  :local exp [ /sys sch get [ /sys sch find where name="$user" ] next-run];
  :local getxp [len $exp];
  :if ($getxp = 15) do={
    :local d [:pic $exp 0 6];
    :local t [:pic $exp 7 16];
    :local s ("/");
    :local exp ("$d$s$year $t");
    /ip hotspot user set comment="$exp" [find where name="$user"];
  };
  :if ($getxp = 8) do={
    /ip hotspot user set comment="$date $exp" [find where name="$user"];
  };
  :if ($getxp > 15) do={
    /ip hotspot user set comment="$exp" [find where name="$user"];
  };
  :delay 5s;
  /sys sch remove [find where name="$user"]
}`,
    expected: { validity: '2d', price: 5000, cost: 4000 }
  }
];

console.log('=== TEST MIKHMON PARSER ===\n');

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = parseMikhmonOnLogin(test.script);
  const success = result && 
                  result.validity === test.expected.validity &&
                  result.price === test.expected.price &&
                  result.cost === test.expected.cost;
  
  if (success) {
    console.log(`✅ ${test.name}`);
    console.log(`   Result: validity=${result.validity}, price=${result.price}, cost=${result.cost}\n`);
    passed++;
  } else if (!result && !test.expected) {
    console.log(`✅ ${test.name} (expected null)`);
    console.log(`   Result: null (correct)\n`);
    passed++;
  } else {
    console.log(`❌ ${test.name}`);
    console.log(`   Expected: validity=${test.expected.validity}, price=${test.expected.price}, cost=${test.expected.cost}`);
    console.log(`   Got: ${JSON.stringify(result)}\n`);
    failed++;
  }
}

console.log('=== RINGKASAN ===');
console.log(`Total: ${testCases.length}`);
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);

if (failed === 0) {
  console.log('\n🎉 Semua test passed!');
} else {
  console.log('\n⚠️ Ada test yang gagal!');
}
