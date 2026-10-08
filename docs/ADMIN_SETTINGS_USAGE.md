# Admin Settings - Multi-Router Configuration

**Status**: ✅ SELESAI - Siap Digunakan

Saat edit pengaturan di `/admin/settings`, Anda **BISA langsung menyimpan tanpa NULL** lagi. Sistem sudah handle semuanya.

---

## Akses Settings

1. Login ke admin portal → menu **⚙️ Pengaturan**
2. Atau langsung akses: `http://localhost:3001/admin/settings`

---

## Section: Pengaturan MikroTik

Scroll ke bawah, cari bagian **"MULTI-ROUTER & MIKROTIK"**

### Field 1: Mode Multi-Router

```
☑ Mode Multi-Router: [Dropdown]
  - Aktif (Multiple Router)
  - Nonaktif (Single Router Mode)
```

**Apa artinya?**

| Mode | Artinya | Untuk Apa |
|------|---------|----------|
| **Aktif** | Pelanggan HARUS memilih router saat dibuat | Multi-ISP / Multi-lokasi dengan routers berbeda |
| **Nonaktif** | Pelanggan tanpa router_id otomatis pakai default | Setup sederhana, satu router utama |

**Default**: Aktif

### Field 2: Default Router ID (Opsional)

```
□ Default Router ID: [Input Number]
  Placeholder: "Kosongkan untuk auto-detect"
  Hint: "Opsional - jika kosong, sistem auto-detect router pertama yang aktif"
```

**Kapan perlu diisi?**
- **Jika mode = Nonaktif** dan punya multiple routers di database
  - Isi dengan ID router utama (misal: 1)
  - Pelanggan lama (router_id = NULL) akan pakai router ini

- **Jika mode = Aktif**
  - TIDAK perlu diisi (tidak akan dipakai)

- **Jika hanya punya satu router**
  - Kosongkan saja, sistem auto-detect

---

## Contoh Konfigurasi

### Setup 1: Single Router (Simple)

```
Mode Multi-Router: Nonaktif
Default Router ID: [kosongkan]
```

**Apa yang terjadi:**
- Aplikasi pakai router pertama dari database / settings.json
- Pelanggan lama (NULL router) otomatis menggunakan router itu
- Semua isolir/activate berjalan normal ✅

### Setup 2: Multi Router (Main + Backup)

```
Mode Multi-Router: Nonaktif
Default Router ID: 1
```

**Database routers:**
```
ID | name         | is_active
---|--------------|----------
1  | Main Router  | 1
2  | Backup       | 0  (disabled)
```

**Apa yang terjadi:**
- Pelanggan baru dibuat: harus pilih router (1 atau 2)
- Pelanggan lama (NULL router): auto-assign ke router 1
- Isolir/activate pakai router masing-masing ✅

### Setup 3: Full Multi-Router Mode

```
Mode Multi-Router: Aktif
Default Router ID: [kosongkan]
```

**Apa yang terjadi:**
- Pelanggan WAJIB pilih router saat dibuat
- Tidak ada auto-assign (semua harus eksplisit)
- Lebih aman untuk lingkungan kompleks

---

## Alur Kerja: Saat Anda Simpan Setting

### Langkah 1: Form Submission
Anda klik **"Simpan Pengaturan"** di `/admin/settings`

### Langkah 2: Backend Processing
```javascript
POST /admin/settings
  ├─ Parse form data (multi_router_mode, default_router_id)
  ├─ Validasi format (mode = string, router_id = number)
  └─ Cek apakah ada mode switch (disabled → active)
```

### Langkah 3: Auto-Assignment (Jika Mode Berubah)
```
Jika dulu: "Aktif" → Sekarang: "Nonaktif"
  ├─ Cari pelanggan dengan router_id = NULL
  │  AND (pppoe_username != '' OR hotspot_username != '' OR static_ip != '')
  ├─ Assign router_id = default_router_id (atau auto-detect first router)
  └─ Log: "[Settings] Auto-assigned router X to Y customers"
```

### Langkah 4: Save to settings.json
```json
{
  "multi_router_mode": "nonaktif",
  "default_router_id": "1",
  ...
}
```

### Langkah 5: Update In-Memory Cache
Aplikasi langsung reload setting tanpa restart

### Langkah 6: Redirect
Browser redirect ke `/admin/settings` → tampil pesan **"✅ Pengaturan berhasil disimpan"**

---

## Testing: Verifikasi Konfigurasi Bekerja

### Test 1: Mode Switch Active → Disabled

**Persiapan:**
1. Buat pelanggan dengan router_id = NULL (manual edit database atau via old export)
2. Set mode = "Aktif", default_router_id kosong

