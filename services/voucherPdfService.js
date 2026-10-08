/**
 * Service: PDF Voucher Batch (PDFKit, A4 portrait) — tema bersama (pdfBranding).
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const { THEME, resolveLogoPath, companyInfo, fmtRp } = require('./pdfBranding');

function generateVoucherBatchPdfBuffer(batch, vouchers, settings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const ci = companyInfo(settings);
      const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Voucher Batch #${batch.id}`, Author: ci.name, Subject: 'Voucher Hotspot' } });
      const bufs = [];
      doc.on('data', b => bufs.push(b)); doc.on('end', () => resolve(Buffer.concat(bufs))); doc.on('error', reject);

      const { INK, MUTED, LINE, SOFT, GREEN, RED, AMBER, BLUE, ACCENT, LIGHT } = THEME;
      const LEFT = 40, RIGHT = 555, W = RIGHT - LEFT;
      const HEADH = 74;
      const list = Array.isArray(vouchers) ? vouchers : [];
      const price = Number(batch.price || 0);

      function drawHeader() {
        doc.rect(0, 0, 595.28, HEADH).fill(INK); doc.rect(0, HEADH, 595.28, 3).fill(ACCENT);
        let x = LEFT; const lp = resolveLogoPath(settings);
        if (lp && fs.existsSync(lp)) { try { doc.image(lp, LEFT, 18, { fit: [110, 34] }); x = LEFT + 122; } catch (e) {} }
        doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text(ci.name, x, 18, { width: 205, lineBreak: false });
        doc.fillColor(LIGHT).fontSize(8).font('Helvetica').text(ci.address, x, 37, { width: 205, height: 11, ellipsis: true });
        doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text('VOUCHER', LEFT, 18, { width: W, align: 'right' });
        doc.fillColor(ACCENT).fontSize(9).font('Helvetica-Bold').text(`Batch #${batch.id} • ${batch.profile_name || ''}`, LEFT, 40, { width: W, align: 'right' });
        return HEADH + 3;
      }

      let y = drawHeader() + 14;
      doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(
        `Profil: ${batch.profile_name || '-'}   •   Harga: ${fmtRp(price)}   •   Masa aktif: ${batch.validity || '-'}   •   Router: ${batch.router_name || '-'}   •   Jumlah: ${list.length}   •   Dicetak: ${new Date().toLocaleString('id-ID')}`,
        LEFT, y, { width: W });
      y += 22;

      const cols = 3, gap = 8;
      const cardW = (W - (cols - 1) * gap) / cols;
      const cardH = 74, rowGap = 8;
      let col = 0;
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        if (col === 0 && y + cardH > 758) { doc.addPage(); y = drawHeader() + 14; }
        const cx = LEFT + col * (cardW + gap);
        doc.roundedRect(cx, y, cardW, cardH, 8).fillAndStroke('#ffffff', LINE);
        doc.rect(cx, y, cardW, 15).fill(INK);
        doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold').text(ci.name, cx + 7, y + 4, { width: cardW - 14, ellipsis: true, lineBreak: false });
        doc.fillColor(INK).fontSize(13).font('Helvetica-Bold').text(String(v.code || '-'), cx + 6, y + 22, { width: cardW - 12, align: 'center' });
        doc.fillColor(MUTED).fontSize(8).font('Helvetica').text('PIN: ' + String(v.password || '-'), cx + 6, y + 41, { width: cardW - 12, align: 'center' });
        const sub = `${batch.profile_name || ''} • ${fmtRp(price)}${batch.validity ? (' • ' + batch.validity) : ''}`;
        doc.fillColor(AMBER).fontSize(7).font('Helvetica-Bold').text(sub, cx + 5, y + 58, { width: cardW - 10, align: 'center', ellipsis: true, lineBreak: false });
        col++;
        if (col >= cols) { col = 0; y += cardH + rowGap; }
      }
      if (list.length === 0) {
        doc.fillColor(MUTED).fontSize(10).font('Helvetica').text('Belum ada voucher pada batch ini.', LEFT, y, { width: W, align: 'center' });
      }

      // Footer + nomor halaman
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor(MUTED).fontSize(7).font('Helvetica').text(`${ci.name} • Voucher Batch #${batch.id} • Halaman ${i - range.start + 1}/${range.count}`, LEFT, 812, { width: W, align: 'center' });
      }

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { generateVoucherBatchPdfBuffer };
