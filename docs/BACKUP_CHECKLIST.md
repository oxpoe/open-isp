# BACKUP & RESTORE CHECKLIST - Aplikasi Billing B481

## ✅ Pre-Audit Backup (CRITICAL)

Sebelum melakukan perubahan apapun pada aplikasi, lakukan backup lengkap:

### Step 1: Backup Database
```bash
cd /path/to/billing-rtrw

# Method 1: Using built-in backup
node -e "
const backupService = require('./services/backupService.js');
backupService.backupDatabase();
console.log('Backup selesai!');
"

# Method 2: Manual SQLite backup
sqlite3 database/billing.db ".backup 'database/backup-$(date +%Y-%m-%d).db'"

# Method 3: Copy file
cp database/billing.db database/backup-$(date +%Y-%m-%d-%H%M%S).db
```

### Step 2: Backup Settings
```bash
# Backup konfigurasi
cp settings.json settings.json.backup-$(date +%Y-%m-%d-%H%M%S)
cp .env .env.backup-$(date +%Y-%m-%d-%H%M%S) 2>/dev/null || true
```

### Step 3: Backup Aplikasi Source
```bash
# Tar entire application
cd /path/to
tar -czf billing-rtrw-backup-$(date +%Y-%m-%d-%H%M%S).tar.gz billing-rtrw/

# Or zip
zip -r billing-rtrw-backup-$(date +%Y-%m-%d-%H%M%S).zip billing-rtrw/
```

### Step 4: Backup Upload Files
```bash
# Backup QRIS images & payment proofs
tar -czf uploads-backup-$(date +%Y-%m-%d-%H%M%S).tar.gz public/uploads/
```

### Step 5: Verify Backups
```bash
# List backups
ls -lh database/backup-*.db
ls -lh *.tar.gz
ls -lh settings.json.backup-*

# Check backup integrity
sqlite3 database/backup-*.db "SELECT COUNT(*) FROM customers;"
```

---

## 📋 Backup Checklist

**Date:** _______________

- [ ] Database backup dibuat
  - Path: _______________
  - Size: _______________
  - Integrity: ✓ verified
  
- [ ] Settings backup dibuat
  - `settings.json` ✓
  - `.env` ✓
  
- [ ] Aplikasi source backup dibuat
  - Format: _____ (tar.gz / zip)
  - Size: _______________
  - Location: _______________
  
- [ ] Upload files backup dibuat
  - Location: _______________
  - Size: _______________
  
- [ ] Backups disimpan di lokasi aman
  - Local: _______________
  - USB Drive: ✓ / ✗
  - Cloud: _______________
  - Network Drive: _______________
  
- [ ] Backup list di-dokumentasikan
  - File: BACKUP_INVENTORY.md
  
- [ ] Restore test dilakukan
  - Database restored: ✓ / ✗
  - Settings verified: ✓ / ✗

---

## 🔄 Restore Procedures

### Restore Database Only
```bash
# Stop aplikasi
pm2 stop all
# atau
pkill -f "node app-customer.js"

# Restore dari backup
sqlite3 database/billing.db ".restore 'database/backup-2026-06-19.db'"

# Verify
sqlite3 database/billing.db "SELECT COUNT(*) FROM invoices;"

# Start aplikasi
npm start
# atau
pm2 start app-customer.js --name billing
```

### Restore Settings
```bash
# Restore settings.json
cp settings.json.backup-2026-06-19 settings.json

# Restore .env
cp .env.backup-2026-06-19 .env

# Restart aplikasi untuk apply settings
pm2 restart all
```

### Full Application Restore
```bash
# Backup current application
mv billing-rtrw billing-rtrw-broken-$(date +%s)

# Extract backup
tar -xzf billing-rtrw-backup-2026-06-19-120000.tar.gz

# Atau restore individual files
cd billing-rtrw
sqlite3 database/billing.db ".restore '../backup-2026-06-19.db'"

# Restart
npm start
```

### Restore Upload Files
```bash
# Extract backup
cd public
tar -xzf ../uploads-backup-2026-06-19.tar.gz

# Verify
ls -la uploads/qris/
ls -la uploads/payment_proofs/
```

---

## 🗂️ Backup Inventory

