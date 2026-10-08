# Dokumentasi Integrasi RADIUS & MikroTik

## 📋 Overview

Aplikasi billing ini mendukung **dua mode autentikasi PPPoE**:
1. **Mode MikroTik** - PPPoE Secret disimpan di MikroTik (RADIUS offline)
2. **Mode RADIUS** - PPPoE Secret dikelola oleh RADIUS Server internal (RADIUS aktif)
3. **Mode Hybrid** - RADIUS aktif tapi beberapa pelanggan tetap menggunakan MikroTik secret

---

## 🔄 Cara Kerja Saat Tambah/Edit Pelanggan

### ✅ **PRINSIP PENTING:**
> **PPPoE Secret TIDAK PERNAH dihapus dari MikroTik secara otomatis!**
> 
> Sistem hanya melakukan:
> - ✅ CREATE secret baru (jika belum ada)
> - ✅ UPDATE profile secret (jika sudah ada)
> - ❌ **TIDAK** menghapus/remove secret dari MikroTik

---

## 🎯 Logika Sinkronisasi ke MikroTik

### **1. SAAT RADIUS OFFLINE** (`radius_enabled = "0"`)

Semua pelanggan PPPoE **WAJIB** memiliki secret di MikroTik.

**Saat Tambah Pelanggan:**
```
1. Admin input: username, password, package
2. Data disimpan ke database billing
3. Secret OTOMATIS dibuat di MikroTik
4. Profile di-set sesuai package pelanggan
```

**Saat Edit Pelanggan:**
```
1. Admin edit data pelanggan (ganti package, status, dll)
2. Data diupdate di database billing
3. Sistem cek: apakah secret sudah ada di MikroTik?
   - Jika SUDAH ADA: Hanya update PROFILE (tidak hapus!)
   - Jika BELUM ADA: Create secret baru (jika ada password)
```

### **2. SAAT RADIUS AKTIF** (`radius_enabled = "1"`)

Ada dua kemungkinan per pelanggan:

#### **Mode Full RADIUS** (`is_radius = 1`)
- Pelanggan autentikasi via RADIUS Server
- Secret **TIDAK** perlu ada di MikroTik
- MikroTik hanya sebagai NAS Client yang forward request ke RADIUS
- Sinkronisasi ke MikroTik: **SKIP**

#### **Mode Hybrid - Tetap ke MikroTik** (`is_radius = 0`)
- Pelanggan autentikasi langsung dari MikroTik secret
- Secret **HARUS** ada di MikroTik
- Sinkronisasi ke MikroTik: **AKTIF**
- Berguna untuk pelanggan khusus yang tidak mau pakai RADIUS

---

## 🔧 Implementasi Teknis

### **File yang Dimodifikasi:**
- `routes/adminPortal.js` (route handler tambah/edit pelanggan)

### **Logika Kode:**

```javascript
// Tentukan apakah harus sync ke MikroTik
const radiusEnabled = getSetting('radius_enabled', '0') === '1';
const isRadius = radiusEnabled ? (req.body.is_radius || 0) : 0;
const shouldSyncToMikrotik = !radiusEnabled || !isRadius;

// Jika shouldSyncToMikrotik = true, maka:
if (shouldSyncToMikrotik) {
  // TAMBAH: Create secret baru ke MikroTik
  // EDIT: Update profile atau create jika belum ada
}
```

### **Kondisi Sinkronisasi:**

| RADIUS Status | is_radius | Sync ke MikroTik? | Keterangan |
|---------------|-----------|-------------------|------------|
| OFFLINE (0)   | -         | ✅ YA             | Selalu ke MikroTik |
| AKTIF (1)     | 0         | ✅ YA             | Hybrid mode |
| AKTIF (1)     | 1         | ❌ TIDAK          | Full RADIUS |

---

## 📝 Contoh Skenario

### **Skenario 1: RADIUS Offline (Mode Normal)**

