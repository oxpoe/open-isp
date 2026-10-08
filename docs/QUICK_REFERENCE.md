# QUICK REFERENCE - Aplikasi Billing B481

## 🚀 Quick Start

### Running Aplikasi
```bash
# Development
npm run dev

# Production
npm start

# With PM2
pm2 start app-customer.js --name billing
```

### Access Portals
| Portal | URL | Default User |
|--------|-----|---|
| Admin | `http://localhost:3001/admin/login` | admin / admin123 |
| Customer | `http://localhost:3001/customer/login` | - |
| Tech | `http://localhost:3001/tech/login` | - |
| Agent | `http://localhost:3001/agent/login` | - |
| Collector | `http://localhost:3001/collector/login` | - |
| Health | `http://localhost:3001/health` | - |

---

## 📁 Key Files

```
app-customer.js              ← Entry point
config/database.js           ← Database setup
settings.json                ← Configuration
routes/customerPortal.js     ← Customer routes
routes/adminPortal.js        ← Admin routes
services/billingService.js   ← Billing logic
services/mikrotikService.js  ← MikroTik API
```

---

## 🔧 Common Tasks

### Change Port
Edit `settings.json`:
```json
{
  "server_port": 3002
}
```

### Change Company Name
Edit `settings.json`:
```json
{
  "company_header": "MY ISP NAME"
}
```

### Enable WhatsApp
1. Edit `settings.json`:
```json
{
  "whatsapp_enabled": true
}
```
2. Login → Admin → WhatsApp → Auth with QR code

### Setup MikroTik
Edit `settings.json`:
```json
{
  "mikrotik_host": "192.168.8.1",
  "mikrotik_user": "admin",
  "mikrotik_password": "password",
  "mikrotik_port": 8728
}
```

### Setup GenieACS
Edit `settings.json`:
```json
{
  "genieacs_url": "http://192.168.1.100:7557",
  "genieacs_username": "admin",
  "genieacs_password": "password"
}
```

### Setup Payment Gateway (Midtrans)
Edit `settings.json`:
```json
{
  "midtrans_enabled": true,
  "midtrans_server_key": "Mid-server-xxx",
  "midtrans_mode": "sandbox"
}
```

---

## 🔐 Security Settings (MUST DO)

⚠️ **Before Production:**

1. Change Session Secret:
```json
{
  "session_secret": "use-a-random-32-character-string-here"
}
```

2. Change Admin Password:
```json
{
  "admin_username": "admin",
  "admin_password": "use-a-strong-password"
}
```

3. Change Admin API Key:
```json
{
  "admin_api_key": "use-a-random-api-key"
}
```

4. Set NODE_ENV:
```bash
export NODE_ENV=production
```

---

## 📊 Important Endpoints

### Public
- `GET /health` - Health check
- `GET /` - Redirect to login
- `GET /isolated` - Isolated page (MikroTik redirect)
- `POST /api/webhook/v1/payment-notif` - Payment webhook

### Admin APIs
- `POST /api/settings/test-genieacs` - Test GenieACS
- `POST /api/settings/test-mikrotik` - Test MikroTik
- `POST /api/settings/test-tripay` - Test Tripay
- `GET /api/settings` - Get settings
- `POST /api/settings` - Update settings

### Billing
- `GET /admin/billing/invoices` - Invoice list
- `POST /admin/billing/generate` - Generate invoices
- `POST /admin/billing/unpay` - Cancel payment

---

## 🗄️ Database Commands

### Check Database
```bash
node scripts/verify-database.js
```

### Fix Database Issues
```bash
bash scripts/fix-database.sh
```

### Backup Database
```bash
# Manual via Admin Panel
# Or via API: POST /api/backup/create
```

---

## 🔄 Cron Jobs

| Time | Job | Purpose |
|------|-----|---------|
| 1 bulan, 00:01 | generateMonthlyInvoices() | Create monthly invoices |
| Setiap hari 02:00 | autoIsolatePlansExpired() | Isolate overdue customers |
| Setiap hari 09:00 | sendBillingReminders() | WhatsApp reminders |
| 00:00 & 06:00 | jamKalong() | Change PPPoE profiles |
| Setiap 10 menit | syncUsageTracking() | Sync PPPoE usage |
| Setiap jam | checkFUPQuota() | Check data quota |

---

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :3001
# Kill process
kill -9 <PID>
# Or change port in settings.json
```

### Database Locked
```bash
# Remove WAL files
rm database/billing.db-shm
rm database/billing.db-wal
# Restart application
```

### GenieACS Connection Failed
```bash
# Check settings
cat settings.json | grep genieacs_url
# Test connection
curl http://192.168.1.100:7557/api
```

### WhatsApp Not Connected
- Admin Panel → WhatsApp → Logout
- Admin Panel → WhatsApp → Auth (scan QR)
- Check `whatsapp_enabled` = true

### Payment Not Received
1. Check webhook configuration
2. Verify API key & secret
3. Check webhook logs: Admin → Payments → Webhook Logs
4. Manual entry if needed

---

## 📱 Useful Scripts

```bash
# Test MikroTik parser
node scripts/test-mikhmon-parser.js

# Check Mikhmon data
node scripts/check-mikhmon-data.js

# Test admin account
node scripts/test-admin.js

# Send test message
node scripts/test-message.js

# Find uplink info
node scripts/find_uplink.js
```

---

## 🌍 Multi-Language

### Current Languages
- 🇮🇩 Indonesian (id) - Default
- 🇬🇧 English (en) - Alternative

### Switch Language
```
GET /lang/en          ← Set English
GET /lang/id          ← Set Indonesian
GET /?lang=en         ← Query parameter
```

### Add New Language
1. Create `locales/[code].json`
2. Copy from `locales/id.json`
3. Translate all values
4. Test: `GET /?lang=[code]`

---

## 📊 Monitoring

### Check System Health
```bash
curl http://localhost:3001/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-19T10:30:00+07:00",
  "database": "connected",
  "services": {
    "genieacs": "connected|disconnected",
    "mikrotik": "connected|disconnected"
  }
}
```

---

## 🎯 Settings Priority

1. Environment variables (`.env`)
2. Settings file (`settings.json`)
3. Application defaults (in code)

**Example (Payment Gateway):**
```json
{
  "default_gateway": "tripay",
  "tripay_enabled": true,
  "tripay_api_key": "xxx",
  "tripay_private_key": "xxx",
  "tripay_merchant_code": "xxx",
  "tripay_mode": "sandbox"
}
```

---

## 🔗 Important Links

- GitHub: https://github.com/alijayanet/billing-rtrw
- Author: Ali Jaya Net
- Contact: 081947215703
- Email: alijayanet@gmail.com

---

## ✅ Pre-Launch Checklist

- [ ] Backup application & database
- [ ] Test all portals (customer, admin, tech, agent, collector)
- [ ] Verify MikroTik connection
- [ ] Verify GenieACS connection
- [ ] Test payment gateway
- [ ] Setup WhatsApp authentication
- [ ] Configure email/SMS gateway (if needed)
- [ ] Test backup & restore
- [ ] Setup monitoring & alerts
- [ ] Review settings.json security
- [ ] Test cron jobs (if applicable)
- [ ] Document all credentials securely

---

**Last Updated:** Juni 2026
**Version:** 1.0