Buat file `BACKUP_INVENTORY.md` untuk tracking:

```markdown
# Backup Inventory - Aplikasi Billing B481

## Backup Schedule
- **Frequency:** Daily / Weekly / Manual
- **Retention:** 30 days
- **Storage Location:** /backup, /mnt/backup, S3, etc

## Backup History

| Date | Type | Filename | Size | Location | Status |
|------|------|----------|------|----------|--------|
| 2026-06-19 | Full | billing-rtrw-backup-2026-06-19.tar.gz | 150 MB | /backup | ✓ Verified |
| 2026-06-19 | DB | database/backup-2026-06-19.db | 5 MB | /backup/db | ✓ Verified |
| 2026-06-18 | Full | billing-rtrw-backup-2026-06-18.tar.gz | 150 MB | /backup | ✓ Verified |

## Last Restore Test
- **Date:** 2026-06-19 14:30
- **Result:** ✓ Successful
- **Database Records:** 12,345 customers
- **Notes:** All tables verified, data integrity OK
```

---

## 🔐 Secure Backup Storage

### Option 1: Local Storage (USB Drive)
```bash
# Weekly backup to USB
cp database/backup-*.db /mnt/usb/backups/
cp settings.json.backup-* /mnt/usb/backups/
```

### Option 2: Network Drive (NAS/SMB)
```bash
# Mount network share
sudo mount -t cifs //192.168.1.100/backups /mnt/network -o user=admin

# Copy backup
cp database/backup-*.db /mnt/network/
```

### Option 3: Cloud Storage
```bash
# Using rclone to sync to cloud (Google Drive, OneDrive, S3)
rclone sync database/backup-*.db gdrive:/billing-backups/

# Or AWS S3
aws s3 cp database/backup-*.db s3://my-billing-backups/
```

### Option 4: Encrypted Backup
```bash
# Create encrypted backup
gpg --symmetric --cipher-algo AES256 database/backup-2026-06-19.db

# Restore encrypted backup
gpg -d database/backup-2026-06-19.db.gpg > database/backup-2026-06-19.db
```

---

## ⚙️ Automated Backup (Cron Job)

### Setup Daily Backup (Linux/Mac)
```bash
# Edit crontab
crontab -e

# Add this line (backup setiap hari jam 2 pagi)
0 2 * * * cd /path/to/billing-rtrw && ./scripts/backup-daily.sh

# Add this line (cleanup backups older than 30 days)
0 3 * * 0 find /path/to/billing-rtrw/database/backup-* -mtime +30 -delete
```

### Create Backup Script (`scripts/backup-daily.sh`)
```bash
#!/bin/bash
set -e

BACKUP_DIR="/path/to/billing-rtrw/database"
DATE=$(date +%Y-%m-%d-%H%M%S)

echo "[$(date)] Starting backup..."

# Database backup
sqlite3 "$BACKUP_DIR/billing.db" ".backup '$BACKUP_DIR/backup-$DATE.db'"

# Settings backup
cp /path/to/billing-rtrw/settings.json /path/to/billing-rtrw/settings.json.backup-$DATE

# Cleanup old backups (older than 30 days)
find "$BACKUP_DIR/backup-*.db" -mtime +30 -delete

# Optional: Upload to cloud
# aws s3 cp "$BACKUP_DIR/backup-$DATE.db" s3://my-bucket/backups/

echo "[$(date)] Backup completed: backup-$DATE.db"
```

### Make Script Executable
```bash
chmod +x scripts/backup-daily.sh

# Test
./scripts/backup-daily.sh
```

---

## 🚨 Disaster Recovery Plan

### Scenario 1: Database Corrupted
```bash
# Stop aplikasi
pm2 stop billing-rtrw

# Restore dari backup terakhir
sqlite3 database/billing.db ".restore 'database/backup-latest.db'"

# Restart
pm2 start app-customer.js --name billing-rtrw

# Monitor logs
pm2 logs billing-rtrw
```

### Scenario 2: Aplikasi Crashed
```bash
# Check error
pm2 logs billing-rtrw --tail 100

# Restart
pm2 restart billing-rtrw

# If still crashing, restore backup
# ... follow procedure above
```

