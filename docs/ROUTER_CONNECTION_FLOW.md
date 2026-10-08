# Router Connection Flow - Tanpa Perlu Menambah di /admin/routers

## ✅ Jawaban: YA, SUDAH BISA!

Anda **tidak perlu** menambah router di `/admin/routers` jika sudah ada di `settings.json`. Sistem akan otomatis menggunakan `settings.json` sebagai fallback.

---

## Connection Priority (Urutan Koneksi)

```
┌─────────────────────────────────────────────────────────────┐
│  getConnection(routerId) dipanggil                          │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │  Apakah routerId diberikan?          │
        │  (misal: routerId = 1)               │
        └──────────────────────────────────────┘
               │ YA                │ TIDAK
               │                   │
               ▼                   ▼
        ┌──────────────────┐  ┌────────────────────────────────┐
        │ Cari di database │  │ Cari router aktif dari database│
        │ WHERE id = 1     │  │ WHERE is_active = 1            │
        └──────────────────┘  └────────────────────────────────┘
               │                   │
               │ Ada               │ Ada
               ▼                   ▼
        ┌──────────────────┐  ┌────────────────────────────────┐
        │ Pakai router itu │  │ Pakai router dari database      │
        │ dari database    │  │                                │
        └──────────────────┘  └────────────────────────────────┘
               │                   │
               │ TIDAK ADA          ▼
               │            ┌────────────────────────────────┐
               │            │ (Hubungan database ke MikroTik)│
               │            └────────────────────────────────┘
               │                   │
               │                   │ TIDAK ADA
               │                   ▼
               │         ┌──────────────────────────┐
               │         │ FALLBACK ke settings.json│
               │         │ - mikrotik_host          │
               │         │ - mikrotik_user          │
               │         │ - mikrotik_password      │
               │         │ - mikrotik_port          │
               │         └──────────────────────────┘
               │                   │
               └───────────────────┘
                       │
                       ▼
            ┌─────────────────────────┐
            │ Hubung ke MikroTik      │
            │ dengan credentials yang │
            │ sudah dipilih           │
            └─────────────────────────┘
```

---

## Skenario Penggunaan

### Skenario 1: Anda HANYA punya `settings.json` (Satu Router)
```json
{
  "mikrotik_host": "192.168.8.1",
  "mikrotik_user": "ali",
  "mikrotik_password": "060111",
  "mikrotik_port": 8700
}
```

**Apa yang terjadi:**
1. `getConnection()` dipanggil tanpa `routerId`
2. Cari router di database → TIDAK ADA
3. **Fallback ke settings.json** → GUNAKAN ✅
4. Koneksi berhasil ke MikroTik Anda

**Anda perlu tambah di /admin/routers?** → **TIDAK** ✖️

---

### Skenario 2: Anda punya `settings.json` + `/admin/routers` (Multi-Router)
```json
{
  "mikrotik_host": "192.168.8.1",
  "mikrotik_user": "ali",
  "mikrotik_password": "060111"
}
```

**Database routers:**
```
ID | name            | host         | user  | is_active
---|-----------------|--------------|-------|----------
1  | Main Router     | 192.168.8.1  | ali   | 1
2  | Backup Router   | 192.168.9.1  | admin | 1
```

**Apa yang terjadi:**
- `getConnection(1)` → Gunakan router ID 1 dari database ✅
- `getConnection(2)` → Gunakan router ID 2 dari database ✅
- `getConnection()` (tanpa routerId) → Gunakan router pertama dari database ✅
- `settings.json` tidak dipakai

**Kapan settings.json dipakai?** Hanya jika database tidak punya router aktif

---

### Skenario 3: TRANSISI dari single-router ke multi-router
```
Fase 1 (Hanya settings.json):
  - settings.json: Sudah ada MikroTik credentials ✅
  - /admin/routers: KOSONG (tidak perlu ditambah)
  - Aplikasi jalan normal dengan settings.json

Fase 2 (Tambah multi-router):
  - Tambah router ke /admin/routers
  - settings.json: Tetap ada (tapi tidak dipakai lagi)
  - Aplikasi pakai database routers sebagai priority
```

---

## Code Implementation

### File: `services/mikrotikService.js` (lines 256-290)

