/**
 * Self-check: pembatasan wilayah teknisi & kolektor.
 * Jalankan: node tests/unit/area-access.test.js
 * DB dan modul berat di-stub supaya bisa jalan tanpa node_modules.
 */
const assert = require('assert');
const path = require('path');

function stub(rel, exports) {
  const p = require.resolve(path.join(__dirname, '..', '..', rel));
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}

const techRows = { 1: { id: 1, area: 'Area A, Area B' }, 2: { id: 2, area: '' }, 3: { id: 3, area: 'semua' } };
const colRows = { 7: { id: 7, area: 'Area A' }, 8: { id: 8, area: '' } };

const db = {
  prepare(sql) {
    return {
      get(id) {
        if (/FROM technicians/.test(sql)) return techRows[Number(id)];
        if (/FROM collectors/.test(sql)) return colRows[Number(id)];
        return undefined;
      },
      all() { return []; },
      run() { return { changes: 1 }; },
    };
  },
  exec() {},
};

stub('config/database', db);
stub('config/logger', { logger: { info() {}, warn() {}, error() {}, debug() {} } });
stub('config/settingsManager', { getCurrentDateInTimezone: () => new Date(), getSetting: () => '' });
stub('services/customerIdService', { generateCustomerCode: () => 'C0001', backfillCustomerCodes: () => 0 });

const tech = require('../../services/techService');
const cust = require('../../services/customerService');

// Teknisi: area dipisah koma -> dibatasi ke dua area
const tf = tech.getTechAreaWhere(1, 'c');
assert.strictEqual(tf.isRestricted, true);
assert.deepStrictEqual(tf.areas, ['area a', 'area b']);
assert.ok(tf.where.includes('IN (?, ?)'));

// Teknisi tanpa area / "semua" -> tidak dibatasi
assert.strictEqual(tech.getTechAreaWhere(2).isRestricted, false);
assert.strictEqual(tech.getTechAreaWhere(3).isRestricted, false);

// canTechAccessCustomer
assert.strictEqual(tech.canTechAccessCustomer(1, { area: 'area b' }), true);
assert.strictEqual(tech.canTechAccessCustomer(1, { area: 'area z' }), false);
assert.strictEqual(tech.canTechAccessCustomer(1, { area: '' }), false);
assert.strictEqual(tech.canTechAccessCustomer(2, { area: 'apa saja' }), true);
assert.strictEqual(tech.canTechAccessCustomer(null, { area: 'area a' }), false);

// Kolektor: pelanggan yang ditugaskan ke kolektor lain selalu ditolak
assert.strictEqual(cust.canCollectorAccessCustomer(7, { area: 'area a', collector_id: 0 }), true);
assert.strictEqual(cust.canCollectorAccessCustomer(7, { area: 'area a', collector_id: 7 }), true);
assert.strictEqual(cust.canCollectorAccessCustomer(7, { area: 'area a', collector_id: 8 }), false);
assert.strictEqual(cust.canCollectorAccessCustomer(7, { area: 'area z', collector_id: 0 }), false);
assert.strictEqual(cust.canCollectorAccessCustomer(8, { area: 'area z', collector_id: 0 }), true);

// Where kolektor memuat batas area + kolektor_id
const cf = cust.getCollectorCustomerWhere(7, 'c');
assert.strictEqual(cf.isRestricted, true);
assert.deepStrictEqual(cf.params, ['area a', 7]);
const cf2 = cust.getCollectorCustomerWhere(8, 'c');
assert.strictEqual(cf2.isRestricted, false);
assert.deepStrictEqual(cf2.params, [8]);

console.log('OK: area-access (teknisi & kolektor)');