### Scenario 3: Akses Denied / Permission Error
```bash
# Check file ownership
ls -la database/
ls -la settings.json

# Fix permissions
sudo chown -R $USER:$USER /path/to/billing-rtrw
chmod -R u+w database/
chmod 600 settings.json .env
```

### Scenario 4: HDD Full / Disk Space Error
```bash
# Check disk usage
df -h
du -sh *

# Cleanup old backups
find database/backup-*.db -mtime +30 -delete

# Cleanup old uploads if needed
find public/uploads/ -mtime +90 -delete

# Vacuum database
sqlite3 database/billing.db "VACUUM;"
```

### Scenario 5: Settings Misconfiguration
```bash
# Restore settings dari backup
cp settings.json settings.json.broken
cp settings.json.backup-last-good settings.json

# Restart aplikasi
pm2 restart billing-rtrw

# Verify settings applied
curl http://localhost:3001/health
```

---

## 📊 Backup Size Monitoring

### Check Database Size
```bash
# SQLite database
ls -lh database/billing.db
sqlite3 database/billing.db "SELECT page_count * page_size / 1024 / 1024 AS size_mb FROM pragma_page_count(), pragma_page_size();"

# Backup directory
du -sh database/backup-*
du -sh public/uploads/
```

### Estimated Growth
- **Customers:** ~1 KB per record
- **Invoices:** ~0.5 KB per record
- **Payments:** ~0.3 KB per record
- **Traffic Samples:** ~0.1 KB per record (auto-cleaned)

**Example:**
- 10,000 customers = ~10 MB
- 120,000 invoices/year = ~60 MB
- 1,000+ agents = ~1 MB
- **Total:** ~80-150 MB (reasonable)

---

## ✨ Best Practices

### DO ✅
- ✓ Backup sebelum production deployment
- ✓ Test restore secara berkala (minimal monthly)
- ✓ Store backups di multiple locations
- ✓ Encrypt sensitive backups
- ✓ Document backup procedures
- ✓ Use versioning (date-based naming)
- ✓ Monitor backup integrity
- ✓ Keep detailed backup inventory

### DON'T ❌
- ✗ Delete backups tanpa verification
- ✗ Store backups hanya di local storage
- ✗ Skip restore testing
- ✗ Use generic filename (backup.db)
- ✗ Keep unencrypted backups exposed
- ✗ Ignore disk space warnings
- ✗ Backup ke lokasi yang sama dengan data
- ✗ Forget to document backup location

---

## 📞 Recovery Time Objective (RTO)

| Scenario | RTO | RPO |
|----------|-----|-----|
| Database recovery | 5-15 min | 24 hours (daily backup) |
| Full application restore | 30-60 min | 24 hours |
| Settings recovery | 1-5 min | Real-time (git backup) |
| Upload files recovery | 10-30 min | 7 days (weekly backup) |

**RTO:** Recovery Time Objective (berapa lama untuk recover)  
**RPO:** Recovery Point Objective (berapa lama data boleh hilang)

---

## 📝 Backup Verification Checklist

Setelah membuat backup, verifikasi dengan:

```bash
# Test 1: File exists & readable
[ -f database/backup-2026-06-19.db ] && echo "✓ File exists"
file database/backup-2026-06-19.db

# Test 2: SQLite integrity check
sqlite3 database/backup-2026-06-19.db "PRAGMA integrity_check;"

# Test 3: Row counts
sqlite3 database/backup-2026-06-19.db "SELECT COUNT(*) as customer_count FROM customers;"
sqlite3 database/backup-2026-06-19.db "SELECT COUNT(*) as invoice_count FROM invoices;"

# Test 4: Recent data present
sqlite3 database/backup-2026-06-19.db "SELECT MAX(created_at) FROM customers;"

# Test 5: Restore test (optional, on staging)
cp database/backup-2026-06-19.db /tmp/test-restore.db
sqlite3 /tmp/test-restore.db ".tables"
```

---

## 🔗 Related Documentation

- [AUDIT_LENGKAP.md](AUDIT_LENGKAP.md) - Full audit report
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) - Database structure
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Quick commands

---

**Document Version:** 1.0  
**Last Updated:** Juni 2026  
**Status:** ✓ Ready for Production

**⚠️ REMEMBER:** Backups are only useful if you can restore them. Test regularly!