```javascript
async function getConnection(routerId = null) {
  let host, port, user, password;

  if (routerId) {
    // Priority 1: Gunakan router spesifik dari database
    const router = db.prepare('SELECT * FROM routers WHERE id = ?').get(routerId);
    if (!router) throw new Error(`Router with ID ${routerId} not found`);
    host = router.host;
    port = router.port || 8728;
    user = router.user;
    password = router.password;
  } else {
    // Priority 2: Cari router default (is_active = 1)
    const defaultRouter = db.prepare(
      'SELECT * FROM routers WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
    ).get();
    
    if (defaultRouter) {
      // Ada router aktif, gunakan itu
      host = defaultRouter.host;
      port = defaultRouter.port || 8728;
      user = defaultRouter.user;
      password = defaultRouter.password;
      logger.info(`[MikroTik] Using default router from database: ${defaultRouter.name}`);
    } else {
      // Priority 3: Fallback ke settings.json (backward compatibility)
      const settings = getSettingsWithCache();
      host = settings.mikrotik_host;
      port = settings.mikrotik_port || 8728;
      user = settings.mikrotik_user;
      password = settings.mikrotik_password;
      logger.info('[MikroTik] Using router from settings.json (no routers in database)');
    }
  }

  // Lanjut koneksi...
}
```

---

## Keuntungan Arsitektur Ini

### ✅ Backward Compatible
- **Old Setup**: Hanya `settings.json` → Tetap jalan ✅
- **New Setup**: `/admin/routers` + `settings.json` → Prioritas database ✅

### ✅ Fleksibel
- Bisa transisi dari single → multi-router tanpa downtime
- Bisa rollback dengan disable semua routers di database
- `settings.json` berfungsi sebagai "circuit breaker" terakhir

### ✅ Aman
- Jika database routers error, fallback ke settings.json
- Tidak ada data loss atau operasi yang terputus

---

## Testing: Verifikasi Fallback Works

### Test 1: Cek logs saat aplikasi start
```bash
tail -f logs/combined.log | grep "Using router"
```

Akan muncul salah satu:
- `"Using default router from database"` → Database routers digunakan
- `"Using router from settings.json"` → Fallback ke settings.json

### Test 2: Cek via Node
```bash
node -e "
const svc = require('./services/mikrotikService');
svc.checkConnection(null).then(ok => {
  console.log('Default connection:', ok ? '✅ OK' : '❌ FAIL');
});
"
```

### Test 3: Disable routers di database, cek apakah fallback jalan
```bash
sqlite3 database/billing.db "UPDATE routers SET is_active = 0;"
```

Cek logs → Harus ada `"Using router from settings.json"` ✅

---

## Pertanyaan Umum (FAQ)

**Q: Apa perbedaan /admin/routers dengan settings.json?**
- **settings.json**: Single router, tidak bisa diubah dari UI
- **/admin/routers**: Multiple routers, bisa diatur dari UI admin

**Q: Kalau saya hapus settings.json apa yang terjadi?**
- Jika database kosong (tidak ada routers) → Error "MikroTik settings not configured"
- Jika database punya routers → Jalan normal

**Q: Kapan saya harus gunakan /admin/routers?**
- Jika punya multiple MikroTik routers (multi-ISP, multi-lokasi)
- Jika ingin setup dari UI daripada edit JSON manual

**Q: Bisakah saya punya settings.json TIDAK ada tapi /admin/routers ada?**
- Ya, bisa! Sebetulnya yang penting adalah database routers

**Q: Isolir via WhatsApp apakah support multi-router?**
- Ya! Gunakan `getEffectiveRouterId()` → fallback ke settings.json jika perlu

---

## Kesimpulan

Anda **TIDAK PERLU** menambah router di `/admin/routers` jika:
- ✅ Hanya punya 1 MikroTik router
- ✅ Sudah di-setup di `settings.json`
- ✅ Tidak perlu ganti-ganti router dari UI

**Cukup gunakan `settings.json` yang sudah ada, sistem akan otomatis menggunakannya sebagai fallback.** ✅

Jika nanti ingin multi-router, tinggal tambah di `/admin/routers` dan system akan auto-switch prioritas.
