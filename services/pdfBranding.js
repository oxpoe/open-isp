/**
 * pdfBranding.js — Tema & branding bersama untuk semua PDF (pdfkit).
 * Dipakai oleh: pdfInvoiceService.js, financeReportPdfService.js.
 * Nama & logo otomatis dari settings (company_header / company_logo -> public /img/logo.png).
 */
const path = require('path');
const fs = require('fs');

const THEME = {
  INK: '#0f172a',      // header band / teks utama
  HEAD: '#0f172a',     // alias header band
  ACCENT: '#ADFF2F',   // aksen lime (garis header / highlight)
  ACCENT_TXT: '#065f46',
  MUTED: '#64748b',
  LINE: '#e2e8f0',
  SOFT: '#f8fafc',
  GREEN: '#16a34a',
  RED: '#e11d48',
  AMBER: '#d97706',
  BLUE: '#0284c7',
  LIGHT: '#94a3b8',
  ON_HEAD: '#ffffff',
};

// Resolusi logo: pakai settings.company_logo bila file lokal ada; fallback /img/logo.png
function resolveLogoPath(settings) {
  const cands = [];
  try {
    const raw = String((settings && (settings.logo_invoice || settings.logo_portal || settings.company_logo)) || '').trim();
    if (raw && !/^https?:\/\//i.test(raw) && !raw.startsWith('data:')) {
      let p = raw.split('?')[0].split('#')[0].replace(/^\/+/, '');
      cands.push(path.join(__dirname, '../public', p));
    }
  } catch (e) {}
  cands.push(path.join(__dirname, '../public/img/logo.png'));
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}

function fmtRp(n) { return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID'); }

function companyInfo(settings) {
  const s = settings || {};
  const phone = (Array.isArray(s.whatsapp_admin_numbers) && s.whatsapp_admin_numbers[0])
    ? '+' + String(s.whatsapp_admin_numbers[0]).replace(/^0/, '62')
    : (s.company_phone || '-');
  return {
    name: s.company_header || 'OPEN-ISP',
    sub: s.company_subheader || 'PT Artha Mega Data',
    address: s.company_address || 'Pusat Layanan Internet',
    phone,
    email: s.company_email || '',
    manager: s.company_manager || 'Bagian Keuangan',
  };
}

module.exports = { THEME, resolveLogoPath, fmtRp, companyInfo };
