# OPEN-ISP v0.5.3 — "forge-lime"

Rilis ini menggabungkan pembaruan fitur dari repo upstream (`alijayanet/billing-rtrw`) yang relevan untuk fork ini, plus perbaikan bug login/sesi.

## Yang baru

### 1. Pembatasan wilayah kerja
- Teknisi hanya melihat/mengambil tiket, pelanggan, perangkat, dan peta di area tugasnya.
- Kolektor hanya melihat & menagih pelanggan di area/tugasnya, termasuk lewat APK (dashboard & pay-bill).
- Mendukung multi-area (`area` dipisah koma), kosong/`semua` = tanpa batas.
- Pelanggan baru yang didaftarkan teknisi otomatis masuk area teknisi tersebut.

### 2. Inventaris gudang
- Stok keluar dengan FIFO atau serial number spesifik.
- Retur barang bekas/copotan.
- Stock opname (sesuaikan stok sistem dengan fisik, selisih dicatat).
- Detail unit per barang, daftar serial tersedia, statistik stok, harga & supplier.
- Semua transaksi tercatat dengan sisa stok di log.

### 3. Edit slip payroll
- Rincian gaji bisa diubah selama berstatus draft; gross, potongan, dan net dihitung ulang otomatis.

### 4. AI & Self-Healing
- Provider AI lewat satu jalur OpenAI-compatible: **DeepSeek (default)**, OpenAI, Groq, OpenRouter, atau custom (Ollama/LM Studio).
- Bot Telegram menjawab pertanyaan admin (termasuk tool: cek pelanggan, perangkat, dll).
- Self-healing memeriksa & memperbaiki:
  - pelanggan terisolir padahal tagihan lunas,
  - secret PPPoE hilang / tertukar profil isolir,
  - pelanggan terisolir tapi masih aktif di MikroTik,
  - sesi RADIUS menggantung,
  - IP modem ACS kosong.
- **Toggle on/off di Pengaturan** (default nonaktif) + tombol Diagnosa / Perbaiki Sekarang.

### 5. Security Watchdog
- Deteksi brute-force login admin/kasir/teknisi/kolektor dan login MikroTik.
- Blokir IP sementara 15 menit setelah 5 percobaan gagal.
- Alert suara (TTS) via soundbox + notifikasi admin.

### 6. Batas sesi login
- Admin/kasir/teknisi/kolektor: maksimal **2** sesi per akun.
- Pelanggan: maksimal **3** sesi per akun.
- Sesi tertua diputus otomatis saat melebihi batas; session ID dirotasi saat login (anti session fixation).
- Sesi tetap tersimpan saat service restart (cookie 30 hari, rolling).

## Perbaikan
- Tab **Status** di login pelanggan kini mengikuti setting `uptime_url`, bukan URL lama.
- Kolom API key AI disamarkan di halaman Pengaturan.

## Dokumentasi
- 10 screenshot (desktop + mobile) di `docs/screenshots/`.

## Cara upgrade

```bash
git pull
npm install
# restart service (pm2 / systemd / docker compose)
```

Migrasi database berjalan otomatis saat aplikasi start (kolom inventaris & tabel sesi login).

Pengaturan AI (opsional): **Pengaturan → AI & Self-Healing** — pilih provider, isi API key/model, lalu nyalakan auto-repair bila sudah yakin.

---

**Full changelog:** [CHANGELOG.md](../CHANGELOG.md)
