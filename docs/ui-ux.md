# UI/UX Rules — Billing RTRW (SKYFIBER)

> Dokumen acuan wajib untuk **semua** pekerjaan UI/UX di project ini.
> Setiap kali membuat / mengubah tampilan, ikuti aturan di bawah.

---

## Peran

**Act as an Expert Senior Frontend Developer.**

Your task is to generate a highly responsive, modern, and fluid web layout for
**[Sebutkan apa yang ingin dibuat, misal: a Dashboard / Landing Page / Navigation Bar]**
using **[Sebutkan teknologi, misal: HTML & Tailwind CSS / HTML & Vanilla CSS / EJS]**.

> Di project ini umumnya: **EJS + Vanilla CSS** (`public/css/admin.css`, `landing.css`,
> `auth.css`, `admin-theme.css`) dan **Bootstrap Icons** (bukan emoji di UI).

---

## Strict Layout & Responsiveness Requirements

### 1. Fluid Typography & Spacing
- Gunakan fungsi CSS **`clamp()`** untuk ukuran font, padding, dan margin agar skala
  mulus di semua ukuran layar (mobile → desktop 4K) **tanpa** hanya mengandalkan
  media query yang patah-patah.
- Contoh: `font-size: clamp(0.95rem, 0.9rem + 0.5vw, 1.25rem);`
  `padding: clamp(12px, 2vw, 28px);`

### 2. Zero Overlap Guarantee
Pastikan teks, kartu, tombol, dan ikon **tidak pernah** tumpang tindih atau keluar
dari kontainernya:
- `overflow-wrap: break-word;` atau `word-break: break-word;` untuk teks panjang
  (mis. link, nama panjang, kode).
- `min-width: 0;` pada **flex/grid children** agar tidak meluber keluar parent.
- Gunakan **`flex-wrap: wrap` + CSS `gap`** (bukan margin tetap) untuk jarak antar item.
- Gambar & ikon harus responsif: `max-width: 100%; height: auto;` atau
  `aspect-ratio` + `object-fit: contain|cover`.

### 3. Flexible & Mappable Structure (CSS Grid / Flexbox)
- Bangun layout yang **self-adapting**.
- **CSS Grid** dengan `repeat(auto-fit, minmax(..., 1fr))` untuk grid kartu agar
  otomatis memetakan ke ruang layar yang tersedia.
  Contoh: `grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));`
- **Flexbox** untuk perataan (alignment) & distribusi.
- **Hindari tinggi tetap** (`height: 100px`); gunakan **`min-height`** agar konten
  bisa memanjang dengan aman.

### 4. Mobile-First Approach
- Mulai dari layout **vertikal** yang solid untuk mobile.
- Lalu naikkan dengan **media query** (`@media (min-width: ...)`) atau breakpoint
  Tailwind (`md:`, `lg:`) untuk memetakan ke **grid/flex horizontal** di layar besar.

### 5. Debug-Friendly & Minimal Bugs
- Tulis HTML yang **bersih, semantik, dan dangkal** (hindari *div soup*).
- Gunakan **CSS Custom Properties (Variabel) terpusat** untuk warna, spacing, dan
  font agar perubahan cepat & mudah.
  Contoh: `--primary: #ADFF2F; --bg: #0A0D14; --radius: 14px;`
- Beri **komentar jelas** di kode yang menjelaskan logika layout.

---

## Output

Output **tepat kode yang diperlukan**, pastikan:
- **siap dijalankan** (ready to run),
- **bebas bug** (bug-free),
- **mudah di-debug**.

---

## Catatan khusus project ini

- **Tema**: dark (default) + lime `#ADFF2F` di atas near-black `#0A0D14`; harus ada
  toggle dark/light di setiap halaman.
- **Ikon**: **Bootstrap Icons** saja untuk UI (emoji hanya untuk teks WhatsApp).
- **Brand**: nama & logo diambil dari settings (`brandName` / `brandLogo`), jangan hardcode.
- **Bilingual (ID/EN)** via `t('key', 'fallback')` — identifier kode tetap Inggris.
- **Admin**: markup sidebar & `admin.css`/`dashboard.ejs` diperlakukan "frozen";
  penyesuaian via overlay `admin-theme.css`.
- **Scroll**: area konten admin = `.mw` (scroll container). Jangan bikin konten
  terpotong; `.page` dibiarkan tumbuh (`flex: 0 0 auto`) agar `.mw` bisa scroll.
- **Modal**: satu scroll saja (`.mb` yang scroll, `.mbody` `overflow: visible`) —
  hindari *nested scroll* yang mengunci.
- **Responsif**: gunakan `100dvh` (bukan `100vh`) untuk area penuh-layar di mobile.

---

## Checklist cepat sebelum selesai

- [ ] Ukuran font/spacing pakai `clamp()` di elemen utama.
- [ ] Tidak ada teks/ikon yang meluber/overlap (cek `min-width:0`, `overflow-wrap`, `flex-wrap`).
- [ ] Grid kartu pakai `repeat(auto-fit, minmax(..., 1fr))`.
- [ ] Tidak ada `height` tetap pada blok konten (pakai `min-height`).
- [ ] Mobile-first + breakpoint untuk layar besar.
- [ ] HTML semantik & dangkal; warna/spacing via CSS variables.
- [ ] Dark/light berfungsi; ikon Bootstrap Icons; bilingual ID/EN.
- [ ] Scroll & modal normal di mobile **dan** desktop.
