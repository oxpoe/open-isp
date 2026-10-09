# Pengujian (Testing) — OPEN-ISP

## 1. Uji manual cepat

1. **Landing** `/` — hero, paket, switcher **ID/EN**, link GitHub/Wiki/Lisensi.
2. **Login admin** `/admin/login` → `admin` / `demo-isp123` → dashboard.
3. **Pelanggan** `/customer/login` → masukkan nomor HP demo **`081200000001`** (login pelanggan hanya butuh nomor HP) → dashboard & tagihan.
4. **Health** `/health` · versi `/version.txt`.

## 2. E2E otomatis

Framework **tester-army/e2e** (`@e2e-dev/web`), locator-based tanpa AI.
Suite + cara jalan: lihat **[`tests/e2e/README.md`](tests/e2e/README.md)**.

```bash
npm i -D e2e@^0.18 @e2e-dev/web
cp tests/e2e/e2e.config.example.ts e2e.config.ts
APP_URL=http://localhost:3001 E2E_TELEMETRY_DISABLED=1 npm run test:e2e
```

Cakupan: landing & halaman publik, guard admin, login admin, **sweep 13 halaman admin**, login pelanggan, 404, `/version.txt`.
