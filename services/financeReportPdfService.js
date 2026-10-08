/**
 * Service: PDF Laporan Keuangan (PDFKit, A4).
 * Mode: 'before' (Sebelum Pajak) | 'after' (Sesudah Pajak).
 */
const PDFDocument = require('pdfkit');
const { resolveLogoPath } = require('./pdfBranding');
const path = require('path');
const fs = require('fs');

const MNS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const fmtRp = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');

function generateFinanceReportPdfBuffer(o) {
  const { company = 'OPEN-ISP', settings = {}, filterYear, filterMonth = 0, finance = {}, ply = {}, pm = {}, monthlyFinance = [], mode = 'after' } = o;
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Laporan Keuangan ${filterYear}`, Author: company, Subject: 'Laporan Laba / Rugi' } });
      const bufs = [];
      doc.on('data', b => bufs.push(b));
      doc.on('end', () => resolve(Buffer.concat(bufs)));
      doc.on('error', reject);

      const INK = '#0f172a', MUTED = '#64748b', LINE = '#e2e8f0', SOFT = '#f8fafc';
      const GREEN = '#16a34a', RED = '#e11d48', AMBER = '#d97706', BLUE = '#0284c7';
      const LIME = '#ADFF2F';
      const LEFT = 40, RIGHT = 555, W = RIGHT - LEFT;
      const modeLabel = (mode === 'before') ? 'SEBELUM PAJAK' : 'SESUDAH PAJAK';
      const periodStr = filterMonth ? `${MNS[filterMonth - 1]} ${filterYear}` : `Tahun ${filterYear}`;
      const companyPhone = settings.company_phone || (settings.whatsapp_admin_numbers && settings.whatsapp_admin_numbers[0]) || '-';
      const companyAddress = settings.company_address || 'Pusat Layanan Internet';

      // ── Header band ──
      doc.rect(0, 0, 595.28, 74).fill(INK);
      doc.rect(0, 74, 595.28, 3).fill(LIME);
      let y = 20;
      const logoPath = resolveLogoPath(settings);
      let nx = LEFT;
      if (logoPath && fs.existsSync(logoPath)) { try { doc.image(logoPath, LEFT, y, { fit: [110, 34] }); nx = LEFT + 122; } catch (e) {} }
      doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text(company, nx, y, { width: 205, lineBreak: false });
      doc.fillColor('#94a3b8').fontSize(8).font('Helvetica').text(companyAddress, nx, y + 19, { width: 205, height: 11, ellipsis: true });
      doc.fillColor('#ffffff').fontSize(17).font('Helvetica-Bold').text('LAPORAN KEUANGAN', LEFT, y, { width: W, align: 'right' });
      doc.fillColor(LIME).fontSize(9).font('Helvetica-Bold').text(periodStr + '  •  ' + modeLabel, LEFT, y + 23, { width: W, align: 'right' });

      // ── Meta ──
      y = 90;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, LEFT, y);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Telp/WA: ${companyPhone}`, LEFT, y, { width: W, align: 'right' });

      const statRow = (yy, label, value, opt = {}) => {
        const { bold = false, color = null, hi = false } = opt;
        const h = hi ? 22 : (bold ? 19 : 17);
        if (hi) doc.roundedRect(LEFT, yy - 2, W, h, 6).fill('#ecfdf5');
        doc.fillColor(hi ? '#065f46' : (bold ? INK : MUTED)).fontSize(hi ? 10.5 : (bold ? 10 : 9)).font(hi || bold ? 'Helvetica-Bold' : 'Helvetica').text(label, LEFT + 8, yy + 2, { width: W - 170 });
        doc.fillColor(hi ? '#065f46' : (color || INK)).fontSize(hi ? 11 : (bold ? 10 : 9)).font(hi || bold ? 'Helvetica-Bold' : 'Helvetica').text(value, LEFT + W - 160, yy + 2, { width: 152, align: 'right' });
        return yy + h;
      };

      // ── A. Laporan Laba/Rugi ──
      y += 18;
      doc.fillColor(INK).fontSize(11).font('Helvetica-Bold').text('A.  LAPORAN LABA / RUGI', LEFT, y);
      doc.moveTo(LEFT, y + 15).lineTo(RIGHT, y + 15).strokeColor(LINE).stroke();
      y += 22;
      y = statRow(y, 'Pemasukan (Bruto)', fmtRp(ply.bruto));
      y = statRow(y, `DPP — Dasar Pengenaan Pajak`, fmtRp(ply.dpp));
      y = statRow(y, `PPN Keluaran (${finance.ppn}%)  — disetor, bukan pendapatan`, fmtRp(ply.ppn), { color: BLUE });
      y = statRow(y, 'Pengeluaran', '- ' + fmtRp(ply.keluar), { color: RED });
      y = statRow(y, `USO (${finance.uso}%)`, '- ' + fmtRp(ply.uso), { color: AMBER });
      y = statRow(y, `BHP (${finance.bhp}%)`, '- ' + fmtRp(ply.bhp), { color: AMBER });
      y = statRow(y, 'Laba Bersih Sebelum Pajak', fmtRp(ply.sebelumPph), { bold: true });
      y = statRow(y, `PPh Badan (${finance.pph}%)`, '- ' + fmtRp(ply.pph), { color: RED });
      y = statRow(y, 'Laba Bersih Sesudah Pajak', fmtRp(ply.bersih), { hi: true });

      // headline box sesuai mode
      y += 8;
      const headline = (mode === 'before') ? ply.sebelumPph : ply.bersih;
      const headlineLabel = (mode === 'before') ? 'LABA BERSIH SEBELUM PAJAK' : 'LABA BERSIH SESUDAH PAJAK';
      doc.roundedRect(LEFT, y, W, 30, 8).fill(INK);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text(headlineLabel, LEFT + 12, y + 10);
      doc.fillColor(LIME).fontSize(13).font('Helvetica-Bold').text(fmtRp(headline), LEFT, y + 8, { width: W - 14, align: 'right' });
      y += 42;

      // ── B. Rekap per bulan ──
      doc.fillColor(INK).fontSize(11).font('Helvetica-Bold').text('B.  REKAP PER BULAN', LEFT, y);
      doc.moveTo(LEFT, y + 15).lineTo(RIGHT, y + 15).strokeColor(LINE).stroke();
      y += 22;

      const cols = [
        { k: 'month', t: 'Bulan', w: 78, a: 'left' },
        { k: 'bruto', t: 'Pemasukan', w: 92, a: 'right' },
        { k: 'keluar', t: 'Pengeluaran', w: 92, a: 'right' },
        { k: 'sebelumPph', t: 'Laba Sblm Pajak', w: 100, a: 'right' },
        { k: 'pph', t: 'PPh Badan', w: 78, a: 'right' },
        { k: 'bersih', t: 'Laba Sstlh Pajak', w: 105, a: 'right' },
      ];
      let cx = LEFT;
      doc.rect(LEFT, y, W, 20).fill('#eef2f6');
      cols.forEach(c => { doc.fillColor(INK).fontSize(7.5).font('Helvetica-Bold').text(c.t, cx + 4, y + 6, { width: c.w - 8, align: c.a }); cx += c.w; });
      y += 20;
      const tot = { bruto: 0, keluar: 0, sebelumPph: 0, pph: 0, bersih: 0 };
      let zi = 0;
      monthlyFinance.forEach(r => {
        tot.bruto += r.bruto; tot.keluar += r.keluar; tot.sebelumPph += r.sebelumPph; tot.pph += r.pph; tot.bersih += r.bersih;
        if (zi % 2 === 1) doc.rect(LEFT, y, W, 16).fill(SOFT);
        cx = LEFT;
        const cells = { month: MNS[r.month - 1], bruto: fmtRp(r.bruto), keluar: fmtRp(r.keluar), sebelumPph: fmtRp(Math.round(r.sebelumPph)), pph: fmtRp(Math.round(r.pph)), bersih: fmtRp(Math.round(r.bersih)) };
        cols.forEach(c => { doc.fillColor(c.k === 'bersih' ? GREEN : INK).fontSize(7.5).font(c.k === 'month' ? 'Helvetica-Bold' : 'Helvetica').text(cells[c.k], cx + 4, y + 4, { width: c.w - 8, align: c.a }); cx += c.w; });
        y += 16; zi++;
      });
      doc.rect(LEFT, y, W, 18).fill('#e2e8f0');
      cx = LEFT;
      const totCells = { month: 'TOTAL', bruto: fmtRp(Math.round(tot.bruto)), keluar: fmtRp(Math.round(tot.keluar)), sebelumPph: fmtRp(Math.round(tot.sebelumPph)), pph: fmtRp(Math.round(tot.pph)), bersih: fmtRp(Math.round(tot.bersih)) };
      cols.forEach(c => { doc.fillColor(INK).fontSize(7.5).font('Helvetica-Bold').text(totCells[c.k], cx + 4, y + 5, { width: c.w - 8, align: c.a }); cx += c.w; });
      y += 26;

      // catatan
      y += 2;
      doc.roundedRect(LEFT, y, W, 34, 6).fillAndStroke('#fefce8', '#fde68a');
      doc.fillColor('#92400e').fontSize(7.5).font('Helvetica').text(
        `Nilai PPh Badan dihitung ${finance.pph}% x Laba Sebelum Pajak (estimasi otomatis). PPN ${finance.ppn}% bersifat pass-through (disetor, bukan pendapatan). Nilai USO ${finance.uso}% & BHP ${finance.bhp}% mengikuti setelan.`,
        LEFT + 10, y + 7, { width: W - 20 });

      // ── Footer ──
      const fy = 780;
      doc.moveTo(LEFT, fy - 12).lineTo(RIGHT, fy - 12).strokeColor(LINE).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(company, LEFT, fy);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(companyAddress, LEFT, fy + 13, { width: 330 });
      doc.fillColor(MUTED).fontSize(7.5).text(`Dokumen dibuat otomatis • ${new Date().toLocaleString('id-ID')}`, LEFT, fy + 32);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('Dibuat oleh,', 440, fy, { width: 115, align: 'center' });
      doc.moveTo(420, fy + 30).lineTo(555, fy + 30).strokeColor(INK).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(settings.company_manager || 'Bagian Keuangan', 420, fy + 34, { width: 135, align: 'center' });

      doc.end();
    } catch (err) { reject(err); }
  });
}

module.exports = { generateFinanceReportPdfBuffer };
