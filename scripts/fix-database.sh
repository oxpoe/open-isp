#!/bin/bash

# Script untuk memperbaiki struktur database di server produksi
# Menambahkan kolom yang hilang di tabel customers

echo "=========================================="
echo "Fix Database Columns - Billing RTRW"
echo "=========================================="
echo ""

# Cek apakah database ada
DB_PATH="database/billing.db"
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Error: Database tidak ditemukan di $DB_PATH"
    echo "   Pastikan Anda menjalankan script ini dari root folder aplikasi"
    exit 1
fi

echo "✓ Database ditemukan: $DB_PATH"
echo ""

# Backup database
BACKUP_PATH="database/billing.db.backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Membuat backup database..."
cp "$DB_PATH" "$BACKUP_PATH"
if [ $? -eq 0 ]; then
    echo "✓ Backup berhasil: $BACKUP_PATH"
else
    echo "❌ Gagal membuat backup!"
    exit 1
fi
echo ""

# Jalankan script verifikasi
echo "🔍 Memeriksa struktur database..."
echo ""
node scripts/verify-database.js

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✓ Selesai!"
    echo "=========================================="
    echo ""
    echo "Langkah selanjutnya:"
    echo "1. Restart aplikasi: pm2 restart all"
    echo "2. Test login pelanggan"
    echo "3. Cek log untuk memastikan tidak ada error"
    echo ""
    echo "Jika ada masalah, restore backup:"
    echo "cp $BACKUP_PATH $DB_PATH"
    echo ""
else
    echo ""
    echo "❌ Terjadi error saat memperbaiki database"
    echo "   Database tidak diubah, backup tersimpan di:"
    echo "   $BACKUP_PATH"
    exit 1
fi
