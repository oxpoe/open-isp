/**
 * Service: System Diagnostics & Troubleshooting
 * Melakukan pengecekan terhadap dependensi eksternal dan diagnosa masalah
 */
const { logger } = require('../config/logger');
const db = require('../config/database');
const mikrotikService = require('./mikrotikService');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Perform a full system dependency check
 */
async function checkDependencies() {
  const results = {
    mikrotik: [],
    genieacs: { status: 'unknown', message: '' },
    whatsapp: { status: 'unknown', message: '' },
    paymentGateways: [],
    timestamp: new Date().toISOString()
  };

  // 1. Check MikroTik Routers
  try {
    const routers = db.prepare('SELECT * FROM routers').all();
    for (const r of routers) {
      try {
        // Simple connectivity check (get identity or similar)
        const isOnline = await mikrotikService.checkConnection(r.id);
        results.mikrotik.push({
          name: r.name,
          host: r.host,
          status: isOnline ? 'online' : 'offline',
          error: isOnline ? null : 'Connection failed'
        });
      } catch (err) {
        results.mikrotik.push({
          name: r.name,
          host: r.host,
          status: 'offline',
          error: err.message
        });
      }
    }
  } catch (err) {
    logger.error(`[Diagnostics] MikroTik check failed: ${err.message}`);
  }

  // 2. Check GenieACS
  try {
    const { getSetting } = require('../config/settingsManager');
    const { isBuiltinAcsEnabled } = require('../config/genieacs');
    
    if (isBuiltinAcsEnabled()) {
      const count = db.prepare('SELECT COUNT(*) as c FROM acs_devices').get();
      results.genieacs = {
        status: 'online',
        message: `Built-in ACS active (${count.c} devices)`
      };
    } else {
      const acsUrl = getSetting('genieacs_url', 'http://localhost:7557');
      const username = getSetting('genieacs_username', '');
      const password = getSetting('genieacs_password', '');
      
      // Try to get devices list to verify GenieACS is working
      const devicesUrl = `${acsUrl}/devices?limit=1`;
      const config = {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept any status < 500
      };
      
      if (username && password) {
        config.auth = { username, password };
      }
      
      const response = await axios.get(devicesUrl, config);
      
      // If we get a response (even 401), GenieACS is online
      if (response.status === 200 || response.status === 401) {
        results.genieacs = {
          status: 'online',
          message: response.status === 200 ? 'GenieACS is responding' : 'GenieACS online (auth required)'
        };
      } else {
        results.genieacs = {
          status: 'warning',
          message: `GenieACS responding with status ${response.status}`
        };
      }
    }
  } catch (err) {
    // Check if it's a connection error or timeout
    if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      results.genieacs = {
        status: 'offline',
        message: 'GenieACS unreachable (connection refused)'
      };
    } else {
      results.genieacs = {
        status: 'offline',
        message: `GenieACS error: ${err.message}`
      };
    }
  }

  // 3. Check WhatsApp Gateway (using whatsappStatus from whatsappBot)
  try {
    // Import whatsappStatus dynamically to get real-time status
    const whatsappBotModule = await import('./whatsappBot.mjs');
    const waStatus = whatsappBotModule.whatsappStatus;
    
    // Check connection status
    // Possible values: 'connecting', 'qr', 'open', 'loggedOut', 'close'
    const isOnline = waStatus.connection === 'open';
    const isQR = waStatus.connection === 'qr';
    const isLoggedOut = waStatus.connection === 'loggedOut';
    
    let message = 'WhatsApp is disconnected';
    if (isOnline) {
      const phone = waStatus.user?.id ? String(waStatus.user.id).split(':')[0] : 'Unknown';
      message = `WhatsApp connected (${phone})`;
    } else if (isQR) {
      message = 'WhatsApp waiting for QR scan';
    } else if (isLoggedOut) {
      message = 'WhatsApp logged out - scan QR again';
    } else {
      message = `WhatsApp ${waStatus.connection || 'disconnected'}`;
    }
    
    results.whatsapp = {
      status: isOnline ? 'online' : 'offline',
      message: message
    };
  } catch (err) {
    results.whatsapp = {
      status: 'offline',
      message: `WhatsApp check error: ${err.message}`
    };
  }

  return results;
}

/**
 * Get recent errors from log file
 */
function getRecentErrors(limit = 10) {
  try {
    const logPath = path.join(__dirname, '../logs/error.log');
    if (!fs.existsSync(logPath)) return [];

    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    return lines.slice(-limit).reverse();
  } catch (err) {
    return [`Error reading log: ${err.message}`];
  }
}

/**
 * Comprehensive Customer Diagnostics
 */
async function diagnoseCustomer(customerId) {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customer) throw new Error('Customer not found');

  const report = {
    customer: { name: customer.name, pppoe: customer.pppoe_username },
    billing: { status: 'clean', unpaidCount: 0 },
    mikrotik: { status: 'unknown', details: null },
    genieacs: { status: 'unknown', signal: null },
    timestamp: new Date().toISOString()
  };

  // 1. Billing Check
  const unpaid = db.prepare("SELECT COUNT(*) as count FROM invoices WHERE customer_id = ? AND status = 'unpaid'").get(customerId);
  report.billing.unpaidCount = unpaid.count;
  if (unpaid.count > 0) report.billing.status = 'warning';

  // 2. MikroTik Check
  if (customer.pppoe_username && customer.router_id) {
    try {
      const active = await mikrotikService.getPppoeActive(customer.router_id);
      const session = active.find(s => s.name === customer.pppoe_username);
      if (session) {
        report.mikrotik = {
          status: 'online',
          details: {
            uptime: session.uptime,
            address: session.address,
            caller_id: session['caller-id']
          }
        };
      } else {
        report.mikrotik.status = 'offline';
      }
    } catch (err) {
      report.mikrotik.status = 'error';
      report.mikrotik.error = err.message;
    }
  }

  return report;
}

module.exports = {
  checkDependencies,
  getRecentErrors,
  diagnoseCustomer
};
