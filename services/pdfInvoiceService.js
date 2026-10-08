/**
 * Service: PDF Invoice Generator (Redesign — profesional)
 * PDFKit. Dipakai untuk invoice pelanggan (A4). Semua PDF memakai layout ini.
 */
const PDFDocument = require('pdfkit');
const { THEME, resolveLogoPath } = require('./pdfBranding');
const path = require('path');
const fs = require('fs');

const MNS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function fmtRp(n) {
  return 'Rp ' + Number(n || 0).toLocaleString('id-ID');
}

function generateInvoicePdfBuffer(invoice, customer, settings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        info: {
          Title: `Invoice #INV-${String(invoice.id).padStart(4, '0')}`,
          Author: settings.company_header || 'OPEN-ISP',
          Subject: 'Invoice Pembayaran Internet'
        }
      });
      const buffers = [];
      doc.on('data', b => buffers.push(b));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const companyName = settings.company_header || 'OPEN-ISP';
      const companySub = settings.company_subheader || 'PT Artha Mega Data';
      const companyAddress = settings.company_address || 'Pusat Layanan Internet Terpercaya';
      const companyPhone = (settings.whatsapp_admin_numbers && settings.whatsapp_admin_numbers.length > 0)
        ? '+' + String(settings.whatsapp_admin_numbers[0]).replace(/^0/, '62')
        : (settings.company_phone || '-');
      const companyEmail = settings.company_email || '';
      const managerName = settings.company_manager || 'Admin Pusat';

      const year = new Date().getFullYear();
      const invNo = `INV-${String(invoice.id).padStart(4, '0')}-${year}`;
      const isPaid = (invoice.status === 'paid');
      const isVoid = (invoice.status === 'void');
      const periodStr = `${MNS[(invoice.period_month || 1) - 1]} ${invoice.period_year || year}`;

      // Palet
      const BRAND = THEME.HEAD;
      const BRAND2 = THEME.ACCENT;
      const INK = THEME.INK;
      const MUTED = THEME.MUTED;
      const SOFT = THEME.SOFT;
      const LINE = THEME.LINE;
      const GREEN = THEME.GREEN;
      const RED = THEME.RED;
      const statusColor = isVoid ? MUTED : (isPaid ? GREEN : RED);
      const statusText = isVoid ? 'DIBATALKAN' : (isPaid ? 'LUNAS' : 'BELUM BAYAR');

      const LEFT = 40, RIGHT = 555, W = RIGHT - LEFT;

      // ── Header band ──
      doc.rect(0, 0, 595.28, 96).fill(BRAND);
      doc.rect(0, 92, 595.28, 4).fill(BRAND2);

      // logo / avatar
      let y = 24;
      const logoPath = resolveLogoPath(settings);
      let logoDrawn = false;
      if (logoPath && fs.existsSync(logoPath)) {
        try { doc.image(logoPath, LEFT, y, { fit: [120, 38] }); logoDrawn = true; } catch (e) {}
      }
      const nameX = logoDrawn ? LEFT + 134 : LEFT;
      if (!logoDrawn) {
        doc.circle(LEFT + 16, y + 16, 16).fill('#ffffff');
        doc.fillColor(BRAND).fontSize(16).font('Helvetica-Bold').text(companyName.charAt(0).toUpperCase(), LEFT, y + 8, { width: 32, align: 'center' });
      }
      doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(companyName, nameX, y, { lineBreak: false });
      doc.fillColor('#cbd5e1').fontSize(8.5).font('Helvetica').text(companySub, nameX, y + 21, { lineBreak: false });
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica').text(`Telp/WA: ${companyPhone}${companyEmail ? '  •  ' + companyEmail : ''}`, nameX, y + 33, { lineBreak: false });

      // Judul di kanan
      doc.fillColor('#ffffff').fontSize(24).font('Helvetica-Bold').text('INVOICE', LEFT, y, { width: W, align: 'right' });
      doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica-Bold').text(`# ${invNo}`, LEFT, y + 30, { width: W, align: 'right' });

      // ── Status ribbon ──
      y = 112;
      doc.roundedRect(RIGHT - 132, y, 132, 22, 11).fillAndStroke(statusColor, statusColor);
      doc.fillColor('#ffffff').fontSize(9.5).font('Helvetica-Bold').text(statusText, RIGHT - 132, y + 6, { width: 132, align: 'center' });

      // Tanggal terbit kanan
      const issueDate = isPaid && invoice.paid_at ? String(invoice.paid_at).slice(0, 10) : new Date().toISOString().slice(0, 10);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('Tanggal', LEFT, y + 2, { width: W - 150, align: 'right' });
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(issueDate, LEFT, y + 11, { width: W - 150, align: 'right' });

      // ── Bill To & Customer Info ──
      y = 150;
      const cardH = 92;
      doc.roundedRect(LEFT, y, 300, cardH, 8).fillAndStroke(SOFT, LINE);
      doc.rect(LEFT, y, 4, cardH).fill(BRAND);
      doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Bold').text('DITAGIHKAN KEPADA', LEFT + 16, y + 12);
      doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text(customer.name || 'Pelanggan', LEFT + 16, y + 24, { width: 270 });
      const meta = [];
      if (customer.customer_code) meta.push(`ID: ${customer.customer_code}`);
      if (customer.phone) meta.push(`HP: ${customer.phone}`);
      if (meta.length) doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(meta.join('   •   '), LEFT + 16, y + 44, { width: 270 });
      if (customer.address) doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(`Alamat: ${customer.address}`, LEFT + 16, y + 58, { width: 270, height: 28 });

      // Ringkasan kanan
      doc.roundedRect(LEFT + 315, y, 200, cardH, 8).fillAndStroke(SOFT, LINE);
      doc.fillColor(MUTED).fontSize(7.5).font('Helvetica-Bold').text('RINGKASAN', LEFT + 331, y + 12);
      const lineRs = (label, val, dy, bold) => {
        doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(label, LEFT + 331, y + dy, { width: 100 });
        doc.fillColor(bold ? INK : MUTED).fontSize(9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(val, LEFT + 411, y + dy, { width: 90, align: 'right' });
      };
      lineRs('Periode', periodStr, 26);
      lineRs('Paket', String(customer.package_name || '-').slice(0, 22), 40);
      lineRs('Status', statusText, 54, true);

      // ── Tabel layanan ──
      y = 262;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('RINCIAN LAYANAN', LEFT, y);
      y += 12;
      doc.roundedRect(LEFT, y, W, 24, 6).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
      doc.text('#', LEFT + 12, y + 8, { width: 24 });
      doc.text('Deskripsi', LEFT + 40, y + 8, { width: 300 });
      doc.text('Jumlah', LEFT + W - 130, y + 8, { width: 118, align: 'right' });
      y += 24;

      const pkgName = customer.package_name || 'Paket Internet';
      const amount = Number(invoice.amount || 0);
      const rowH = 40;
      doc.rect(LEFT, y, W, rowH).fill('#ffffff').strokeColor(LINE).stroke();
      doc.fillColor(INK).fontSize(9.5).font('Helvetica-Bold').text('01', LEFT + 12, y + 9);
      doc.fillColor(INK).fontSize(9.5).font('Helvetica-Bold').text(`Layanan Internet — ${pkgName}`, LEFT + 40, y + 8);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(`Langganan bulanan • ${periodStr}`, LEFT + 40, y + 22);
      doc.fillColor(INK).fontSize(10).font('Helvetica-Bold').text(fmtRp(amount), LEFT + W - 130, y + 12, { width: 118, align: 'right' });

      // Watermark
      doc.save();
      doc.fillColor(statusColor).opacity(0.07).fontSize(64).font('Helvetica-Bold');
      doc.rotate(-18, { origin: [297, y + 40] });
      doc.text(statusText, 100, y + 6, { width: 400, align: 'center' });
      doc.restore();

      // ── Totals ──
      y += rowH + 16;
      const beforeDisc = Number(invoice.amount_before_discount || amount);
      const disc = Number(invoice.discount_amount || 0);
      const tax = Number(invoice.tax_amount || 0);
      const total = amount;

      const boxX = LEFT + 300, boxW = W - 300;
      let ty = y;
      const totalLine = (label, val, bold, color) => {
        doc.fillColor(bold ? INK : MUTED).fontSize(bold ? 10.5 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(label, boxX, ty, { width: boxW - 120 });
        doc.fillColor(color || (bold ? INK : MUTED)).fontSize(bold ? 11 : 9).font(bold ? 'Helvetica-Bold' : 'Helvetica').text(val, boxX + boxW - 120, ty, { width: 120, align: 'right' });
        ty += bold ? 18 : 15;
      };
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('PEMBAYARAN', boxX, ty); ty += 14;
      totalLine('Subtotal', fmtRp(beforeDisc));
      if (disc > 0) totalLine('Diskon', '- ' + fmtRp(disc), false, GREEN);
      if (tax > 0) totalLine('Pajak (PPN/USO)', fmtRp(tax));
      doc.moveTo(boxX, ty).lineTo(boxX + boxW, ty).strokeColor(LINE).stroke(); ty += 6;
      doc.roundedRect(boxX - 10, ty - 4, boxW + 10, 30, 8).fill(BRAND);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold').text('TOTAL', boxX, ty + 5, { width: boxW - 120 });
      doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold').text(fmtRp(total), boxX + boxW - 130, ty + 3, { width: 130, align: 'right' });
      ty += 40;

      // Info metode bayar (kiri)
      let my = y;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica-Bold').text('STATUS PEMBAYARAN', LEFT, my); my += 14;
      const payRows = [
        ['Metode', invoice.payment_gateway || invoice.paid_by_name || (isPaid ? 'Manual' : '-')],
        ['Waktu', isPaid && invoice.paid_at ? String(invoice.paid_at).replace('T', ' ').slice(0, 19) : '-'],
        ['Kasir', invoice.paid_by_name || 'Sistem']
      ];
      for (const [k, v] of payRows) {
        doc.fillColor(MUTED).fontSize(8.5).font('Helvetica').text(k, LEFT, my, { width: 80 });
        doc.fillColor(INK).fontSize(8.5).font('Helvetica-Bold').text(String(v).slice(0, 40), LEFT + 80, my, { width: 190 });
        my += 15;
      }

      // ── Catatan ──
      let ny = Math.max(ty, my) + 6;
      doc.roundedRect(LEFT, ny, W, 46, 8).fillAndStroke('#fefce8', '#fde68a');
      doc.fillColor('#92400e').fontSize(8.5).font('Helvetica-Bold').text('Catatan', LEFT + 12, ny + 8);
      const noteText = invoice.notes
        ? String(invoice.notes).replace(/\n+/g, ' ').slice(0, 200)
        : (isPaid ? 'Pembayaran telah diterima. Simpan dokumen ini sebagai bukti pembayaran yang sah.' : 'Mohon lakukan pembayaran sebelum tanggal jatuh tempo.');
      doc.fillColor('#92400e').fontSize(8).font('Helvetica').text(noteText, LEFT + 12, ny + 20, { width: W - 24, height: 22 });

      // ── Footer ──
      const fy = 770;
      doc.moveTo(LEFT, fy - 12).lineTo(RIGHT, fy - 12).strokeColor(LINE).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(companyName, LEFT, fy);
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(companyAddress, LEFT, fy + 13, { width: 330, height: 22 });
      doc.fillColor(MUTED).fontSize(7.5).text(`Dokumen dibuat otomatis • ${new Date().toLocaleString('id-ID')}`, LEFT, fy + 40);

      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('Hormat Kami,', 430, fy, { width: 125, align: 'center' });
      doc.moveTo(430, fy + 34).lineTo(555, fy + 34).strokeColor(INK).stroke();
      doc.fillColor(INK).fontSize(9).font('Helvetica-Bold').text(managerName, 430, fy + 38, { width: 125, align: 'center' });
      doc.fillColor(MUTED).fontSize(7.5).font('Helvetica').text('Manajer Operasional', 430, fy + 49, { width: 125, align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePdfBuffer };
