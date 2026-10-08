# AUDIT KEAMANAN & KUALITAS APLIKASI BILLING RTRWNET
**Status:** ✅ AUDIT LENGKAP  
**Tanggal Audit:** 14 Agustus 2026  
**Auditor:** Security & Code Quality Review  
**Aplikasi Status:** 🟠 PRODUCTION WITH CRITICAL ISSUES  

---

## 📋 RINGKASAN EKSEKUTIF

Aplikasi RTRWNET Billing System adalah sistem yang **comprehensive dan feature-rich** untuk manajemen ISP. Namun, audit menemukan **beberapa kerentanan keamanan KRITIS** yang harus segera diperbaiki sebelum production deployment atau jika sudah di production harus segera ditindaklanjuti.

### Skor Keamanan: 5.5/10 🔴
- ✅ Aspek Positif: Struktur kode baik, error handling solid, logging terimplementasi
- ⚠️ Aspek Kritis: Keamanan password, configuration management, input validation
- ❌ Aspek Negatif: Plaintext credentials, default passwords, weak hashing

---

## 🔐 KEAMANAN KRITIS - SEGERA PERBAIKI

### 1. PASSWORD DISIMPAN DALAM PLAINTEXT ❌ CRITICAL

**Lokasi:**
- [services/techService.js](services/techService.js#L4) - Password technician tersimpan plaintext di database
- [settings.json](settings.json#L20-L21) - Admin password `admin123` dalam plaintext

**Masalah:**
```javascript
// ❌ TIDAK AMAN - Line 4 di techService.js
const tech = db.prepare('SELECT * FROM technicians WHERE username = ? AND password = ? AND is_active = 1').get(username, password);
// Password dibandingkan langsung tanpa hashing

// ❌ TIDAK AMAN - settings.json
"admin_username": "admin",
"admin_password": "admin123",  // Password plaintext!
```

**Risiko:**
- Jika database bocor, semua password terekspos
- Jika settings.json terlihat, credentials admin langsung ketahuan
- Tidak compliance dengan standar keamanan (OWASP, ISO27001)
- Database breach = total kompromis sistem

**Rekomendasi - HARUS DILAKUKAN:**

1. **Implementasi bcrypt untuk hashing password:**
```javascript
// Install bcrypt terlebih dahulu
// npm install bcrypt

// Saat register/create user:
const bcrypt = require('bcrypt');
const hashedPassword = await bcrypt.hash(plainPassword, 10);
// Simpan hashedPassword ke database

// Saat authenticate:
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
if (isValid) {
  // Login berhasil
}
```

2. **Update database schema:**
```sql
-- Tambahkan kolom password_hash
ALTER TABLE technicians ADD COLUMN password_hash TEXT;
ALTER TABLE administrators ADD COLUMN password_hash TEXT;

-- Update existing passwords dengan hash
-- (Lakukan migration script terpisah)
```

3. **Jangan simpan password di settings.json:**
```json
// ❌ SEBELUM
{
  "admin_password": "admin123"
}

// ✅ SESUDAH - Gunakan database atau environment variable
{
  "admin_user_id": 1  // Reference ke database saja
}

// Atau gunakan .env file:
ADMIN_PASSWORD_HASH="$2b$10$..."
```

**Timeline:** IMMEDIATE - Sebelum production

---

### 2. DEFAULT CREDENTIALS (admin/admin123) ❌ CRITICAL

**Lokasi:** [settings.json](settings.json#L19-L21)

**Masalah:**
- Default username/password yang sangat lemah
- Siapapun yang tahu dokumentasi aplikasi bisa login
- OWASP Top 10: A01:2021 - Broken Access Control

**Rekomendasi:**
```bash
# Script untuk force password change saat first-time setup
node scripts/setup-admin-password.js

# Atau implementasikan setup wizard:
- Saat pertama kali aplikasi dijalankan
- Wajib setup admin username & password baru
- Simpan di database dengan hash bcrypt
- Tandai setup selesai di flag di database
```

**Timeline:** IMMEDIATE

---

### 3. API KEY & CREDENTIALS DALAM PLAINTEXT ❌ CRITICAL

**Lokasi:** [settings.json](settings.json)
```json
"genieacs_password": "admin",
"midtrans_server_key": "",
"xendit_api_key": "",
"tripay_private_key": "",
"digiflazz_api_key": "",
"radius_secret": "secret123"
```

**Masalah:**
- Semua credentials eksternal dalam plaintext di file JSON
- File bisa terlihat di source code management
- Risiko exposure jika server dikompromis
- Tidak praktis untuk berbagai environment (dev/staging/production)

**Rekomendasi - HARUS DILAKUKAN:**

1. **Gunakan environment variables (.env):**
```bash
# File: .env (JANGAN commit ke git!)
GENIEACS_URL=http://192.168.8.189:7557
GENIEACS_USERNAME=admin
GENIEACS_PASSWORD=SecurePassword123!
MIDTRANS_SERVER_KEY=Mid-xxxxx-xxx
XENDIT_API_KEY=xnd_development_xxxxx
TRIPAY_API_KEY=xxxxx
DIGIFLAZZ_API_KEY=xxxxx
RADIUS_SECRET=RadiusSecret123!
SESSION_SECRET=RandomSecure123!SecretHere
ADMIN_API_KEY=AdminApiKey123!Secure
```

2. **Implementasi di code:**
```javascript
// ✅ AMAN
const settings = {
  genieacs_password: process.env.GENIEACS_PASSWORD || getSetting('genieacs_password'),
  midtrans_server_key: process.env.MIDTRANS_SERVER_KEY,
  xendit_api_key: process.env.XENDIT_API_KEY,
  // ... dll
};
```

3. **Update .gitignore:**
```bash
# Jangan commit file ini!
.env
.env.local
.env.*.local
settings.json  # Alternatif: commit template saja
```

4. **Implementasi encryption untuk settings.json (jika diperlukan):**
```javascript
// Gunakan settingsEncryption.js yang sudah ada
const { encryptValue, decryptValue } = require('./config/settingsEncryption');

// Encrypt credentials:
const encrypted = encryptValue(credentialValue);

// Decrypt saat digunakan:
const plainValue = decryptValue(encryptedValue);
```

**Timeline:** IMMEDIATE

---

### 4. WEAK PASSWORD HASHING ⚠️ HIGH

**Lokasi Lainnya:**
- [config/database.js](config/database.js#L627) - SHA256 untuk password
- [services/agentService.js](services/agentService.js#L27) - MD5 hash
- [routes/adminPortal.js](routes/adminPortal.js#L98) - MD5 hash

**Masalah:**
```javascript
// ❌ TIDAK AMAN - SHA256 bukan untuk password hashing
const hash = crypto.createHash('sha256').update(input).digest('hex');

// ❌ TIDAK AMAN - MD5 sudah deprecated
const sign = crypto.createHash('md5').update(username + apiKey).digest('hex');
```

- SHA256/MD5 = algoritma hashing cepat (bisa di-brute force)
- Tidak ada salt random
- Tidak ada rate limiting pada hashing
- Bisa di-crack dengan GPU dalam hitungan jam

**Rekomendasi:**
```javascript
// ✅ AMAN - Gunakan bcrypt atau Argon2
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 10);  // 10 = cost factor
const isValid = await bcrypt.compare(plainPassword, hash);

// Atau Argon2 (lebih kuat):
const argon2 = require('argon2');
const hash = await argon2.hash(password);
const isValid = await argon2.verify(hash, password);
```

**Timeline:** HIGH - Dalam 1 minggu

---

## 🔒 KEAMANAN SEDANG - TINGKATKAN

### 5. SESSION MANAGEMENT ⚠️ MEDIUM

**Lokasi:** [app-customer.js](app-customer.js#L79-L90)

**Status Saat Ini:** ✅ Baik
```javascript
app.use(session({
  secret: getSetting('session_secret', 'default-secret'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: Boolean(cookieSecure),    // ✅ HTTPS only (jika production)
    httpOnly: true,                    // ✅ JavaScript tidak bisa akses
    sameSite: 'lax',                   // ✅ CSRF protection
    maxAge: 24 * 60 * 60 * 1000       // ✅ Timeout 24 jam
  },
  name: 'customer.sid'
}));
```

**Rekomendasi Improvement:**

1. **Gunakan session store eksternal:**
```javascript
// Jangan gunakan default memory store di production
const SessionStore = require('better-sqlite3-session-store')(session);
const store = new SessionStore({
  client: db,
  expired: {
    clear: true,
    intervalMs: 15 * 60 * 1000  // Clear expired sessions tiap 15 menit
  }
});

app.use(session({
  store: store,
  // ... config lainnya
}));
```

2. **Regenerate session ID saat login:**
```javascript
// Saat login berhasil
req.session.regenerate((err) => {
  if (err) return res.status(500).json({ error: 'Session error' });
  req.session.userId = user.id;
  req.session.userRole = user.role;
  // ... simpan data user lainnya
  res.redirect('/dashboard');
});
```

3. **Validasi session pada setiap request:**
```javascript
app.use((req, res, next) => {
  // Cek timeout session
  const lastActivity = req.session.lastActivity || Date.now();
  const inactivityTimeout = 30 * 60 * 1000; // 30 menit
  
  if (Date.now() - lastActivity > inactivityTimeout) {
    req.session.destroy();
    return res.status(401).json({ error: 'Session expired' });
  }
  
  req.session.lastActivity = Date.now();
  next();
});
```

**Timeline:** MEDIUM - 2 minggu

---

### 6. CSRF PROTECTION ⚠️ MEDIUM

**Status Saat Ini:** ⚠️ Terbatas
```javascript
// Hanya check Referer/Origin, tidak ada CSRF token explicit
if (origin) {
  const originHost = new URL(origin).host;
  if (originHost !== host) {
    return res.status(403).json({ error: 'Forbidden - Invalid Origin' });
  }
}
```

**Masalah:**
- Referer bisa di-spoof dalam beberapa kasus
- Browser lama atau proxy bisa hilangkan Referer header
- Tidak ada explicit CSRF token di form

**Rekomendasi:**

1. **Implementasi CSRF token library:**
```javascript
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: false });  // Gunakan session, bukan cookie

app.post('/admin/action', csrfProtection, (req, res) => {
  // CSRF token sudah tervalidasi otomatis
  // Proses request
});
```

2. **Di EJS templates:**
```ejs
<form method="POST" action="/admin/billing/generate">
  <input type="hidden" name="_csrf" value="<%= csrfToken %>">
  <button type="submit">Generate Invoice</button>
</form>
```

**Timeline:** MEDIUM - 2 minggu

---

### 7. INPUT VALIDATION & SANITIZATION ⚠️ MEDIUM

**Issue:**
Beberapa endpoint tidak melakukan validasi input yang ketat sebelum:
- Memasukkan ke database
- Menampilkan ke user (XSS risk)
- Digunakan dalam query

**Contoh lokasi yang perlu improvement:**
- [routes/adminPortal.js](routes/adminPortal.js) - Bulk operations
- [routes/customerPortal.js](routes/customerPortal.js) - Customer data update
- File upload handling

**Rekomendasi:**

1. **Gunakan input validation library:**
```bash
npm install joi express-validator
```

2. **Implementasi validation:**
```javascript
const { body, validationResult } = require('express-validator');

router.post('/admin/customers/add', [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('phone').trim().isMobilePhone('id-ID'),
  body('email').isEmail().normalizeEmail(),
  body('address').trim().isLength({ max: 255 }),
  body('package_id').isInt({ gt: 0 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  // Lanjutkan proses
});
```

3. **Sanitize output di EJS:**
```ejs
<!-- ❌ TIDAK AMAN - Bisa XSS -->
<%= customer.name %>

<!-- ✅ AMAN - Sanitized -->
<%- cleanHtml(customer.name) %>

<!-- atau gunakan escape by default di EJS config -->
```

**Timeline:** MEDIUM - 2 minggu

---

## ⚠️ KEAMANAN RENDAH - PERHATIAN

### 8. FILE UPLOAD SECURITY ⚠️ LOW

**Status Saat Ini:** ⚠️ Cukup
```javascript
// ✅ Ada validasi MIME type
const allowedTypes = /jpeg|jpg|png|gif|webp/;
const mimetype = allowedTypes.test(file.mimetype);

// ✅ Ada file size limit (5MB)
limits: { fileSize: 5 * 1024 * 1024 }
```

**Rekomendasi Improvement:**

1. **Validasi file lebih ketat:**
```javascript
const FileType = require('file-type');

// Validasi magic bytes (bukan hanya extension)
const fileType = await FileType.fromBuffer(file.buffer);
if (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType?.mime)) {
  throw new Error('Invalid file type');
}
```

2. **Scan file dengan antivirus:**
```javascript
const ClamScan = require('clamscan');
const clamscan = await new ClamScan().init({
  clamdscan: { host: 'localhost', port: 3310 }
});

const { isInfected } = await clamscan.scanFile(filePath);
if (isInfected) {
  fs.unlinkSync(filePath);
  throw new Error('Malicious file detected');
}
```

**Timeline:** LOW - Dalam 1 bulan

---

### 9. LOGGING & MONITORING ⚠️ LOW

**Status Saat Ini:** ✅ Baik
- Winston logger terimplementasi dengan baik
- Terpisah antara error.log, combined.log, exceptions.log
- Console output di development

**Rekomendasi:**

1. **Audit trail untuk sensitive operations:**
```javascript
const auditTrailSvc = require('./services/auditTrailService');

// Log setiap action sensitive
auditTrailSvc.logAction({
  user_id: req.session.adminId,
  action: 'invoice_generated',
  resource_type: 'invoice',
  resource_id: invoiceId,
  changes: { status: 'generated' },
  ip_address: req.ip,
  timestamp: new Date()
});
```

2. **Centralized log aggregation:**
```javascript
// Contoh: Kirim logs ke ELK Stack atau Datadog
const winston = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

logger.add(new WinstonCloudWatch({
  logGroupName: 'billing-rtrwnet',
  logStreamName: 'production',
  awsRegion: 'ap-southeast-1'
}));
```

**Timeline:** LOW - Dalam 1 bulan

---

## 🎯 KUALITAS KODE

### 10. ERROR HANDLING ✅ BAIK

**Status:** ✅ Baik
- Middleware error handler sudah terimplementasi
- Custom error classes (ValidationError, UnauthorizedError, etc)
- Proper HTTP status codes

**Minor Improvements:**
```javascript
// Pastikan semua error di-catch dan di-log
router.get('/api/data', async (req, res, next) => {
  try {
    const data = await fetchData();
    res.json(data);
  } catch (err) {
    logger.error(`API Error: ${err.message}`, { 
      stack: err.stack,
      endpoint: req.path,
      method: req.method,
      user_id: req.session?.userId 
    });
    next(err);  // Pass ke error handler middleware
  }
});
```

---

### 11. DATABASE QUERIES ✅ BAIK

**Status:** ✅ Baik
- Menggunakan parameterized queries (prepared statements)
- Tidak ada string concatenation pada SQL queries
- Foreign key constraints aktif

**Contoh aman:**
```javascript
// ✅ AMAN - Parameterized query
const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);

// ✅ AMAN - Multiple parameters
const result = db.prepare('SELECT * FROM customers WHERE router_id = ? AND status = ?').all(routerId, 'active');
```

**Minor Issue - Dynamic SQL:**
```javascript
// ⚠️ PERLU REVIEW - Jika search input tidak di-sanitize
const base = `SELECT * FROM customers WHERE ...${userInput}...`;

// ✅ SOLUSI - Gunakan parameterized dengan conditions array
const whereClauses = [];
const params = [];
if (search) {
  whereClauses.push('name LIKE ?');
  params.push(`%${search}%`);
}
```

---

### 12. ASYNC/AWAIT HANDLING ⚠️ MEDIUM

**Issue:**
Beberapa function masih menggunakan callback style yang bisa error-prone.

**Contoh yang perlu improvement:**
```javascript
// ❌ CALLBACK STYLE
fs.readFile(path, (err, data) => {
  if (err) handleError(err);
  // process data
});

// ✅ ASYNC/AWAIT STYLE
try {
  const data = await fs.promises.readFile(path);
  // process data
} catch (err) {
  handleError(err);
}
```

**Timeline:** LOW - Refactoring gradual

---

## 🗄️ DATABASE INTEGRITY

### 13. Database Schema ✅ SOLID

**Status:** ✅ Sudah baik
- Foreign key constraints aktif
- Proper data types
- Indexes pada frequently queried fields
- WAL mode untuk reliability

**Rekomendasi:**
```sql
-- Pastikan ada indexes pada frequently queried columns
CREATE INDEX IF NOT EXISTS idx_customers_router_id ON customers(router_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_pppoe_users_username ON pppoe_users(username);
```

---

### 14. Backup & Recovery ⚠️ MEDIUM

**Status Saat Ini:** ⚠️ Ada backup service tapi belum clear
- `backupService.js` sudah ada
- `auto_backup_enabled: false` di settings.json (disabled!)

**Rekomendasi:**

```javascript
// Enable automatic backup
const settings = {
  "auto_backup_enabled": true,
  "auto_backup_interval": "0 2 * * *",  // Jam 2 pagi setiap hari
  "auto_backup_retention_days": 30,
  "backup_encryption_enabled": true
};

// Implementasi di cronService.js
const backup = require('./services/backupService');
schedule.scheduleJob('0 2 * * *', async () => {
  try {
    const result = await backup.createBackup();
    logger.info(`Backup created: ${result.filename}`);
  } catch (err) {
    logger.error(`Backup failed: ${err.message}`);
  }
});
```

**Timeline:** MEDIUM - 2 minggu

---

## 📋 ACTION ITEMS & TIMELINE

### IMMEDIATE (Hari ini - 48 jam) 🔴
- [ ] Implementasi bcrypt untuk password hashing
- [ ] Hapus default credentials dari settings.json
- [ ] Setup .env file untuk credentials
- [ ] Update .gitignore untuk .env dan settings.json
- [ ] Create setup wizard untuk first-time admin password

### HIGH PRIORITY (Minggu 1) 🟠
- [ ] Migrate semua password di database dengan bcrypt
- [ ] Implementasi CSRF token protection
- [ ] Setup session store eksternal (SQLite session)
- [ ] Enable auto backup dalam cron jobs
- [ ] Update API key management

### MEDIUM PRIORITY (Minggu 2-3) 🟡
- [ ] Input validation dengan joi/express-validator
- [ ] Enhanced file upload scanning
- [ ] Session regeneration saat login
- [ ] Centralized logging setup
- [ ] Database query audit

### LOW PRIORITY (Bulan 1) 🟢
- [ ] Antivirus integration untuk file upload
- [ ] Log aggregation (ELK/Datadog)
- [ ] Async/await refactoring
- [ ] Performance optimization
- [ ] Documentation update

---

## 📊 SECURITY CHECKLIST - PRODUCTION DEPLOYMENT

Sebelum go live ke production, pastikan:

- [ ] **Authentication**
  - [ ] Password menggunakan bcrypt (cost ≥ 10)
  - [ ] Admin password bukan default
  - [ ] Session timeout implemented
  - [ ] Session regeneration saat login

- [ ] **Authorization**
  - [ ] Role-based access control diterapkan
  - [ ] API endpoints check permission
  - [ ] Admin endpoints protected

- [ ] **Data Protection**
  - [ ] Sensitive data encrypted at rest
  - [ ] HTTPS enforced (secure cookie flag)
  - [ ] CSRF protection aktif
  - [ ] XSS protection aktif

- [ ] **Configuration**
  - [ ] Semua credentials di .env
  - [ ] .env tidak di-commit
  - [ ] settings.json di-review untuk sensitive data
  - [ ] API keys di-rotate

- [ ] **Logging & Monitoring**
  - [ ] Audit trail untuk sensitive operations
  - [ ] Error logging configured
  - [ ] Monitoring alerts setup

- [ ] **Backup & Recovery**
  - [ ] Automated backup enabled
  - [ ] Backup encryption enabled
  - [ ] Recovery procedure tested
  - [ ] Backup storage off-site

- [ ] **Network**
  - [ ] Firewall configured
  - [ ] Only needed ports open
  - [ ] Rate limiting implemented
  - [ ] DDoS protection (jika applicable)

- [ ] **Testing**
  - [ ] Security testing completed
  - [ ] Penetration testing done (jika budget ada)
  - [ ] Load testing completed
  - [ ] Recovery testing done

---

## 📞 REKOMENDASI LANJUTAN

### 1. Security Code Review
Jadwalkan code review berkala (monthly) oleh developer berpengalaman untuk:
- Review pull requests sebelum merge
- Check untuk security vulnerabilities
- Update dependencies

### 2. Dependency Management
```bash
# Regular security audit
npm audit

# Update dependencies (carefully)
npm update

# Check for outdated packages
npm outdated
```

### 3. Environment Management
```bash
# Development
NODE_ENV=development npm start

# Staging
NODE_ENV=staging npm start

# Production
NODE_ENV=production npm start
```

### 4. Rate Limiting
```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 menit
  max: 5,                     // 5 attempts
  message: 'Terlalu banyak login attempts, coba lagi nanti'
});

router.post('/login', loginLimiter, authController.login);
```

### 5. Security Headers
```javascript
const helmet = require('helmet');
app.use(helmet());  // Adds various HTTP headers for security
```

---

## 📈 PERFORMANCE OPTIMIZATION

### Database Performance
```javascript
// Add connection pooling
const DatabasePool = require('pg-pool');

// Add query optimization
EXPLAIN ANALYZE SELECT ...;  // Check query plans
```

### Caching Strategy
```javascript
// Implement Redis caching untuk frequently accessed data
const redis = require('redis');
const client = redis.createClient();

// Cache customer data
const getCachedCustomer = async (id) => {
  const cached = await client.get(`customer:${id}`);
  if (cached) return JSON.parse(cached);
  
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  await client.setex(`customer:${id}`, 3600, JSON.stringify(customer));
  return customer;
};
```

### API Response Compression
```javascript
const compression = require('compression');
app.use(compression());  // Compress responses
```

---

## 🎓 DEVELOPER TRAINING

Recommended training topics untuk team:
1. OWASP Top 10 vulnerabilities
2. Secure coding practices
3. Dependency vulnerability scanning
4. Database security
5. API security
6. Authentication & Authorization best practices

---

## 📝 KESIMPULAN

Aplikasi RTRWNET Billing System memiliki **foundation yang kuat** dengan:
- ✅ Arsitektur yang well-structured
- ✅ Comprehensive feature set
- ✅ Good error handling & logging
- ✅ Proper database design

Namun ada **beberapa kerentanan keamanan KRITIS** yang harus diperbaiki:
- 🔴 Password plaintext storage
- 🔴 Default credentials
- 🔴 Unencrypted credentials in config

Dengan mengikuti rekomendasi di audit ini, aplikasi dapat mencapai **production-ready security level** dalam waktu 2-3 minggu.

---

**Status Audit: COMPLETE**  
**Recommendation: DO NOT DEPLOY TO PRODUCTION** sampai critical issues di-fix.  
**Next Review:** 30 hari setelah fixes di-implementasi
