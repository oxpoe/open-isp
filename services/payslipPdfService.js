/**
 * Service: PDF Slip Gaji (PDFKit, A4 portrait) — tema bersama (pdfBranding).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { THEME, resolveLogoPath, companyInfo, fmtRp } = require('./pdfBranding');

const MNS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function generatePayslipPdfBuffer(slip, settings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const ci = companyInfo(settings);
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Slip Gaji — ${slip.employee_name}`, Author: ci.name, Subject: 'Slip Gaji' } });
      const bufs = [];
      doc.on('data', b => bufs.push(b)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);

      const { INK, MUTED, LINE, SOFT, GREEN, RED, AMBER, BLUE, ACCENT, LIGHT } = THEME;
      const LEFT = 40, RIGHT = 555, W = RIGHT - LEFT;

      // Header
      doc.rect(0, 0, 595.28, 74).fill(INK); doc.rect(0, 74, 595.28, 3).fill(ACCENT);
      let y = 20, nx = LEFT;
      const lp = resolveLogoPath(settings);
      if (lp && fs.existsSync(lp)) { try { doc.image(lp, LEFT, y, { fit: [110, 34] }); nx = LEFT + 122; } catch (e) {} }
      doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text(ci.name, nx, y, { width: 205, lineBreak: false });
      doc.fillColor(LIGHT).fontSize(8).font('Helvetica').text(ci.address, nx, y + 19, { width: 205, height: 11, ellipsis: true });
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text('SLIP GAJI', LEFT, y, { width: W, align: 'right' });
      doc.fillColor(ACCENT).fontSize(9).font('Helvetica-Bold').text(`Periode ${MNS[(slip.period_month || 1) - 1]} ${slip.period_year || ''}`, LEFT, y + 23, { width: W, align: 'right' });

      y = 92;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Dicetak: ${new Date().toLocaleString('id-ID')}`, LEFT, y);

      // Info karyawan
      y += 16;
      const role = slip.employee_type === 'technician' ? 'Teknisi' : slip.employee_type === 'cashier' ? 'Kasir' : 'Kolektor';
      doc.roundedRect(LEFT, y, W, 58, 8).fillAndStroke(SOFT, LINE);
      doc.rect(LEFT, y, 4, 58).fill(ACCENT);
      doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Bold').text('KARYAWAN', LEFT + 16, y + 10);
      doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text(slip.employee_name || '-', LEFT + 16, y + 22);
      doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(`Jabatan: ${role}   •   Hari kerja: ${slip.working_days || 0}   •   Absen: ${slip.absent_days || 0}   •   Terlambat: ${slip.late_days || 0}`, LEFT + 16, y + 40);
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(`Status: ${String(slip.status || '-').toUpperCase()}`, LEFT, y + 22, { width: W - 16, align: 'right' });
      y += 74;

      const row = (label, value, opt = {}) => {
        const { bold = false, color = null, section = false } = opt;
        if (section) {
          doc.rect(LEFT, y, W, 18).fill('#eef2f6');
          doc.fillColor(INK).fontSize(8.5).font('Helvetica-Bold').text(label, LEFT + 8, y + 5);
          y += 18; return;
        }
        doc.fillColor(bold ? INK : MUTED).fontSize(bold ? 10 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, LEFT + 8, y + 2, { width: W - 180 });
        doc.fillColor(color || INK).fontSize(bold ? 10 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(value, LEFT + W - 172, y + 2, { width: 164, align: 'right' });
        doc.moveTo(LEFT, y + 16).lineTo(RIGHT, y + 16).strokeColor(LINE).stroke();
        y += 17;
      };

      // Pendapatan
      row('PENDAPATAN', '', { section: true });
      row('Gaji Pokok', fmtRp(slip.base_salary));
      if (slip.transport_allowance) row('Tunjangan Transport', fmtRp(slip.transport_allowance));
      if (slip.meal_allowance) row('Tunjangan Makan', fmtRp(slip.meal_allowance));
      if (slip.phone_allowance) row('Tunjangan Pulsa', fmtRp(slip.phone_allowance));
      if (slip.other_allowance) row(`Tunjangan Lain (${slip.other_allowance_note || '-'})`, fmtRp(slip.other_allowance));
      if (slip.ticket_bonus) row(`Bonus Tiket (${slip.total_tickets_resolved || 0} tiket)`, '+ ' + fmtRp(slip.ticket_bonus), { color: GREEN });
      if (slip.collection_commission) row('Komisi Tagihan', '+ ' + fmtRp(slip.collection_commission), { color: GREEN });
      if (slip.overtime_bonus) row(`Lembur (${slip.overtime_hours || 0} jam)`, '+ ' + fmtRp(slip.overtime_bonus), { color: GREEN });
      row('Total Pendapatan', fmtRp(slip.gross_salary), { bold: true });

      // Potongan
      if (Number(slip.total_deductions || 0) > 0) {
        y += 4; row('POTONGAN', '', { section: true });
        if (slip.absence_deduction) row(`Potongan Absen (${slip.absent_days || 0} hari)`, '- ' + fmtRp(slip.absence_deduction), { color: RED });
        if (slip.late_deduction) row(`Potongan Terlambat (${slip.late_days || 0} hari)`, '- ' + fmtRp(slip.late_deduction), { color: RED });
        if (slip.other_deduction) row(`Potongan Lain (${slip.other_deduction_note || '-'})`, '- ' + fmtRp(slip.other_deduction), { color: RED });
        row('Total Potongan', '- ' + fmtRp(slip.total_deductions), { bold: true, color: RED });
      }

      // Gaji bersih
      y += 8;
      doc.roundedRect(LEFT, y, W, 34, 8).fill(INK);
      doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold').text('GAJI BERSIH', LEFT + 14, y + 11);
      doc.fillColor(ACCENT).fontSize(16).font('Helvetica-Bold').text(fmtRp(slip.net_salary), LEFT, y + 8, { width: W - 16, align: 'right' });
      y += 48;

      if (slip.notes) { doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(`Catatan: ${slip.notes}`, LEFT, y, { width: W }); }

      // Tanda tangan
      const sy = 730;
      doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text('Karyawan,', LEFT, sy, { width: 180, align: 'center' });
      doc.moveTo(LEFT + 10, sy + 40).lineTo(LEFT + 170, sy + 40).strokeColor(INK).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(slip.employee_name || '-', LEFT, sy + 44, { width: 180, align: 'center' });
      doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text('Admin / Pimpinan,', RIGHT - 180, sy, { width: 180, align: 'center' });
      doc.moveTo(RIGHT - 170, sy + 40).lineTo(RIGHT - 10, sy + 40).strokeColor(INK).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(ci.manager || 'Admin', RIGHT - 180, sy + 44, { width: 180, align: 'center' });

      // Footer
      doc.moveTo(LEFT, sy - 16).lineTo(RIGHT, sy - 16).strokeColor(LINE).stroke();
      doc.fillColor(MUTED).fontSize(7.5).text(`Dokumen dibuat otomatis oleh ${ci.name} • ${new Date().toLocaleString('id-ID')}`, LEFT, sy - 12, { width: W });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { generatePayslipPdfBuffer };
