const express = require('express');
const router = express.Router();
const { getSetting, getCurrentDateInTimezone, getSettings, formatDateLocal, getNowLocal, formatTimeLocal, parseDateInTimezone } = require('../config/settingsManager');
const { logger } = require('../config/logger');
const db = require('../config/database');
const billingSvc = require('../services/billingService');
const customerSvc = require('../services/customerService');
const adminSvc = require('../services/adminService');
const attendanceSvc = require('../services/attendanceService');
const pdfSvc = require('../services/pdfInvoiceService');
const whatsappService = require('../services/whatsappService');
const { uploadAttendance, removeAttendanceFile } = require('../middleware/attendanceUpload');

function requireCollectorSession(req, res, next) {
  if (req.session && req.session.isCollector && req.session.collectorId) return next();
  return res.redirect('/collector/login');
}

function company() {
  return getSetting('company_header', 'ISP App');
}

function flashMsg(req) {
  const m = req.session._msg;
  delete req.session._msg;
  return m || null;
}

router.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.settings = getSettings();
  res.locals.formatDateLocal = formatDateLocal;
  res.locals.formatTimeLocal = formatTimeLocal;
  res.locals.parseDateInTimezone = parseDateInTimezone;
  res.locals.getNowLocal = getNowLocal;
  next();
});

let loginRateLimiter = (req, res, next) => next();
try {
  const rlMod = require('../middleware/rateLimiter');
  if (rlMod && typeof rlMod.loginRateLimiter === 'function') {
    loginRateLimiter = rlMod.loginRateLimiter;
  }
} catch (e) {}

router.get('/login', (req, res) => {
  if (req.session && req.session.isCollector) return res.redirect('/collector');
  res.render('collector/login', { title: 'Login Kolektor', company: company(), error: null });
});

