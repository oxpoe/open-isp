# IMPLEMENTATION GUIDE - SECURITY FIXES
**Status:** READY TO IMPLEMENT  
**Tanggal:** 14 Agustus 2026  
**Target Completion:** 2-3 minggu

---

## 🚀 QUICK START - CRITICAL FIXES

### STEP 1: Install Required Packages
```bash
npm install bcrypt dotenv helmet express-rate-limit
npm install --save-dev @types/bcrypt

# Optional but recommended:
npm install express-validator joi
npm install better-sqlite3-session-store
```

### STEP 2: Create .env File
```bash
# Copy template
cp .env.example .env

# Edit .env dengan credentials actual
# Edit dengan text editor
nano .env
```

File `.env` template:
```env
# ======== SECURITY ========
NODE_ENV=development
SESSION_SECRET=GenerateRandomStringHere_$(openssl rand -hex 32)
ADMIN_PASSWORD_HASH=Will_Be_Set_By_Setup_Script

# ======== GENIEACS ========
GENIEACS_URL=http://192.168.8.189:7557
GENIEACS_USERNAME=admin
GENIEACS_PASSWORD=ChangeThisPassword

# ======== DATABASE ========
DATABASE_PATH=./database/billing.db

# ======== PAYMENT GATEWAYS ========
MIDTRANS_SERVER_KEY=Mid_server_xxxxx
MIDTRANS_MODE=sandbox

XENDIT_API_KEY=xnd_development_xxxxx

TRIPAY_API_KEY=xxxxx
TRIPAY_MERCHANT_CODE=xxxxx
TRIPAY_MODE=sandbox

DUITKU_API_KEY=xxxxx
DUITKU_MERCHANT_CODE=xxxxx

# ======== THIRD PARTY ========
DIGIFLAZZ_USERNAME=xxxxx
DIGIFLAZZ_API_KEY=xxxxx
DIGIFLAZZ_WEBHOOK_SECRET=xxxxx

# ======== WHATSAPP ========
WHATSAPP_ENABLED=true

# ======== TELEGRAM ========
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=xxxxx

# ======== RADIUS ========
RADIUS_SECRET=secret123
RADIUS_AUTH_PORT=1812
RADIUS_ACCT_PORT=1813

# ======== LOGGING ========
LOG_LEVEL=info
```

### STEP 3: Update .gitignore
```bash
# Add these lines to .gitignore
.env
.env.local
.env.*.local
settings.json  # Optional: jika ada credentials di sini
```

---

## 🔐 FIX #1: Password Hashing with Bcrypt

### Part A: Create Password Helper Module

**File:** `utils/passwordHelper.js`
```javascript
const bcrypt = require('bcrypt');
const SALT_ROUNDS = 10;

/**
 * Hash password dengan bcrypt
 * @param {string} plainPassword - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(plainPassword) {
  if (!plainPassword) throw new Error('Password cannot be empty');
  return await bcrypt.hash(plainPassword, SALT_ROUNDS);
}

/**
 * Verify password
 * @param {string} plainPassword - Plain text password to verify
 * @param {string} hashedPassword - Hashed password from database
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) return false;
  return await bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  hashPassword,
  verifyPassword
};
```

### Part B: Create Admin Setup Script

**File:** `scripts/setup-admin-password.js`
```javascript
#!/usr/bin/env node
const readline = require('readline');
const db = require('../config/database');
const { hashPassword } = require('../utils/passwordHelper');
const { logger } = require('../config/logger');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => {
  rl.question(prompt, resolve);
});

async function setupAdmin() {
  console.log('\n🔐 SETUP ADMIN PASSWORD\n');
  
  try {
    // Check if admin exists
    const admin = db.prepare('SELECT id FROM administrators LIMIT 1').get();
    
    if (!admin) {
      console.log('⚠️  No administrator found in database.');
      console.log('Please run database migration first.\n');
      rl.close();
      process.exit(1);
    }

    const username = await question('Admin Username [admin]: ');
    const password = await question('Admin Password (min 8 chars): ');
    const passwordConfirm = await question('Confirm Password: ');

    // Validation
    if (!username.trim() || !password) {
      console.log('❌ Username and password cannot be empty');
      rl.close();
      process.exit(1);
    }

    if (password !== passwordConfirm) {
      console.log('❌ Passwords do not match');
      rl.close();
      process.exit(1);
    }

    if (password.length < 8) {
      console.log('❌ Password must be at least 8 characters');
      rl.close();
      process.exit(1);
    }

    // Hash password
    console.log('\n🔐 Hashing password...');
    const hashedPassword = await hashPassword(password);

    // Update database
    const stmt = db.prepare('UPDATE administrators SET username = ?, password_hash = ? WHERE id = ?');
    stmt.run(username.trim(), hashedPassword, admin.id);

    console.log('✅ Admin password updated successfully!');
    console.log(`   Username: ${username.trim()}`);
    console.log('\nℹ️  Please keep your password secure and do NOT share with anyone.\n');

    rl.close();
    process.exit(0);
  } catch (err) {
    logger.error('Setup failed:', err);
    console.error('❌ Error:', err.message);
    rl.close();
    process.exit(1);
  }
}

setupAdmin();
```