```
Settings: radius_enabled = "0"

TAMBAH PELANGGAN:
- Username: customer01
- Password: pass123
- Package: 10Mbps

HASIL:
✅ Data tersimpan di database billing
✅ Secret dibuat di MikroTik: customer01/pass123
✅ Profile di-set: 10Mbps

EDIT PELANGGAN (Ganti Package ke 20Mbps):
✅ Data diupdate di database
✅ Profile di MikroTik diupdate: 10Mbps → 20Mbps
✅ Secret TIDAK dihapus, tetap ada di MikroTik
```

### **Skenario 2: RADIUS Aktif - Full RADIUS Mode**

```
Settings: radius_enabled = "1"
Form: is_radius = 1 (checkbox dicentang)

TAMBAH PELANGGAN:
- Username: customer02
- Password: pass456
- Package: 20Mbps

HASIL:
✅ Data tersimpan di database billing
❌ Secret TIDAK dibuat di MikroTik (RADIUS yang handle)
✅ Pelanggan login via RADIUS Server

EDIT PELANGGAN:
✅ Data diupdate di database
❌ Tidak sync ke MikroTik (RADIUS mode)
```

### **Skenario 3: RADIUS Aktif - Hybrid Mode**

```
Settings: radius_enabled = "1"
Form: is_radius = 0 (checkbox TIDAK dicentang)

TAMBAH PELANGGAN:
- Username: customer03
- Password: pass789
- Package: 50Mbps

HASIL:
✅ Data tersimpan di database billing
✅ Secret dibuat di MikroTik (meskipun RADIUS aktif)
✅ Pelanggan login dari MikroTik secret, bukan RADIUS

Berguna untuk:
- Pelanggan VIP yang butuh koneksi stabil
- Testing sebelum migrasi penuh ke RADIUS
```

---

## 🛡️ Keamanan & Best Practices

### **1. Password Management:**
- ✅ Password disimpan di database billing
- ✅ Password disimpan di MikroTik secret (saat mode MikroTik)
- ✅ Password di-hash di database RADIUS accounting (aman)

### **2. Saat Hapus Pelanggan:**
```javascript
// File: services/customerService.js
// Fungsi: deleteCustomer()

// Secret AKAN dihapus dari MikroTik jika:
✅ Pelanggan dihapus dari database
✅ Connection type = pppoe
✅ Ada pppoe_username
✅ Ada router_id

// Ini adalah satu-satunya kondisi secret dihapus otomatis!
```

### **3. Saat Ganti Connection Type:**
```
PPPoE → Static IP:
✅ pppoe_username dikosongkan di database
⚠️ Secret TETAP ada di MikroTik (tidak auto-hapus)
💡 Admin perlu hapus manual jika diperlukan

Static IP → PPPoE:
✅ pppoe_username diisi
✅ Secret dibuat baru di MikroTik (jika ada password)
```

---

## 🚀 Migrasi dari MikroTik ke RADIUS

### **Langkah Migrasi Bertahap:**

**Step 1: Persiapan**
```
1. Pastikan database billing sudah lengkap (username & password)
2. Test RADIUS Server: aktifkan di Admin → RADIUS Settings
3. Setup MikroTik: jalankan script auto-setup dari admin panel
4. Test koneksi 1-2 pelanggan pilot
```

**Step 2: Migrasi Bertahap**
```
1. RADIUS aktif, tapi semua pelanggan is_radius = 0 (hybrid)
2. Pelanggan masih login dari MikroTik secret
3. Test RADIUS dengan mengubah 5-10 pelanggan ke is_radius = 1
4. Monitor stability & performance
```

**Step 3: Full RADIUS**
```
1. Bulk update semua pelanggan: is_radius = 1
2. Semua autentikasi via RADIUS Server
3. Secret di MikroTik bisa dihapus (opsional, untuk cleanup)
```

### **Rollback Plan:**
```
Jika ada masalah dengan RADIUS:
1. Set radius_enabled = "0" di settings.json
2. Restart aplikasi
3. Semua pelanggan otomatis kembali ke MikroTik mode
4. Secret masih ada di MikroTik (tidak pernah dihapus)
```

---

## 🐛 Troubleshooting

### **Problem: "Secret tidak dibuat di MikroTik saat tambah pelanggan"**