router.post('/login', loginRateLimiter, express.urlencoded({ extended: true }), (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const collector = adminSvc.authenticateCollector(username, password);
  if (collector) {
    req.session.isCollector = true;
    req.session.collectorId = collector.id;
    req.session.collectorName = collector.name;
    req.session.collectorUsername = collector.username;
    req.session.collectorArea = collector.area || '';
    return res.redirect('/collector');
  }
  return res.render('collector/login', { title: 'Login Kolektor', company: company(), error: 'Username atau password salah!' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/collector/login');
});

// ─── COLLECTOR ATTENDANCE ────────────────────────────────────────────────────
router.get('/attendance', requireCollectorSession, (req, res) => {
  try {
    const collectorId = req.session.collectorId;
    const collectorName = req.session.collectorName;
    
    const todayAttendance = attendanceSvc.getTodayAttendance('collector', collectorId);
    const history = attendanceSvc.getAttendanceHistory('collector', collectorId, 10);
    
    const now = getCurrentDateInTimezone();
    const summary = attendanceSvc.getMonthlyAttendanceSummary(
      'collector', 
      collectorId, 
      now.getFullYear(), 
      now.getMonth() + 1
    );
    
    res.render('collector/attendance', {
      title: 'Absensi',
      company: company(),
      activePage: 'attendance',
      collectorName,
      todayAttendance,
      history,
      summary,
      msg: flashMsg(req)
    });
  } catch (e) {
    req.session._msg = { type: 'error', text: 'Gagal memuat absensi: ' + e.message };
    res.redirect('/collector');
  }
});

router.post('/attendance/checkin', requireCollectorSession, uploadAttendance.single('photo'), (req, res) => {
  try {
    const collectorId = req.session.collectorId;
    const collectorName = req.session.collectorName;

    if (!req.file) {
      return res.json({ success: false, message: 'Foto check-in wajib diunggah' });
    }
    
    const today = attendanceSvc.getTodayAttendance('collector', collectorId);
    if (today) {
      removeAttendanceFile(req.file);
      return res.json({ success: false, message: 'Anda sudah melakukan check-in hari ini' });
    }
    
    const result = attendanceSvc.checkIn({
      employee_type: 'collector',
      employee_id: collectorId,
      employee_name: collectorName,
      lat: req.body.lat || '',
      lng: req.body.lng || '',
      note: req.body.note || '',
      photo: req.file ? '/uploads/attendance/' + req.file.filename : ''
    });
    
    res.json({ success: true, message: 'Check-in berhasil!', id: result.lastInsertRowid });
  } catch (e) {
    removeAttendanceFile(req.file);
    res.json({ success: false, message: 'Gagal check-in: ' + e.message });
  }
});

router.post('/attendance/checkout', requireCollectorSession, uploadAttendance.single('photo'), (req, res) => {
  try {
    const collectorId = req.session.collectorId;

    if (!req.file) {
      return res.json({ success: false, message: 'Foto check-out wajib diunggah' });
    }
    
    const today = attendanceSvc.getTodayAttendance('collector', collectorId);
    if (!today) {
      removeAttendanceFile(req.file);
      return res.json({ success: false, message: 'Anda belum check-in hari ini' });
    }
    
    if (today.status === 'checked_out') {
      removeAttendanceFile(req.file);
      return res.json({ success: false, message: 'Anda sudah check-out hari ini' });
    }
    
    attendanceSvc.checkOut(today.id, {
      lat: req.body.lat || '',
      lng: req.body.lng || '',
      note: req.body.note || '',
      photo: req.file ? '/uploads/attendance/' + req.file.filename : ''
    });
    
    res.json({ success: true, message: 'Check-out berhasil!' });
  } catch (e) {
    removeAttendanceFile(req.file);
    res.json({ success: false, message: 'Gagal check-out: ' + e.message });
  }
});

router.get('/', requireCollectorSession, (req, res) => {
  const now = new Date();
  const month = Math.max(1, Math.min(12, parseInt(req.query.month || (now.getMonth() + 1), 10) || (now.getMonth() + 1)));
  const year = parseInt(req.query.year || now.getFullYear(), 10) || now.getFullYear();
  const status = String(req.query.status || 'all').trim(); // all, unpaid, paid
  const search = String(req.query.search || '').trim();
  const scope = String(req.query.scope || '').trim(); // today, unpaid, isolir, multi, all
  const todayDay = now.getDate();

  const collectorId = Number(req.session.collectorId || 0);
  const collectorObj = db.prepare('SELECT area FROM collectors WHERE id = ?').get(collectorId);
  const collectorArea = String(collectorObj?.area || req.session.collectorArea || '').trim();
  req.session.collectorArea = collectorArea;

  let collectorWhere = '(c.collector_id = ? OR c.collector_id IS NULL)';
  let collectorParams = [collectorId];
  if (collectorArea) {
    collectorWhere = '(c.collector_id = ? OR ((c.collector_id IS NULL OR c.collector_id = 0) AND LOWER(TRIM(c.area)) = LOWER(TRIM(?))))';
    collectorParams = [collectorId, collectorArea];
  }
  
  let q = `
    SELECT c.id as customer_id,
           c.name as customer_name,
           c.phone as customer_phone,
           c.address as customer_address,
           c.area as customer_area,
           c.pppoe_username,
           c.genieacs_tag,
           c.connection_type,
           c.static_ip,
           c.status as customer_status,
           c.install_date,
           c.isolate_day,
           c.lat, c.lng,
           c.collector_id,
           p.name as package_name,
           p.price as package_price,
           r.name as router_name,
           i.id as invoice_id,
           i.status as invoice_status,
           i.amount as invoice_amount,
           i.period_month,
           i.period_year
    FROM customers c
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN routers r ON c.router_id = r.id
    LEFT JOIN invoices i ON i.customer_id = c.id AND i.period_month = ? AND i.period_year = ?
    WHERE ${collectorWhere}
  `;
  const params = [month, year, ...collectorParams];

  if (scope === 'today') {
    q += ' AND c.isolate_day = ?';
    params.push(todayDay);
  } else if (scope === 'isolir') {
    q += " AND c.status = 'suspended'";
  } else if (scope === 'unpaid') {
    q += " AND (i.status = 'unpaid' OR i.status IS NULL)";
  } else if (scope === 'paid') {
    q += " AND i.status = 'paid'";
  } else if (scope === 'multi') {
    q += `
      AND c.id IN (
        SELECT customer_id FROM invoices
        WHERE status='unpaid'
        GROUP BY customer_id
        HAVING COUNT(1) > 1
      )
    `;
  }

  if (status === 'unpaid') {
    q += " AND (i.status = 'unpaid' OR i.status IS NULL)";
  } else if (status === 'paid') {
    q += " AND i.status = 'paid'";
  }

  if (search) {
    q += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.area LIKE ? OR c.genieacs_tag LIKE ? OR c.pppoe_username LIKE ? OR c.customer_code LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }
  q += ' ORDER BY c.name ASC, c.id DESC LIMIT 500';
  const list = db.prepare(q).all(...params);

  const summaryPeriod = db.prepare(`
    SELECT
      COUNT(DISTINCT c.id) as total_customer_count,
      SUM(CASE WHEN (i.status='unpaid' OR i.status IS NULL) THEN 1 ELSE 0 END) as unpaid_count,
      SUM(CASE WHEN (i.status='unpaid' OR i.status IS NULL) THEN COALESCE(i.amount, p.price, 0) ELSE 0 END) as unpaid_total,
      SUM(CASE WHEN (i.status='unpaid' OR i.status IS NULL) AND c.isolate_day=? THEN 1 ELSE 0 END) as today_count,
      SUM(CASE WHEN (i.status='unpaid' OR i.status IS NULL) AND c.isolate_day=? THEN COALESCE(i.amount, p.price, 0) ELSE 0 END) as today_total,
      SUM(CASE WHEN c.status='suspended' THEN 1 ELSE 0 END) as isolir_count,
      SUM(CASE WHEN c.status='suspended' THEN COALESCE(i.amount, p.price, 0) ELSE 0 END) as isolir_total
    FROM customers c
    LEFT JOIN packages p ON c.package_id = p.id
    LEFT JOIN invoices i ON i.customer_id = c.id AND i.period_month=? AND i.period_year=?
    WHERE ${collectorWhere}
  `).get(todayDay, todayDay, month, year, ...collectorParams) || {};

  const summaryMulti = db.prepare(`
    SELECT
      COUNT(1) as multi_customer_count,
      SUM(x.cnt) as multi_invoice_count,
      SUM(x.total_amount) as multi_total
    FROM (
      SELECT i.customer_id, COUNT(1) as cnt, SUM(i.amount) as total_amount
      FROM invoices i
      JOIN customers c ON i.customer_id = c.id
      WHERE i.status='unpaid'
        AND ${collectorWhere}
      GROUP BY i.customer_id
      HAVING COUNT(1) > 1
    ) x
  `).get(...collectorParams) || {};

  const summary = { ...summaryPeriod, ...summaryMulti };

  const customerIds = list.map(c => Number(c?.customer_id || 0)).filter(n => Number.isFinite(n) && n > 0);
  const pendingMap = new Map();
  if (customerIds.length > 0) {
    const placeholders = customerIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT r.*
      FROM collector_payment_requests r
      WHERE r.customer_id IN (${placeholders})
      ORDER BY r.id DESC
    `).all(...customerIds);
    for (const r of rows) {
      const cid = Number(r.customer_id || 0);
      const invId = Number(r.invoice_id || 0);
      if (invId > 0 && !pendingMap.has('inv_' + invId)) pendingMap.set('inv_' + invId, r);
      if (cid > 0 && !pendingMap.has('cust_' + cid)) pendingMap.set('cust_' + cid, r);
    }
  }

  const myReqs = db.prepare(`
    SELECT r.*, i.period_month, i.period_year, i.amount as invoice_amount, c.name as customer_name, c.phone as customer_phone
    FROM collector_payment_requests r
    JOIN invoices i ON i.id = r.invoice_id
    JOIN customers c ON c.id = r.customer_id
    WHERE r.collector_id = ?
    ORDER BY r.id DESC
    LIMIT 60
  `).all(collectorId);

  res.render('collector/dashboard', {
    title: 'Dashboard Kolektor',
    company: company(),
    month,
    year,
    status,
    search,
    scope,
    todayDay,
    summary,
    invoices: list,
    pendingMap,
    myReqs,
    msg: flashMsg(req)
  });
});

router.post('/payment-request', requireCollectorSession, express.urlencoded({ extended: true }), async (req, res) => {
  try {
    let invoiceId = Number(req.body.invoice_id || 0);
    const customerId = Number(req.body.customer_id || 0);
    const m = Number(req.body.month || (new Date().getMonth() + 1));
    const y = Number(req.body.year || new Date().getFullYear());
    const note = String(req.body.note || '').trim();

    // If invoice doesn't exist yet, auto generate invoice on-the-fly!
    if ((!invoiceId || invoiceId <= 0) && customerId > 0) {
      const genResult = billingSvc.generateInvoiceForCustomer(customerId, m, y);
      invoiceId = Number(genResult.invoiceId || 0);
    }

    if (!Number.isFinite(invoiceId) || invoiceId <= 0) throw new Error('Tagihan / Invoice tidak valid');

    const inv = billingSvc.getInvoiceById(invoiceId);
    if (!inv) throw new Error('Tagihan tidak ditemukan');
    if (String(inv.status || '').toLowerCase() === 'paid') throw new Error('Tagihan sudah lunas');

    const existingPending = db.prepare(`
      SELECT id FROM collector_payment_requests
      WHERE invoice_id = ? AND status = 'pending'
      ORDER BY id DESC LIMIT 1
    `).get(invoiceId);
    if (existingPending) throw new Error('Tagihan ini sudah pernah diajukan dan masih menunggu approval');

    const collectorId = Number(req.session.collectorId || 0);
    const amount = Math.max(0, Number(inv.amount || 0) || 0);
    if (amount <= 0) throw new Error('Nominal tagihan tidak valid');

    // Check if auto-approve is enabled for this collector
    const collector = db.prepare('SELECT auto_approve FROM collectors WHERE id = ?').get(collectorId);
    const autoApproveEnabled = collector && collector.auto_approve === 1;

    if (autoApproveEnabled) {
      // Auto-approve: directly mark invoice as paid
      const collectorName = String(req.session.collectorName || '').trim();
      const collectorUsername = String(req.session.collectorUsername || '').trim();
      const collectorLabel = `Kolektor ${collectorName}${collectorUsername ? ` (@${collectorUsername})` : ''}`;
      
      const notesParts = [
        'Via Kolektor',
        collectorLabel,
        'Auto-Approved (Kolektor Setting Aktif)'
      ];
      if (note) notesParts.push(note);
      const notes = notesParts.join(' | ');

      // Mark invoice as paid
      billingSvc.markAsPaid(invoiceId, collectorLabel, notes);

      // Insert request with approved status
      db.prepare(`
        INSERT INTO collector_payment_requests (collector_id, invoice_id, customer_id, amount, note, status, decided_by_role, decided_by_name, decided_note, decided_at)
        VALUES (?, ?, ?, ?, ?, 'approved', 'system', 'Auto-Approve', 'Otomatis disetujui (kolektor setting aktif)', (NOW_LOCAL()))
      `).run(collectorId, invoiceId, Number(inv.customer_id || 0), amount, note);

      // Auto-unisolate if customer status is currently suspended and NO MORE unpaid invoices remain
      const customer = customerSvc.getCustomerById(inv.customer_id);
      let unisolatedText = '';
      if (customer && customer.status === 'suspended') {
        const unpaidCount = db.prepare("SELECT COUNT(*) as cnt FROM invoices WHERE customer_id=? AND status='unpaid'").get(inv.customer_id)?.cnt || 0;
        if (unpaidCount === 0) {
          try {
            await customerSvc.activateCustomer(customer.id);
            unisolatedText = ' dan layanan pelanggan di-unisolate';
            logger.info(`[Collector Auto-Approve] Customer ${customer.id} (${customer.name}) auto-unisolated on payment.`);
          } catch (actErr) {
            logger.error(`[Collector Auto-Approve] Failed to auto-activate customer ${customer.id}:`, actErr);
          }
        } else {
          logger.info(`[Collector Auto-Approve] Customer ${customer.id} (${customer.name}) remains suspended because ${unpaidCount} unpaid invoice(s) still exist.`);
        }
      }

      // Send WhatsApp notification to customer
      if (customer && customer.phone) {
        const allSettings = getSettings();
        const appUrl = (allSettings.public_base_url || '').replace(/\/$/, '');
        const portalUrl = appUrl ? `${appUrl}/customer` : '';
        const template = db.getAppSetting('whatsapp_payment_success_message', '');

        const msg = whatsappService.formatPaymentSuccessMessage({
          customerName: customer.name,
          invoiceId: inv.id,
          customerUsername: customer.pppoe_username || customer.id || '-',
          customerCode: customer.customer_code || '',
          packageName: customer.package_name || '-',
          periodMonth: inv.period_month,
          periodYear: inv.period_year,
          amount: inv.amount,
          paymentMethod: collectorLabel || 'Kolektor / Lapangan',
          paidAt: new Date(),
          companyName: allSettings.company_header || 'OPEN-ISP',
          companyPhone: allSettings.company_phone || '',
          portalUrl,
          customTemplate: template
        });

        try {
          const waNotify = require('../services/waNotifyService');
          if (true) {
            await waNotify.sendText(customer.phone, msg);
          }
        } catch (e) {
          logger.error('Failed to send WA notification for auto-approved collector payment:', e);
        }
      }

      req.session._msg = { type: 'success', text: `Pembayaran berhasil diproses, tagihan lunas${unisolatedText}. <a href="/collector/invoice/${invoiceId}/print-thermal" target="_blank" class="btn btn-sm btn-dark ms-2 fw-bold"><i class="bi bi-printer"></i> Cetak Struk (Bluetooth Thermal)</a>` };
    } else {
      // Manual approval: insert as pending
      db.prepare(`
        INSERT INTO collector_payment_requests (collector_id, invoice_id, customer_id, amount, note, status)
        VALUES (?, ?, ?, ?, ?, 'pending')
      `).run(collectorId, invoiceId, Number(inv.customer_id || 0), amount, note);

      req.session._msg = { type: 'success', text: 'Berhasil. Status pembayaran menunggu approval Admin/Kasir.' };
    }
  } catch (e) {
    req.session._msg = { type: 'error', text: 'Gagal: ' + (e.message || String(e)) };
  }
  const qs = new URLSearchParams();
  if (req.body.month) qs.set('month', String(req.body.month));
  if (req.body.year) qs.set('year', String(req.body.year));
  if (req.body.status) qs.set('status', String(req.body.status));
  if (req.body.search) qs.set('search', String(req.body.search));
  const suffix = qs.toString() ? ('?' + qs.toString()) : '';
  res.redirect('/collector' + suffix);
});

// ─── THERMAL RECEIPT PRINT ROUTE (58mm/80mm Bluetooth Printer) ───────────────
router.get('/invoice/:id/print-thermal', requireCollectorSession, (req, res) => {
  try {
    const invoiceId = Number(req.params.id || 0);
    const invoice = billingSvc.getInvoiceById(invoiceId);
    if (!invoice) return res.status(404).send('Invoice tidak ditemukan');

    const customer = customerSvc.getCustomerById(invoice.customer_id);
    if (!customer) return res.status(404).send('Data pelanggan tidak ditemukan');
    const settings = getSettings();

    res.render('collector/print_thermal', {
      invoice,
      customer,
      settings,
      company: company(),
      collectorName: req.session.collectorName || 'Kolektor',
      formatDateLocal,
      formatTimeLocal,
      getNowLocal
    });
  } catch (e) {
    res.status(500).send('Error: ' + e.message);
  }
});

// ─── SEND INVOICE PDF VIA WHATSAPP ROUTE ──────────────────────────────────────
router.post('/invoice/:id/send-pdf-wa', requireCollectorSession, async (req, res) => {
  try {
    const invoiceId = Number(req.params.id || 0);
    const inv = billingSvc.getInvoiceById(invoiceId);
    if (!inv) return res.json({ success: false, message: 'Invoice tidak ditemukan' });

    const customer = customerSvc.getCustomerById(inv.customer_id);
    if (!customer || !customer.phone) return res.json({ success: false, message: 'Nomor HP pelanggan tidak valid' });

    const settings = getSettings();
    const pdfBuffer = await pdfSvc.generateInvoicePdfBuffer(inv, customer, settings);
    const filename = `Invoice_INV-${String(inv.id).padStart(4, '0')}.pdf`;
    const caption = `🧾 *FAKTUR / INVOICE LUNAS*\n\nYth. Bpk/Ibu *${customer.name}*,\nBerikut kami lampirkan dokumen Invoice LUNAS periode ${inv.period_month}/${inv.period_year}.\n\nTerima kasih atas pembayaran Anda.`;

    const waBot = require('../services/whatsappBot.mjs');
    const result = await waBot.waNotify.sendDocument(customer.phone, pdfBuffer, filename, caption);
    if (result && result.success) {
      return res.json({ success: true, message: 'Dokumen Invoice PDF berhasil dikirim via WhatsApp ke pelanggan!' });
    } else {
      return res.json({ success: false, message: result?.message || 'Gagal mengirim WA PDF' });
    }
  } catch (e) {
    return res.json({ success: false, message: 'Error: ' + e.message });
  }
});

module.exports = router;
