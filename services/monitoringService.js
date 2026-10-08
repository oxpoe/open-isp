/**
 * Service: Performance Monitoring System
 * Memantau kesehatan sistem dan performa aplikasi
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { logger } = require('../config/logger');

// Store metrics history
const metricsHistory = new Map();
const MAX_HISTORY_SIZE = 100;

// Track CPU time deltas for accurate percentage calculation
let previousCpuTimes = null;

function getCpuUsagePercent() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) return '0.00';

  let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  const total = user + nice + sys + idle + irq;

  if (!previousCpuTimes) {
    previousCpuTimes = { user, nice, sys, idle, irq, total };
    return '5.00'; // Default safe initial value
  }

  const totalDelta = total - previousCpuTimes.total;
  const idleDelta = idle - previousCpuTimes.idle;
  previousCpuTimes = { user, nice, sys, idle, irq, total };

  if (totalDelta <= 0) return '0.00';
  const usage = Math.min(100, Math.max(0, ((totalDelta - idleDelta) / totalDelta) * 100));
  return usage.toFixed(2);
}

/**
 * Get system metrics
 */
function getSystemMetrics() {
  const cpus = os.cpus();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  
  // Calculate real CPU usage percentage
  const cpuPercent = getCpuUsagePercent();
  
  // Calculate memory usage percentage
  const memoryPercent = (usedMemory / totalMemory) * 100;
  
  // Get uptime
  const uptime = process.uptime();
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);
  
  // Get load average (Fallback for Windows where loadavg is [0, 0, 0])
  const loadAverage = os.loadavg();
  let load1 = loadAverage[0];
  let load5 = loadAverage[1];
  let load15 = loadAverage[2];

  if (os.platform() === 'win32' || load1 === 0) {
    const estLoad = ((parseFloat(cpuPercent) / 100) * cpus.length).toFixed(2);
    load1 = parseFloat(estLoad);
    load5 = parseFloat(estLoad);
    load15 = parseFloat(estLoad);
  }
  
  return {
    timestamp: new Date().toISOString(),
    cpu: {
      usage: cpuPercent,
      cores: cpus.length,
      model: cpus[0] ? cpus[0].model : 'CPU',
      speed: cpus[0] ? cpus[0].speed : 0
    },
    memory: {
      total: formatBytes(totalMemory),
      free: formatBytes(freeMemory),
      used: formatBytes(usedMemory),
      percentage: memoryPercent.toFixed(2)
    },
    uptime: {
      seconds: uptime,
      formatted: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`
    },
    loadAverage: {
      '1min': load1.toFixed(2),
      '5min': load5.toFixed(2),
      '15min': load15.toFixed(2)
    },
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version
  };
}

/**
 * Get application metrics
 */
function getAppMetrics() {
  const memoryUsage = process.memoryUsage();
  
  return {
    pid: process.pid,
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external),
      arrayBuffers: formatBytes(memoryUsage.arrayBuffers)
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  };
}

/**
 * Get disk usage (cross-platform with statfsSync)
 */
function getDiskUsage() {
  try {
    const targetPath = os.platform() === 'win32' ? 'C:\\' : '/';
    
    if (typeof fs.statfsSync === 'function') {
      const stat = fs.statfsSync(targetPath);
      const total = stat.bsize * stat.blocks;
      const free = stat.bsize * stat.bfree;
      const used = Math.max(0, total - free);
      const percentage = total > 0 ? ((used / total) * 100).toFixed(2) + '%' : 'N/A';
      return {
        total: formatBytes(total),
        free: formatBytes(free),
        used: formatBytes(used),
        percentage,
        timestamp: new Date().toISOString()
      };
    }
    
    // Unix fallback
    if (os.platform() !== 'win32') {
      const { execSync } = require('child_process');
      const output = execSync(`df -h ${targetPath}`).toString();
      const lines = output.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].split(/\s+/);
        return {
          total: parts[1],
          used: parts[2],
          free: parts[3],
          percentage: parts[4],
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return {
      total: 'N/A',
      free: 'N/A',
      used: 'N/A',
      percentage: 'N/A',
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    logger.error(`[Monitoring] Failed to get disk usage: ${e.message}`);
    return {
      total: 'N/A',
      free: 'N/A',
      used: 'N/A',
      percentage: 'N/A',
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get database metrics
 */
function getDatabaseMetrics() {
  try {
    const db = require('../config/database');
    const dbPath = path.join(__dirname, '../database/billing.db');
    let statsSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      statsSize = stats.size;
    } catch {}
    
    // Get table counts
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableCounts = {};
    
    for (const table of tables) {
      try {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
        tableCounts[table.name] = count.count;
      } catch (e) {
        tableCounts[table.name] = 'N/A';
      }
    }
    
    return {
      size: formatBytes(statsSize),
      path: dbPath,
      tables: tableCounts,
      totalTables: tables.length,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    logger.error(`[Monitoring] Failed to get database metrics: ${e.message}`);
    return {
      size: 'N/A',
      path: 'N/A',
      tables: {},
      totalTables: 0,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get all metrics
 */
function getAllMetrics() {
  const system = getSystemMetrics();
  const app = getAppMetrics();
  const disk = getDiskUsage();
  const database = getDatabaseMetrics();
  
  const allMetrics = {
    system,
    app,
    disk,
    database,
    timestamp: new Date().toISOString()
  };
  
  // Store in history
  storeMetricsHistory(allMetrics);
  
  return allMetrics;
}

/**
 * Store metrics in history
 */
function storeMetricsHistory(metrics) {
  const key = metrics.timestamp;
  metricsHistory.set(key, metrics);
  
  // Keep only the last MAX_HISTORY_SIZE entries
  if (metricsHistory.size > MAX_HISTORY_SIZE) {
    const oldestKey = metricsHistory.keys().next().value;
    metricsHistory.delete(oldestKey);
  }
}

/**
 * Get metrics history
 */
function getMetricsHistory(limit = 10) {
  if (metricsHistory.size < 2) {
    getAllMetrics(); // Guarantee at least 1 sample if history is thin
  }
  const history = Array.from(metricsHistory.values())
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);
  
  return history;
}

/**
 * Get health status
 */
function getHealthStatus() {
  const metrics = getAllMetrics();
  const issues = [];
  const warnings = [];
  
  // Check CPU usage
  const cpuUsage = parseFloat(metrics.system.cpu.usage);
  if (cpuUsage > 85) {
    issues.push(`Penggunaan CPU tinggi: ${cpuUsage}%`);
  } else if (cpuUsage > 65) {
    warnings.push(`Penggunaan CPU agak tinggi: ${cpuUsage}%`);
  }
  
  // Check memory usage
  const memoryUsage = parseFloat(metrics.system.memory.percentage);
  if (memoryUsage > 85) {
    issues.push(`Penggunaan RAM tinggi: ${memoryUsage}%`);
  } else if (memoryUsage > 70) {
    warnings.push(`Penggunaan RAM agak tinggi: ${memoryUsage}%`);
  }
  
  // Check load average
  const load1 = parseFloat(metrics.system.loadAverage['1min']);
  const cores = metrics.system.cpu.cores;
  if (load1 > cores * 2) {
    issues.push(`Beban sistem (Load Average) tinggi: ${load1} (${cores} cores)`);
  } else if (load1 > cores) {
    warnings.push(`Beban sistem (Load Average) agak tinggi: ${load1} (${cores} cores)`);
  }
  
  // Check disk usage
  const diskPercentage = metrics.disk.percentage;
  if (diskPercentage !== 'N/A') {
    const diskPercent = parseFloat(diskPercentage.replace('%', ''));
    if (diskPercent > 90) {
      issues.push(`Kapasitas Penyimpanan (Disk) Hampir Penuh: ${diskPercentage}`);
    } else if (diskPercent > 75) {
      warnings.push(`Kapasitas Penyimpanan (Disk) Terpakai: ${diskPercentage}`);
    }
  }
  
  // Determine overall health status
  let status = 'healthy';
  if (issues.length > 0) {
    status = 'critical';
  } else if (warnings.length > 0) {
    status = 'warning';
  }
  
  return {
    status,
    issues,
    warnings,
    metrics,
    timestamp: new Date().toISOString()
  };
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes) {
  if (typeof bytes !== 'number' || isNaN(bytes) || bytes <= 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get performance summary
 */
function getPerformanceSummary() {
  const history = getMetricsHistory(10);
  
  if (history.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      summary: 'No historical data available'
    };
  }
  
  // Calculate averages
  const avgCpu = history.reduce((sum, m) => sum + parseFloat(m.system.cpu.usage || 0), 0) / history.length;
  const avgMemory = history.reduce((sum, m) => sum + parseFloat(m.system.memory.percentage || 0), 0) / history.length;
  const avgLoad1 = history.reduce((sum, m) => sum + parseFloat(m.system.loadAverage['1min'] || 0), 0) / history.length;
  
  // Find max values
  const maxCpu = Math.max(...history.map(m => parseFloat(m.system.cpu.usage || 0)));
  const maxMemory = Math.max(...history.map(m => parseFloat(m.system.memory.percentage || 0)));
  const maxLoad1 = Math.max(...history.map(m => parseFloat(m.system.loadAverage['1min'] || 0)));
  
  return {
    timestamp: new Date().toISOString(),
    period: {
      start: history[history.length - 1].timestamp,
      end: history[0].timestamp,
      samples: history.length
    },
    averages: {
      cpu: avgCpu.toFixed(2),
      memory: avgMemory.toFixed(2),
      load1: avgLoad1.toFixed(2)
    },
    maximums: {
      cpu: maxCpu.toFixed(2),
      memory: maxMemory.toFixed(2),
      load1: maxLoad1.toFixed(2)
    }
  };
}

/**
 * Clear metrics history
 */
function clearMetricsHistory() {
  metricsHistory.clear();
  logger.info('[Monitoring] Metrics history cleared');
}

// Populate initial sample on module load
try {
  getAllMetrics();
} catch {}

module.exports = {
  getSystemMetrics,
  getAppMetrics,
  getDiskUsage,
  getDatabaseMetrics,
  getAllMetrics,
  getMetricsHistory,
  getHealthStatus,
  getPerformanceSummary,
  clearMetricsHistory
};