**Cek:**
1. ✅ RADIUS Status: Apakah RADIUS sedang aktif?
   - Jika YA: Cek checkbox "Mode RADIUS" di form (harus TIDAK dicentang)
   - Jika TIDAK: Seharusnya auto-create

2. ✅ Password: Apakah field password diisi?
   - Jika TIDAK: Secret tidak bisa dibuat
   - Jika YA: Cek error log di `logs/error.log`

3. ✅ Router: Apakah router MikroTik dipilih dan online?
   - Test koneksi: Admin → MikroTik → Test Connection

4. ✅ Profile: Apakah profile/package ada di MikroTik?
   - Cek: Admin → MikroTik → PPPoE Profiles

**Solusi:**
```bash
# Cek log error
tail -f logs/error.log

# Restart aplikasi
pm2 restart billing-rtrw
```

### **Problem: "Secret tidak terupdate saat edit pelanggan"**

**Cek:**
1. ✅ Mode RADIUS: Apakah is_radius = 0? (harus 0 untuk sync ke MikroTik)
2. ✅ Username: Apakah pppoe_username terisi?
3. ✅ Connection Type: Apakah masih PPPoE?

**Catatan:**
- Update hanya mengubah **profile**, bukan password
- Jika ingin ganti password, edit langsung di MikroTik

### **Problem: "Pelanggan tidak bisa login setelah edit"**

**Kemungkinan:**
1. Profile tidak ada di MikroTik
2. Secret terhapus manual dari MikroTik
3. Password berubah di database tapi tidak di MikroTik

**Solusi:**
```
1. Cek secret di MikroTik:
   Admin → MikroTik → PPPoE Secrets
   
2. Jika secret hilang:
   - Edit pelanggan
   - Isi password
   - Save (akan create secret baru)
   
3. Jika profile salah:
   - Edit pelanggan
   - Ganti package
   - Save (akan update profile)
```

---

## 📊 Monitoring & Logging

### **Log yang Tercatat:**

**Saat Tambah Pelanggan:**
```
[Add Customer] Created PPPoE secret "customer01" in MikroTik (RADIUS OFF)
[Add Customer] Updated PPPoE profile for "customer01" to "10Mbps"
```

**Saat Edit Pelanggan:**
```
[Edit Customer] Updated PPPoE profile for "customer01" to "20Mbps"
[Edit Customer] Created NEW PPPoE secret for "customer02" in MikroTik
```

**Saat Hapus Pelanggan:**
```
[DELETE] Attempting to remove PPPoE secret: customer01 from router 1
[DELETE] Successfully removed PPPoE secret for customer01 from MikroTik
```

### **Lokasi File Log:**
```
logs/combined.log  - Semua log aplikasi
logs/error.log     - Error saja
```

---

## 🎓 Kesimpulan

### **Yang Perlu Diingat:**

1. ✅ **PPPoE Secret TIDAK PERNAH dihapus otomatis** saat edit pelanggan
2. ✅ **RADIUS offline = semua ke MikroTik** (auto-create/update)
3. ✅ **RADIUS aktif = bisa hybrid** (sebagian RADIUS, sebagian MikroTik)
4. ✅ **Edit hanya update profile**, bukan hapus secret
5. ✅ **Hapus pelanggan = secret dihapus** (satu-satunya kondisi auto-delete)

### **Keuntungan Desain Ini:**

- 🔒 **Aman**: Secret tidak hilang karena salah edit
- 🔄 **Fleksibel**: Bisa RADIUS, MikroTik, atau hybrid
- 📈 **Scalable**: Mudah migrasi bertahap ke RADIUS
- 🛡️ **Rollback**: Bisa kembali ke MikroTik mode kapan saja

---

## 📞 Support

Jika ada pertanyaan atau masalah, hubungi developer atau cek dokumentasi lengkap di:
- README.md
- FITUR_APLIKASI_LENGKAP.md
- AUDIT_SECURITY_2026.md

---

**Dibuat:** 18 Agustus 2026  
**Versi:** 1.0  
**Last Update:** 18 Agustus 2026