### Part C: Update Technician Service

**File:** `services/techService.js`
```javascript
const db = require('../config/database');
const { hashPassword, verifyPassword } = require('../utils/passwordHelper');

async function authenticate(username, password) {
  const tech = db.prepare('SELECT * FROM technicians WHERE username = ? AND is_active = 1').get(username);
  
  if (!tech) return null;
  
  // Verify password using bcrypt
  const isValid = await verifyPassword(password, tech.password_hash);
  
  if (!isValid) return null;
  
  // Return user data tanpa password
  const { password_hash, ...techData } = tech;
  return techData;
}

async function createTechnician(data) {
  const hashedPassword = await hashPassword(data.password);
  const stmt = db.prepare(
    'INSERT INTO technicians (username, password_hash, name, phone, area) VALUES (?, ?, ?, ?, ?)'
  );
  return stmt.run(data.username, hashedPassword, data.name, data.phone || '', data.area || '');
}

async function updatePassword(techId, newPassword) {
  const hashedPassword = await hashPassword(newPassword);
  return db.prepare('UPDATE technicians SET password_hash = ? WHERE id = ?').run(hashedPassword, techId);
}

module.exports = {
  authenticate,
  createTechnician,
  updatePassword,
  // ... export fungsi lain yang ada
};
```

### Part D: Update Customer Portal Login

**File:** `routes/customerPortal.js` (di bagian POST /login)

```javascript
// Find in the file and replace the login logic:

// ❌ OLD CODE
const cust = db.prepare('SELECT * FROM customers WHERE ...')
  .get(loginId, password);

// ✅ NEW CODE
const cust = db.prepare('SELECT * FROM customers WHERE login_id = ?')
  .get(loginId);

if (cust) {
  const { verifyPassword } = require('../utils/passwordHelper');
  const isValid = await verifyPassword(password, cust.password_hash);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Regenerate session ID untuk security
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Session error' });
    req.session.customerId = cust.id;
    res.json({ success: true });
  });
}
```

### Part E: Database Migration

**File:** `scripts/migrate-password-hashing.js`
```javascript
#!/usr/bin/env node
const db = require('../config/database');
const { hashPassword } = require('../utils/passwordHelper');
const { logger } = require('../config/logger');

async function migrate() {
  console.log('🔄 Starting password hashing migration...\n');

  try {
    // Migrate technicians
    console.log('📋 Migrating technicians...');
    const techs = db.prepare('SELECT id, password FROM technicians WHERE password_hash IS NULL').all();
    
    for (const tech of techs) {
      if (tech.password) {
        const hashedPassword = await hashPassword(tech.password);
        db.prepare('UPDATE technicians SET password_hash = ? WHERE id = ?').run(hashedPassword, tech.id);
        console.log(`  ✅ Tech ${tech.id}`);
      }
    }

    // Migrate customers (if applicable)
    console.log('\n📋 Migrating customers...');
    const custs = db.prepare('SELECT id, password FROM customers WHERE password_hash IS NULL AND password IS NOT NULL').all();
    
    for (const cust of custs) {
      if (cust.password) {
        const hashedPassword = await hashPassword(cust.password);
        db.prepare('UPDATE customers SET password_hash = ? WHERE id = ?').run(hashedPassword, cust.id);
        console.log(`  ✅ Customer ${cust.id}`);
      }
    }

    // Migrate administrators
    console.log('\n📋 Migrating administrators...');
    const admins = db.prepare('SELECT id, password FROM administrators WHERE password_hash IS NULL').all();
    
    for (const admin of admins) {
      if (admin.password) {
        const hashedPassword = await hashPassword(admin.password);
        db.prepare('UPDATE administrators SET password_hash = ? WHERE id = ?').run(hashedPassword, admin.id);
        console.log(`  ✅ Admin ${admin.id}`);
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n⚠️  IMPORTANT:');
    console.log('   1. Delete plain password columns: ALTER TABLE technicians DROP COLUMN password;');
    console.log('   2. Ensure all code uses password_hash column');
    console.log('   3. Update settings.json to not store admin password\n');

    logger.info('Password hashing migration completed');
    process.exit(0);
  } catch (err) {
    logger.error('Migration failed:', err);
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

migrate();
```

