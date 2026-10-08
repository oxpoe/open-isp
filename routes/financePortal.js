const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { getSetting, getSettings, getNowLocal, formatDateLocal } = require('../config/settingsManager');
const sidebarMenuSvc = require('../services/sidebarMenuService');

// Helper untuk menampilkan notifikasi sukses/error
function flashMsg(req) {
  const m = req.session._msg;
  delete req.session._msg;
  return m || null;
}

function company() { return getSetting('company_header', 'ISP Admin'); }

// Pastikan hanya admin & kasir yang bisa akses
function requireAdminSession(req, res, next) {
  if (req.session?.isAdmin || req.session?.isCashier) return next();
  return res.redirect('/admin/login');
}

router.use(requireAdminSession);

router.use((req, res, next) => {
  res.locals.session = req.session;
  res.locals.sidebarSections = sidebarMenuSvc.getSidebarSections(req.session);
  res.locals.sidebarBottomNavItems = sidebarMenuSvc.getBottomNavItems(req.session);
  res.locals.settings = getSettings();
  res.locals.company = company();
  res.locals.lang = req.session?.lang || 'id';
  res.locals.getNowLocal = getNowLocal;
  res.locals.formatDateLocal = formatDateLocal;
  next();
});

// ─── KATEGORI PENGELUARAN ──────────────────────────────────────────────
router.get('/expense-categories', (req, res) => {
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY name ASC').all();
  res.render('admin/finance/expense_categories', {
    activePage: 'expense_categories',
    categories,
    msg: flashMsg(req)
  });
});

router.post('/expense-categories', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { name, description, icon, color } = req.body;
    db.prepare(`INSERT INTO expense_categories (name, description, icon, color) VALUES (?, ?, ?, ?)`).run(name, description, icon || 'bi bi-tag', color || '#6366f1');
    req.session._msg = { type: 'success', text: 'Kategori berhasil ditambahkan' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal: ' + e.message };
  }
  res.redirect('/admin/finance/expense-categories');
});

router.post('/expense-categories/:id/delete', (req, res) => {
  try {
    db.prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
    req.session._msg = { type: 'success', text: 'Kategori berhasil dihapus' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal dihapus (mungkin sedang digunakan)' };
  }
  res.redirect('/admin/finance/expense-categories');
});

// ─── PENGELUARAN (CASH OUT) ────────────────────────────────────────────
router.get('/expenses', (req, res) => {
  const expenses = db.prepare(`
    SELECT e.*, c.color as category_color, c.icon as category_icon 
    FROM expenses e 
    LEFT JOIN expense_categories c ON c.name = e.category 
    ORDER BY e.date DESC, e.id DESC LIMIT 500
  `).all();
  
  const categories = db.prepare('SELECT * FROM expense_categories ORDER BY name ASC').all();
  
  res.render('admin/finance/expenses', {
    activePage: 'expenses',
    expenses,
    categories,
    msg: flashMsg(req)
  });
});

router.post('/expenses', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { date, category, amount, description, payment_method, receipt_number, vendor } = req.body;
    const cleanAmount = String(amount).replace(/[^0-9]/g, ''); // bersihkan format rupiah
    const recorded_by_name = req.session.cashierName ? `Kasir ${req.session.cashierName}` : 'Admin';
    
    db.prepare(`
      INSERT INTO expenses (date, category, amount, description, payment_method, receipt_number, vendor, recorded_by_name) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(date, category, cleanAmount, description, payment_method, receipt_number, vendor, recorded_by_name);
    
    req.session._msg = { type: 'success', text: 'Pengeluaran berhasil dicatat' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal mencatat pengeluaran: ' + e.message };
  }
  res.redirect('/admin/finance/expenses');
});

router.post('/expenses/:id/delete', (req, res) => {
  try {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    req.session._msg = { type: 'success', text: 'Data berhasil dihapus' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal dihapus' };
  }
  res.redirect('/admin/finance/expenses');
});

// ─── KAS MASUK (CASH IN) ───────────────────────────────────────────────
router.get('/cash-in', (req, res) => {
  const cashIn = db.prepare(`SELECT * FROM cash_in ORDER BY date DESC, id DESC LIMIT 500`).all();
  res.render('admin/finance/cash_in', {
    activePage: 'cash_in',
    cashIn,
    msg: flashMsg(req)
  });
});

router.post('/cash-in', express.urlencoded({ extended: true }), (req, res) => {
  try {
    const { date, category, amount, description, payment_method, receipt_number } = req.body;
    const cleanAmount = String(amount).replace(/[^0-9]/g, ''); // bersihkan format rupiah
    const recorded_by_name = req.session.cashierName ? `Kasir ${req.session.cashierName}` : 'Admin';
    
    db.prepare(`
      INSERT INTO cash_in (date, category, amount, description, payment_method, receipt_number, recorded_by_name) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(date, category, cleanAmount, description, payment_method, receipt_number, recorded_by_name);
    
    req.session._msg = { type: 'success', text: 'Kas Masuk berhasil dicatat' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal mencatat Kas Masuk: ' + e.message };
  }
  res.redirect('/admin/finance/cash-in');
});

router.post('/cash-in/:id/delete', (req, res) => {
  try {
    db.prepare('DELETE FROM cash_in WHERE id = ?').run(req.params.id);
    req.session._msg = { type: 'success', text: 'Data berhasil dihapus' };
  } catch(e) {
    req.session._msg = { type: 'error', text: 'Gagal dihapus' };
  }
  res.redirect('/admin/finance/cash-in');
});

module.exports = router;
