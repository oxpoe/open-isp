/**
 * Settings Audit Trail
 * Log semua perubahan settings untuk compliance & debugging
 */
const fs = require('fs');
const path = require('path');
const { logger } = require('./logger');
const { isSensitiveField, maskValue } = require('./settingsEncryption');

const AUDIT_LOG_DIR = path.join(__dirname, '../logs/settings-audit');
const AUDIT_LOG_FILE = path.join(AUDIT_LOG_DIR, 'settings-changes.jsonl');

// Ensure audit log directory exists
if (!fs.existsSync(AUDIT_LOG_DIR)) {
  fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
}

/**
 * Log settings change
 */
function logSettingsChange(actor, changes, metadata = {}) {
  try {
    const timestamp = new Date().toISOString();
    
    // Mask sensitive values
    const maskedChanges = {};
    Object.keys(changes).forEach(field => {
      if (isSensitiveField(field)) {
        maskedChanges[field] = {
          oldValue: maskValue(changes[field].oldValue),
          newValue: maskValue(changes[field].newValue)
        };
      } else {
        maskedChanges[field] = changes[field];
      }
    });

    const logEntry = {
      timestamp,
      actor: actor || 'system',
      changes: maskedChanges,
      ip: metadata.ip || 'unknown',
      userAgent: metadata.userAgent || 'unknown',
      metadata
    };

    // Write to JSONL file
    fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(logEntry) + '\n', 'utf-8');

    logger.info(`[settings-audit] Settings changed by ${actor}`, {
      changes: Object.keys(maskedChanges),
      timestamp
    });

    return true;
  } catch (error) {
    logger.error(`[settings-audit] Error logging settings change: ${error.message}`);
    return false;
  }
}

/**
 * Get settings change history
 */
function getChangeHistory(limit = 100) {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return [];

    const lines = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8').split('\n').filter(l => l.trim());
    const entries = lines.map(line => JSON.parse(line));

    // Return latest entries
    return entries.slice(-limit).reverse();
  } catch (error) {
    logger.error(`[settings-audit] Error reading change history: ${error.message}`);
    return [];
  }
}

/**
 * Get changes by actor
 */
function getChangesByActor(actor, limit = 50) {
  try {
    const history = getChangeHistory(1000);
    return history.filter(entry => entry.actor === actor).slice(0, limit);
  } catch (error) {
    logger.error(`[settings-audit] Error filtering by actor: ${error.message}`);
    return [];
  }
}

/**
 * Get changes by field
 */
function getChangesByField(field, limit = 50) {
  try {
    const history = getChangeHistory(1000);
    return history.filter(entry => entry.changes[field]).slice(0, limit);
  } catch (error) {
    logger.error(`[settings-audit] Error filtering by field: ${error.message}`);
    return [];
  }
}

/**
 * Get changes in date range
 */
function getChangesByDateRange(startDate, endDate, limit = 100) {
  try {
    const history = getChangeHistory(1000);
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return history.filter(entry => {
      const entryTime = new Date(entry.timestamp).getTime();
      return entryTime >= start && entryTime <= end;
    }).slice(0, limit);
  } catch (error) {
    logger.error(`[settings-audit] Error filtering by date range: ${error.message}`);
    return [];
  }
}

/**
 * Export audit log
 */
function exportAuditLog(format = 'json') {
  try {
    const history = getChangeHistory(10000);

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['Timestamp', 'Actor', 'Field', 'Old Value', 'New Value', 'IP'];
      const rows = [];

      history.forEach(entry => {
        Object.keys(entry.changes).forEach(field => {
          rows.push([
            entry.timestamp,
            entry.actor,
            field,
            entry.changes[field].oldValue,
            entry.changes[field].newValue,
            entry.ip
          ]);
        });
      });

      return {
        headers,
        rows,
        data: [headers, ...rows].map(row => row.join(',')).join('\n')
      };
    }

    // Default JSON format
    return {
      format: 'json',
      count: history.length,
      data: history
    };
  } catch (error) {
    logger.error(`[settings-audit] Error exporting audit log: ${error.message}`);
    return null;
  }
}

/**
 * Clear old audit logs (retention policy)
 */
function clearOldLogs(daysToKeep = 90) {
  try {
    if (!fs.existsSync(AUDIT_LOG_FILE)) return;

    const lines = fs.readFileSync(AUDIT_LOG_FILE, 'utf-8').split('\n').filter(l => l.trim());
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const recentLines = lines.filter(line => {
      try {
        const entry = JSON.parse(line);
        return new Date(entry.timestamp) > cutoffDate;
      } catch {
        return false;
      }
    });

    fs.writeFileSync(AUDIT_LOG_FILE, recentLines.join('\n') + '\n', 'utf-8');

    logger.info(`[settings-audit] Cleared old logs, kept ${recentLines.length} entries`);
    return true;
  } catch (error) {
    logger.error(`[settings-audit] Error clearing old logs: ${error.message}`);
    return false;
  }
}

/**
 * Get audit statistics
 */
function getAuditStats() {
  try {
    const history = getChangeHistory(10000);

    const stats = {
      totalChanges: history.length,
      uniqueActors: new Set(history.map(e => e.actor)).size,
      changedFields: new Set(),
      changesByActor: {},
      changesByField: {},
      lastChange: history[0] || null
    };

    history.forEach(entry => {
      // Count by actor
      stats.changesByActor[entry.actor] = (stats.changesByActor[entry.actor] || 0) + 1;

      // Count by field
      Object.keys(entry.changes).forEach(field => {
        stats.changedFields.add(field);
        stats.changesByField[field] = (stats.changesByField[field] || 0) + 1;
      });
    });

    stats.changedFields = Array.from(stats.changedFields);

    return stats;
  } catch (error) {
    logger.error(`[settings-audit] Error getting audit stats: ${error.message}`);
    return null;
  }
}

module.exports = {
  logSettingsChange,
  getChangeHistory,
  getChangesByActor,
  getChangesByField,
  getChangesByDateRange,
  exportAuditLog,
  clearOldLogs,
  getAuditStats,
  AUDIT_LOG_FILE
};