### Part F: Update Database Schema

```sql
-- Add password_hash column to tables (if not exists)
ALTER TABLE technicians ADD COLUMN password_hash TEXT;
ALTER TABLE administrators ADD COLUMN password_hash TEXT;
ALTER TABLE customers ADD COLUMN password_hash TEXT;

-- After migration, drop old password columns:
-- ALTER TABLE technicians DROP COLUMN password;
-- ALTER TABLE administrators DROP COLUMN password;
-- ALTER TABLE customers DROP COLUMN password;
```

---

## 🗝️ FIX #2: Environment Variables & Config Management

### Part A: Create .env.example

**File:** `.env.example`
```env
# Copy this file to .env and fill in actual values
# DO NOT commit .env to git!

# ======== APPLICATION ========
NODE_ENV=development
SERVER_PORT=3001
SERVER_HOST=localhost

# ======== SECURITY ========
SESSION_SECRET=change-me-to-random-string-minimum-32-chars
COOKIE_SECURE=false  # Set to true in production with HTTPS

# ======== ADMIN SETUP ========
# Set these during first-time setup, will be migrated to database
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-to-strong-password-min-8-chars

# ======== GENIEACS ========
GENIEACS_URL=http://192.168.8.189:7557
GENIEACS_USERNAME=admin
GENIEACS_PASSWORD=change-me

# ======== PAYMENT GATEWAYS ========
MIDTRANS_ENABLED=true
MIDTRANS_SERVER_KEY=Mid_server_xxxxx
MIDTRANS_MODE=sandbox

XENDIT_ENABLED=true
XENDIT_API_KEY=xnd_development_xxxxx

TRIPAY_ENABLED=false
TRIPAY_API_KEY=xxxxx
TRIPAY_PRIVATE_KEY=xxxxx
TRIPAY_MERCHANT_CODE=xxxxx
TRIPAY_MODE=sandbox

DUITKU_ENABLED=true
DUITKU_API_KEY=xxxxx
DUITKU_MERCHANT_CODE=xxxxx
DUITKU_MODE=sandbox

# ======== DIGIFLAZZ ========
DIGIFLAZZ_USERNAME=
DIGIFLAZZ_API_KEY=
DIGIFLAZZ_WEBHOOK_SECRET=

# ======== WHATSAPP ========
WHATSAPP_ENABLED=true
WHATSAPP_AUTH_FOLDER=auth_info_baileys

# ======== TELEGRAM ========
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=

# ======== RADIUS ========
RADIUS_ENABLED=0
RADIUS_SECRET=secret123

# ======== LOGGING ========
LOG_LEVEL=info

# ======== DATABASE ========
DATABASE_PATH=./database/billing.db

# ======== TIMEZONE ========
TIMEZONE=Asia/Jakarta
```

### Part B: Update config/settingsManager.js

```javascript
// Add at the top of settingsManager.js:
require('dotenv').config();

// Modify getSetting function to check .env first:
function getSetting(key, defaultValue = null) {
  // 1. Check environment variable first (highest priority)
  const envKey = key.toUpperCase().replace(/([A-Z])/g, '_$1');
  if (process.env[envKey] !== undefined) {
    return process.env[envKey];
  }

  // 2. Check settings.json
  const settings = getSettings();
  if (settings[key] !== undefined) {
    return settings[key];
  }

  // 3. Return default value
  return defaultValue;
}
```

### Part C: Update .gitignore

```bash
# Add to .gitignore:
.env
.env.local
.env.*.local
.env.development.local
.env.staging.local
.env.production.local

# Optional: exclude settings.json if it contains credentials
# settings.json
# Instead: settings.json.example (commit this template)
```

---

## 🛡️ FIX #3: Enhanced CSRF Protection

### Part A: Install CSURF

```bash
npm install csurf
```

### Part B: Add CSRF to app-customer.js

```javascript
const csrf = require('csurf');

// Create CSRF protection middleware
const csrfProtection = csrf({ 
  cookie: false  // Use session instead of cookie
});

// Apply to POST/PUT/DELETE routes
app.post('/admin/:path*', csrfProtection, adminRoutes);
app.post('/customer/:path*', csrfProtection, customerRoutes);
```

### Part C: Add CSRF Token to Forms

```ejs
<!-- In EJS templates, add hidden CSRF token field: -->
<form method="POST" action="/admin/billing/generate">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <!-- Other form fields -->
  <button type="submit">Generate Invoice</button>
</form>

<!-- For AJAX requests, include in headers: -->
<script>
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  
  fetch('/api/action', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: JSON.stringify(data)
  });
</script>
```

---

## 🚨 FIX #4: Rate Limiting

### Part A: Install & Setup

