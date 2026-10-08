# Kebijakan Keamanan

## Versi yang Didukung

| Versi | Didukung |
|---|---|
| 0.5.x | ✅ |

## Melaporkan Kerentanan

**Jangan** membuka Issue publik untuk masalah keamanan.

Gunakan tab **Security → Report a vulnerability** (GitHub Security Advisories) pada repositori ini, atau hubungi pengelola secara privat melalui GitHub.

Sertakan: deskripsi, langkah reproduksi, dampak, dan (bila ada) saran perbaikan. Kami akan berusaha merespons secepatnya.

## Praktik Aman

- Ganti `session_secret` dan password admin default.
- Jangan pernah meng-commit `settings.json`, `.env`, `database/`, `uploads/`.
- Jalankan di belakang HTTPS/reverse proxy untuk produksi.

Selengkapnya: [Wiki — Keamanan](https://github.com/oxpoe/open-isp/wiki/Keamanan).
