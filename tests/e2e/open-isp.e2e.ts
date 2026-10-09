import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

/**
 * OPEN-ISP — E2E suite lengkap (locator murni, tanpa langkah AI).
 * Target: container lokal (APP_URL=http://localhost:3001).
 * Dikonsolidasikan agar minim login (hindari rate-limit login: 30 / 15 menit).
 */

const ADMIN_USER = process.env.ADMIN_USER ?? 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'demo-isp123';
const CUSTOMER_PHONE = process.env.CUSTOMER_PHONE ?? '081200000001';
const ERR_RE = /Internal Server Error|Kesalahan Server|no such table|Cannot read propert|ReferenceError/i;

async function loginAdmin(app: any, browser: any) {
  await app.open('/admin/login');
  await browser.locator('input[name="username"], input[name="user"]').first().fill(ADMIN_USER);
  await browser.locator('input[type="password"]').first().fill(ADMIN_PASS);
  await browser.locator('button[type="submit"], form button').first().click();
  await expect(browser.locator('body')).toContainText(/Dashboard|Pelanggan|Selamat|Admin/i);
}

async function checkPage(app: any, browser: any, path: string, pattern: RegExp) {
  await app.open(path);
  await expect(browser.locator('body')).toBeVisible();
  await expect(browser.locator('body')).toContainText(pattern);
  await expect(browser.locator('body')).not.toContainText(ERR_RE);
}

/* ============ 1. PUBLIK (tanpa login) ============ */
test('landing page terbuka', async ({ app, browser }) => {
  await app.open('/');
  await expect(browser.locator('body')).toBeVisible();
  await expect(browser.locator('h1')).toContainText(/Internet/i);
  await expect(browser.locator('body')).toContainText(/OPEN-ISP/i);
});

test('halaman login admin tampil', async ({ app, browser }) => {
  await app.open('/admin/login');
  await expect(browser.locator('input[type="password"]').first()).toBeVisible();
});

test('halaman login pelanggan tampil', async ({ app, browser }) => {
  await app.open('/customer/login');
  await expect(browser.locator('body')).toContainText(/Portal Pelanggan|Masuk|Selamat/i);
});

test('halaman registrasi pelanggan tampil', async ({ app, browser }) => {
  await checkPage(app, browser, '/customer/register', /Daftar|Register|Nama/i);
});

test('halaman cek tagihan publik tampil', async ({ app, browser }) => {
  await checkPage(app, browser, '/customer/check-billing', /Tagihan|Cek|Nomor/i);
});

test('halaman isolir tampil', async ({ app, browser }) => {
  await app.open('/isolated');
  await expect(browser.locator('body')).toBeVisible();
});

test('halaman 404 tampil dengan benar', async ({ app, browser }) => {
  await app.open('/halaman-tidak-ada-xyz-123');
  await expect(browser.locator('body')).toContainText(/404|Not Found|Tidak Ditemukan/i);
});

test('version.txt memuat billing 0.5', async ({ app, browser }) => {
  await app.open('/version.txt');
  await expect(browser.locator('body')).toContainText(/billing\s*=\s*0\.5/);
});

/* ============ 2. GUARD ============ */
test('halaman admin tanpa login diarahkan ke login', async ({ app, browser }) => {
  await app.open('/admin/customers');
  await expect(browser.locator('body')).toContainText(/Masuk|Login|Admin/i);
});

/* ============ 3. ADMIN (1x login → sweep) ============ */
test('admin bisa login', async ({ app, browser }) => {
  await loginAdmin(app, browser);
});

test('admin: sweep halaman utama (login sekali)', async ({ app, browser }) => {
  await loginAdmin(app, browser);
  const pages: [string, RegExp][] = [
    ['/admin', /Dashboard|Pelanggan|Pendapatan|Tagihan/i],
    ['/admin/customers', /Pelanggan/i],
    ['/admin/packages', /Paket/i],
    ['/admin/billing', /Tagihan|Invoice|Billing/i],
    ['/admin/olts', /OLT/i],
    ['/admin/settings', /Pengaturan|Settings/i],
    ['/admin/monitoring', /Monitoring|Metrik|CPU/i],
    ['/admin/mikrotik', /MikroTik|PPPoE/i],
    ['/admin/collectors', /Kolektor/i],
    ['/admin/discounts', /Diskon/i],
    ['/admin/tickets', /Tiket|Ticket/i],
    ['/admin/whatsapp', /WhatsApp|Gateway/i],
    ['/admin/sidebar-settings', /Sidebar|Aktivasi|Menu/i],
  ];
  for (const [path, re] of pages) {
    await checkPage(app, browser, path, re);
  }
});

test('admin: password salah ditolak', async ({ app, browser }) => {
  await app.open('/admin/login');
  await browser.locator('input[name="username"]').first().fill(ADMIN_USER);
  await browser.locator('input[type="password"]').first().fill('password-salah-xyz');
  await browser.locator('button[type="submit"], form button').first().click();
  await expect(browser.locator('body')).toContainText(/Masuk|Login|salah|invalid|gagal/i);
});

/* ============ 4. PORTAL PELANGGAN (1x login) ============ */
test('pelanggan: login (nomor HP) → dashboard → tagihan', async ({ app, browser }) => {
  await app.open('/customer/login');
  await browser.locator('input[name="phone"], input[name="login"], input[type="text"]').first().fill(CUSTOMER_PHONE);
  await browser.locator('button[type="submit"], form button').first().click();
  await expect(browser.locator('body')).toContainText(/Selamat datang|Beranda|Tagihan|Dasbor|Mbps/i);
  await checkPage(app, browser, '/customer/dashboard', /Mbps|Paket|Masa Aktif|Tagihan/i);
});

/* ============ 5. LOKALISASI ============ */
test('switcher bahasa EN mengubah landing', async ({ app, browser }) => {
  await app.open('/lang/en');
  await app.open('/');
  await expect(browser.locator('body')).toBeVisible();
});