```bash
npm install express-rate-limit
```

### Part B: Create Rate Limiter Middleware

**File:** `middleware/rateLimiter.js`
```javascript
const rateLimit = require('express-rate-limit');

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,                     // Limit each IP to 5 requests per windowMs
  message: 'Terlalu banyak percobaan login, coba lagi dalam beberapa menit',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,   // 1 minute
  max: 100,                  // 100 requests per minute
  message: 'Terlalu banyak request ke API, coba lagi nanti'
});

const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 1000,  // Higher limit for webhooks
  skip: (req) => {
    // Skip rate limiting if webhook signature is valid
    return req.session?.webhookVerified;
  }
});

module.exports = {
  loginRateLimiter,
  apiRateLimiter,
  webhookRateLimiter
};
```

### Part C: Apply Rate Limiters

```javascript
// In routes
const { loginRateLimiter, apiRateLimiter } = require('../middleware/rateLimiter');

// Apply to login endpoints
router.post('/login', loginRateLimiter, loginController);
router.post('/customer/login', loginRateLimiter, customerLoginController);

// Apply to API endpoints
router.get('/api/data', apiRateLimiter, apiController);
```

---

## 🔒 FIX #5: Session Management Improvements

### Part A: Setup Session Store

```bash
npm install better-sqlite3-session-store
```

### Part B: Update app-customer.js

```javascript
const SessionStore = require('better-sqlite3-session-store')(session);

const store = new SessionStore({
  client: db,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000  // Clear expired sessions every 15 minutes
  }
});

app.use(session({
  store: store,  // Use database store instead of memory
  secret: process.env.SESSION_SECRET || getSetting('session_secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.COOKIE_SECURE === 'true',
    httpOnly: true,
    sameSite: 'strict',  // More restrictive
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  },
  name: 'customer.sid'
}));
```

### Part C: Session Regeneration on Login

```javascript
// After successful login:
req.session.regenerate((err) => {
  if (err) {
    return res.status(500).json({ error: 'Session error' });
  }
  req.session.userId = user.id;
  req.session.userRole = user.role;
  req.session.loginTime = Date.now();
  
  // Set inactivity timeout
  req.session.inactivityTimeout = 30 * 60 * 1000;  // 30 minutes
  
  res.json({ success: true, redirect: '/dashboard' });
});
```

---

## ✅ VERIFICATION CHECKLIST

After implementing all fixes, verify:

- [ ] bcrypt password hashing implemented
- [ ] Old plain passwords migrated to hashed
- [ ] .env file created and populated
- [ ] .env added to .gitignore
- [ ] Settings.json reviewed for sensitive data
- [ ] CSRF protection implemented
- [ ] Rate limiting configured
- [ ] Session store using database
- [ ] Session regeneration on login working
- [ ] All tests passing
- [ ] Application running without errors

---

## 🧪 TESTING FIXES

### Test Password Hashing

```bash
node -e "
const { hashPassword, verifyPassword } = require('./utils/passwordHelper');
(async () => {
  const hash = await hashPassword('test123456');
  const valid = await verifyPassword('test123456', hash);
  console.log('Hash:', hash);
  console.log('Valid:', valid);
})();
"
```

### Test Environment Variables

```bash
node -e "
require('dotenv').config();
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ Set' : '❌ Not set');
console.log('GENIEACS_PASSWORD:', process.env.GENIEACS_PASSWORD ? '✅ Set' : '❌ Not set');
"
```

### Test Login Flow

```bash
# Start application
npm start

# Open browser and test login with new credentials
# Check console logs for any errors
# Verify session is created in database
```

---

## 📞 TROUBLESHOOTING

### Issue: "bcrypt is not defined"
```bash
Solution: npm install bcrypt
```

### Issue: ".env file not loading"
```bash
Solution: Ensure dotenv is imported at the top of app-customer.js:
require('dotenv').config();
```

### Issue: "CSRF token mismatch"
```bash
Solution: Ensure csrfToken is included in all forms and AJAX requests
```

### Issue: "Session not persisting"
```bash
Solution: Verify database schema has session table:
sqlite3 database/billing.db ".schema sessions"
```

---

## 📝 NEXT STEPS

1. **Immediate (Today):**
   - Review this guide with team
   - Create .env file
   - Test bcrypt locally

2. **This Week:**
   - Implement bcrypt in all auth modules
   - Run password migration script
   - Deploy to staging for testing

3. **Next Week:**
   - Implement CSRF protection
   - Add rate limiting
   - Full security testing

4. **Following Week:**
   - Monitor production (if live)
   - Collect logs and monitoring data
   - Review and optimize

---

**Questions?** Review AUDIT_SECURITY_2026.md for detailed security analysis.
