/**
 * Settings Validation Schema
 * Validate setiap field sebelum di-save ke settings.json
 */
const { logger } = require('./logger');

// Validation rules untuk setiap field
const VALIDATION_RULES = {
  // Server Configuration
  server_port: {
    type: 'number',
    min: 1024,
    max: 65535,
    required: true,
    description: 'Port server (1024-65535)'
  },
  server_host: {
    type: 'string',
    required: true,
    description: 'Host server'
  },
  session_secret: {
    type: 'string',
    minLength: 32,
    required: true,
    description: 'Session secret (min 32 karakter)'
  },

  // Company Information
  company_header: {
    type: 'string',
    maxLength: 100,
    required: true,
    description: 'Nama perusahaan'
  },
  public_base_url: {
    type: 'string',
    pattern: /^https?:\/\/.+/,
    description: 'URL publik aplikasi (http://... atau https://...)'
  },
  company_manager: {
    type: 'string',
    maxLength: 100,
    description: 'Nama manager'
  },
  company_phone: {
    type: 'string',
    pattern: /^[0-9\-\+\s]+$/,
    description: 'Nomor telepon perusahaan'
  },
  company_email: {
    type: 'string',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    description: 'Email perusahaan'
  },
  company_address: {
    type: 'string',
    maxLength: 500,
    description: 'Alamat perusahaan'
  },
  footer_info: {
    type: 'string',
    maxLength: 200,
    description: 'Footer info'
  },
  operational_hours: {
    type: 'string',
    maxLength: 200,
    description: 'Jam operasional'
  },

  // Admin Credentials
  admin_username: {
    type: 'string',
    minLength: 3,
    maxLength: 50,
    required: true,
    description: 'Username admin'
  },
  admin_password: {
    type: 'string',
    minLength: 6,
    required: true,
    description: 'Password admin (min 6 karakter)'
  },
  admin_api_key: {
    type: 'string',
    minLength: 10,
    description: 'API key admin'
  },

  // GenieACS Configuration
  genieacs_url: {
    type: 'string',
    pattern: /^https?:\/\/.+/,
    description: 'URL GenieACS (http://...)'
  },
  genieacs_username: {
    type: 'string',
    description: 'Username GenieACS'
  },
  genieacs_password: {
    type: 'string',
    description: 'Password GenieACS'
  },

  // MikroTik Configuration
  mikrotik_host: {
    type: 'string',
    pattern: /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9\-\.]+$/,
    description: 'Host MikroTik (IP atau hostname)'
  },
  mikrotik_user: {
    type: 'string',
    minLength: 1,
    description: 'Username MikroTik'
  },
  mikrotik_password: {
    type: 'string',
    minLength: 1,
    description: 'Password MikroTik'
  },
  mikrotik_port: {
    type: 'number',
    min: 1024,
    max: 65535,
    description: 'Port MikroTik'
  },
  isolir_day: {
    type: 'number',
    min: 1,
    max: 365,
    description: 'Hari isolir (1-365)'
  },

  // WhatsApp Configuration
  whatsapp_enabled: {
    type: 'boolean',
    description: 'Enable WhatsApp'
  },
  whatsapp_auth_folder: {
    type: 'string',
    description: 'Folder auth WhatsApp'
  },
  whatsapp_broadcast_delay: {
    type: 'number',
    min: 10,
    max: 5000,
    description: 'Delay broadcast WhatsApp (ms)'
  },

  // Telegram Configuration
  telegram_enabled: {
    type: 'boolean',
    description: 'Enable Telegram'
  },
  telegram_bot_token: {
    type: 'string',
    description: 'Telegram bot token'
  },
  telegram_admin_id: {
    type: 'string',
    pattern: /^\d+$/,
    description: 'Telegram admin ID (numeric)'
  },

  // Tripay Configuration
  office_lat: {
    type: 'string',
    pattern: /^-?\d+(\.\d+)?$|^$/,
    description: 'Latitude kantor'
  },
  office_lng: {
    type: 'string',
    pattern: /^-?\d+(\.\d+)?$|^$/,
    description: 'Longitude kantor'
  },

  // Other

  auto_backup_enabled: {
    type: 'boolean',
    description: 'Enable auto backup'
  },
  login_otp_enabled: {
    type: 'boolean',
    description: 'Enable OTP login'
  }
};

/**
 * Validate single value
 */
function validateValue(field, value, rule) {
  // Trim string values
  let trimmedValue = value;
  if (typeof value === 'string') {
    trimmedValue = value.trim();
  }

  // Check type
  if (rule.type === 'number') {
    if (typeof trimmedValue !== 'number') return `${field} harus berupa angka`;
    if (rule.min !== undefined && trimmedValue < rule.min) return `${field} minimal ${rule.min}`;
    if (rule.max !== undefined && trimmedValue > rule.max) return `${field} maksimal ${rule.max}`;
  }

  if (rule.type === 'string') {
    if (typeof trimmedValue !== 'string') return `${field} harus berupa string`;
    if (rule.minLength && trimmedValue.length < rule.minLength) return `${field} minimal ${rule.minLength} karakter`;
    if (rule.maxLength && trimmedValue.length > rule.maxLength) return `${field} maksimal ${rule.maxLength} karakter`;
    if (rule.pattern && !rule.pattern.test(trimmedValue)) return `${field} format tidak valid`;
    if (rule.enum && !rule.enum.includes(trimmedValue)) return `${field} harus salah satu dari: ${rule.enum.join(', ')}`;
  }

  if (rule.type === 'boolean') {
    if (typeof trimmedValue !== 'boolean') return `${field} harus berupa boolean`;
  }

  return null; // Valid
}

/**
 * Validate settings object
 */
function validateSettings(settings) {
  const errors = [];

  Object.keys(settings).forEach(field => {
    const value = settings[field];
    const rule = VALIDATION_RULES[field];

    // Skip jika tidak ada rule (field baru atau optional)
    if (!rule) return;

    // Check required
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} wajib diisi`);
      return;
    }

    // Skip validation jika value kosong dan tidak required
    if (!rule.required && (value === undefined || value === null || value === '')) {
      return;
    }

    // Validate value
    const error = validateValue(field, value, rule);
    if (error) errors.push(error);
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get validation rule untuk field
 */
function getFieldRule(field) {
  return VALIDATION_RULES[field] || null;
}

/**
 * Get all validation rules
 */
function getAllRules() {
  return VALIDATION_RULES;
}

module.exports = {
  validateValue,
  validateSettings,
  getFieldRule,
  getAllRules,
  VALIDATION_RULES
};