**Eksekusi:**
1. Ke `/admin/settings`
2. Set mode = "Nonaktif", default_router_id = 1
3. Klik "Simpan Pengaturan"

**Verifikasi:**
```bash
# Cek logs
tail -f logs/combined.log | grep "Auto-assigned"

# Cek database
sqlite3 database/billing.db "SELECT id, name, router_id FROM customers WHERE router_id = 1 LIMIT 5;"
```

✅ Harus ada: `"Auto-assigned router 1 to X customers"`

### Test 2: Isolir dengan Custom Default Router

**Persiapan:**
1. Set mode = "Nonaktif", default_router_id = 2
2. Buat pelanggan baru dengan router_id = NULL (atau pakai pelanggan lama)

**Eksekusi:**
1. Admin isolir pelanggan itu
2. Cek MikroTik router 2

**Verifikasi:**
```bash
# Cek logs
tail -f logs/combined.log | grep -i "isolir\|suspend"

# Harus ada: "Using default router from database: Router2"
```

✅ Profile di router 2 berubah ke "isolir"

### Test 3: Settings Reload Tanpa Restart

**Persiapan:**
1. App sedang berjalan (pm2)
2. Edit `/admin/settings` dan ubah mode

**Verifikasi:**
```bash
# Check if app still running
pm2 status

# NEW: Tidak perlu restart! Setting langsung aktif di memory
# (Hanya perlu restart jika ada bug atau edit langsung settings.json)
```

✅ Aplikasi tetap berjalan, tidak crash

---

## Troubleshooting

### Problem: Ubah setting tapi isolir masih error

**Solusi:**
1. Cek logs: `tail logs/error.log`
2. Pastikan router_id di database benar-benar ada
3. Test koneksi ke MikroTik: `node -e "const m = require('./services/mikrotikService'); m.checkConnection(1).then(ok => console.log('OK:', ok));"`

### Problem: Mode Aktif → Nonaktif tapi NULL router tidak ter-assign

**Solusi:**
1. Cek database, apakah ada routers yang is_active = 1
   ```bash
   SELECT * FROM routers WHERE is_active = 1;
   ```
2. Cek logs saat simpan: `grep -i "Auto-assigned" logs/combined.log`
3. Verifikasi default_router_id benar-benar tersimpan:
   ```bash
   node -e "const {getSetting} = require('./config/settingsManager'); console.log(getSetting('default_router_id'));"
   ```

### Problem: Setting berubah tapi pelanggan isolir di router lama

**Solusi:**
1. Ini normal! Setting hanya berlaku untuk operasi **baru** setelah perubahan
2. Pelanggan yang sudah isolir di router lama tetap pakai router lama (itu yang disimpan di database)
3. Untuk reset, dapat pakai "Aktivasi" dulu, lalu isolir lagi

---

## Fitur Bonus: Real-Time Settings Update

Anda **TIDAK perlu restart app** setelah ubah settings.

**Mengapa?**
- `settingsManager.js` cache setting setiap kali dibaca
- Saat form disubmit, `saveSettings()` langsung update cache
- Operasi berikutnya akan pakai setting baru

**Exception:** Jika langsung edit `settings.json` di file (tidak via UI), perlu restart app.

---

## Quick Reference: Setting Values

| Setting Key | Type | Default | Valid Values |
|---|---|---|---|
| `multi_router_mode` | String | "active" | "active", "disabled" |
| `default_router_id` | Number | null | > 0 atau null (untuk auto-detect) |

---

## Workflow Rekomendasi

### Fase 1: Setup Single Router
```
1. settings.json: sudah ada MikroTik credentials
2. /admin/settings: mode = "Nonaktif", default_router_id kosong
3. Test isolir via admin
4. Test isolir via WhatsApp bot
```

### Fase 2: Tambah Multi-Router (Nanti)
```
1. /admin/routers: tambah router 2, 3, dst
2. /admin/settings: mode = "Aktif" atau "Nonaktif" + default_router_id = 1
3. Pelanggan lama auto-assign (jika switch ke Nonaktif)
4. Pelanggan baru HARUS pilih router saat dibuat
```

---

## Kesimpulan

✅ **Saat edit pengaturan di web admin (`/admin/settings`), sekarang sudah TIDAK NULL lagi:**

- **Mode Multi-Router**: Pilih "Aktif" atau "Nonaktif"
- **Default Router ID**: Opsional, biarkan kosong untuk auto-detect
- **Simpan**: Langsung tersimpan, tidak perlu restart
- **Auto-Assignment**: Jika mode berubah, pelanggan NULL auto-assign ke router yang sesuai

**Mulai sekarang, setup semua lewat UI web admin - sudah production-ready!** 🎉
