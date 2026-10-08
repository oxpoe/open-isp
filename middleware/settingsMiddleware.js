/**
 * Settings Middleware
 * Untuk access control & validation pada settings endpoints
 */
const { logger } = require('../config/logger');
const { validateSettings } = require('../config/settingsValidator');
const { getMaskedSettings } = require('../config/settingsEncryption');

/**
 * Require Super Admin untuk akses settings
 */
function requireSuperAdmin(req, res, next) {
  if (req.session?.isAdmin && req.session?.isSuperAdmin) {
    return next();
  }

  logger.warn(`[settings] Unauthorized settings access attempt from ${req.ip}`);
  return res.status(403).json({
    error: 'Forbidden - Super Admin access required'
  });
}

/**
 * Validate settings sebelum save
 */
function validateSettingsMiddleware(req, res, next) {
  try {
    let settings = req.body;

    // Normalize boolean fields dari form submission
    const booleanFields = [
      'whatsapp_enabled',
      'telegram_enabled',
      'tripay_enabled',
      'midtrans_enabled',
      'xendit_enabled',
      'duitku_enabled',
      'auto_backup_enabled',
      'login_otp_enabled'
    ];

    booleanFields.forEach(field => {
      if (field in settings) {
        const value = settings[field];
        if (typeof value === 'string') {
          settings[field] = value === 'true' || value === '1' || value === 'on';
        } else if (value === undefined || value === null) {
          settings[field] = false;
        }
      }
    });

    // Trim string fields yang sensitive terhadap whitespace
    const stringTrimFields = ['office_lat', 'office_lng', 'company_phone', 'company_email'];
    stringTrimFields.forEach(field => {
      if (field in settings && typeof settings[field] === 'string') {
        settings[field] = settings[field].trim();
      }
    });

    // Validate
    const validation = validateSettings(settings);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Validation failed',
        errors: validation.errors
      });
    }

    // Attach validated settings ke request
    req.validatedSettings = settings;
    next();
  } catch (error) {
    logger.error(`[settings] Validation error: ${error.message}`);
    return res.status(500).json({
      error: 'Internal server error'
    });
  }
}

/**
 * Mask sensitive values dalam response
 */
function maskSensitiveValues(req, res, next) {
  // Override res.json untuk mask sensitive values
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (data && data.settings) {
      data.settings = getMaskedSettings(data.settings);
    }
    return originalJson(data);
  };

  next();
}

/**
 * Log settings access
 */
function logSettingsAccess(req, res, next) {
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    if (req.method === 'POST' || req.method === 'PUT') {
      logger.info(`[settings] Settings ${req.method} by ${req.session?.username || 'unknown'}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
    }
    return originalJson(data);
  };

  next();
}

/**
 * Rate limiting untuk settings endpoints
 */
function rateLimitSettings(req, res, next) {
  // Simple rate limiting: max 10 requests per minute per IP
  const key = `settings:${req.ip}`;
  const store = req.app.locals.rateLimitStore || new Map();

  if (!store.has(key)) {
    store.set(key, { count: 1, resetTime: Date.now() + 60000 });
    req.app.locals.rateLimitStore = store;
    return next();
  }

  const limit = store.get(key);
  if (Date.now() > limit.resetTime) {
    limit.count = 1;
    limit.resetTime = Date.now() + 60000;
    return next();
  }

  if (limit.count >= 10) {
    logger.warn(`[settings] Rate limit exceeded for ${req.ip}`);
    return res.status(429).json({
      error: 'Too many requests - please try again later'
    });
  }

  limit.count++;
  next();
}

module.exports = {
  requireSuperAdmin,
  validateSettingsMiddleware,
  maskSensitiveValues,
  logSettingsAccess,
  rateLimitSettings
};
