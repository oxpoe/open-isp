# Kontribusi ke OPEN-ISP

Terima kasih sudah tertarik berkontribusi! 🎉

## Cara Berkontribusi

1. **Fork** repositori ini.
2. Buat **branch** baru: `git checkout -b fitur/nama-fitur`.
3. Lakukan perubahan + uji.
4. **Commit**: `git commit -m "feat: deskripsi singkat"`.
5. **Push** branch & buka **Pull Request**.

## Aturan

- Ikuti gaya kode & struktur yang ada (Express/EJS, service di `services/`, route di `routes/`).
- Bahasa commit/PR boleh Indonesia atau Inggris.
- **Jangan pernah** meng-commit `settings.json`, `.env`, `database/`, `logs/`, `uploads/`, `baileys/`, atau berkas berisi data pelanggan/rahasia.
- Untuk perubahan besar, buka **Issue** dulu untuk didiskusikan.
- Sertakan cara menguji di deskripsi PR.

## Uji Lokal

```bash
docker compose up -d --build
# atau
npm ci --omit=dev && npm start
node scripts/seed-demo.js   # data demo
```

## Melaporkan Bug & Fitur

Gunakan template di tab **Issues**. Untuk celah keamanan, lihat [SECURITY.md](SECURITY.md).

## Lisensi Kontribusi

Dengan berkontribusi, Anda menyetujui kontribusi Anda dirilis di bawah lisensi **[ISC](LICENSE)** proyek ini.
