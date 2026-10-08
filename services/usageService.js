/**
 * Service: Pelacakan Pemakaian Kuota (Usage Tracking)
 */
const db = require('../config/database');
const { logger } = require('../config/logger');

function getUsage(customerId, month, year) {
  return db.prepare('SELECT * FROM customer_usage WHERE customer_id = ? AND period_month = ? AND period_year = ?')
    .get(customerId, month, year);
}

function updateUsage(customerId, deltaIn, deltaOut, totalIn, totalOut) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const existing = getUsage(customerId, month, year);

  if (existing) {
    return db.prepare(`
      UPDATE customer_usage 
      SET bytes_in = bytes_in + ?, 
          bytes_out = bytes_out + ?, 
          last_total_bytes_in = ?, 
          last_total_bytes_out = ?,
          updated_at = (NOW_LOCAL())
      WHERE id = ?
    `).run(deltaIn, deltaOut, totalIn, totalOut, existing.id);
  } else {
    return db.prepare(`
      INSERT INTO customer_usage (customer_id, period_month, period_year, bytes_in, bytes_out, last_total_bytes_in, last_total_bytes_out)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(customerId, month, year, deltaIn, deltaOut, totalIn, totalOut);
  }
}

function resetUsageCounter(customerId) {
  const now = new Date();
  return db.prepare(`
    UPDATE customer_usage 
    SET last_total_bytes_in = 0, last_total_bytes_out = 0 
    WHERE customer_id = ? AND period_month = ? AND period_year = ?
  `).run(customerId, now.getMonth() + 1, now.getFullYear());
}

module.exports = { getUsage, updateUsage, resetUsageCounter };
