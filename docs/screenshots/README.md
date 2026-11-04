# Screenshot Aplikasi (v0.5.2)

Format **WebP** (kualitas 78, lebar maks 1280px) — total ±0,36 MB (turun ~84% dari PNG).

Diambil dari instance uji lokal (`http://localhost:3001`) dengan data demo
(`node scripts/seed-demo.js`), viewport 1440×900 (mobile 390×844).

| File | Halaman |
|---|---|
| `01-landing.webp` | Landing page publik |
| `02-admin-login.webp` | Halaman login admin |
| `03-admin-dashboard.webp` | Dashboard admin (ringkasan pelanggan, billing, ONU) |
| `04-admin-customers.webp` | Daftar pelanggan |
| `05-admin-inventory.webp` | Inventaris stok |
| `06-inventory-stok-keluar.webp` | Modal Stok Keluar (FIFO / serial number) |
| `07-admin-settings-ai.webp` | Pengaturan → AI & Self-Healing (key disamarkan) |
| `08-customer-login.webp` | Login pelanggan + tab Status mengikuti setting `uptime_url` |
| `09-customer-dashboard.webp` | Dashboard pelanggan |
| `10-mobile-customer-login.webp` | Login pelanggan (tampilan mobile) |

Catatan: field API key di halaman Pengaturan memakai `type="password"`
sehingga tidak tampil di screenshot maupun saat layar dibagikan.
