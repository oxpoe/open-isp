/**
 * Service: Manajemen Inventaris / Gudang (Warehouse)
 */
const db = require('../config/database');
const { logger } = require('../config/logger');

// ─── CATEGORIES ───────────────────────────────────────────────────────────
function getAllCategories() {
  return db.prepare('SELECT * FROM inventory_categories ORDER BY name ASC').all();
}

function createCategory(data) {
  const { name, description } = data;
  return db.prepare('INSERT INTO inventory_categories (name, description) VALUES (?, ?)').run(name, description);
}

function updateCategory(id, data) {
  const { name, description } = data;
  return db.prepare('UPDATE inventory_categories SET name = ?, description = ? WHERE id = ?').run(name, description, id);
}

function deleteCategory(id) {
  return db.prepare('DELETE FROM inventory_categories WHERE id = ?').run(id);
}

// ─── ITEMS ───────────────────────────────────────────────────────────────
function getAllItems(search = '') {
  let query = `
    SELECT i.*, c.name as category_name, 
           (SELECT SUM(quantity) FROM inventory_stock s WHERE s.item_id = i.id AND s.status = 'available') as stock_available,
           (SELECT SUM(quantity) FROM inventory_stock s WHERE s.item_id = i.id AND s.status = 'assigned') as stock_assigned
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
  `;
  const params = [];
  if (search) {
    query += ' WHERE i.name LIKE ? OR i.brand LIKE ? OR i.model LIKE ?';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY i.name ASC';
  return db.prepare(query).all(...params);
}

function getItemById(id) {
  return db.prepare(`
    SELECT i.*, c.name as category_name
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
    WHERE i.id = ?
  `).get(id);
}

function createItem(data) {
  const { category_id, name, brand, model, unit, min_stock, description } = data;
  return db.prepare(`
    INSERT INTO inventory_items (category_id, name, brand, model, unit, min_stock, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(category_id, name, brand, model, unit, min_stock, description);
}

function updateItem(id, data) {
  const { category_id, name, brand, model, unit, min_stock, description } = data;
  return db.prepare(`
    UPDATE inventory_items 
    SET category_id = ?, name = ?, brand = ?, model = ?, unit = ?, min_stock = ?, description = ?
    WHERE id = ?
  `).run(category_id, name, brand, model, unit, min_stock, description, id);
}

function deleteItem(id) {
  return db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
}

// ─── STOCK ───────────────────────────────────────────────────────────────
function getStockByItem(itemId) {
  return db.prepare(`
    SELECT s.*, cust.name as customer_name
    FROM inventory_stock s
    LEFT JOIN customers cust ON s.assigned_to_customer_id = cust.id
    WHERE s.item_id = ?
    ORDER BY s.created_at DESC
  `).all(itemId);
}

function addStock(data, actor = 'Admin') {
  const { item_id, serial_number, quantity, condition, location, note } = data;
  
  const run = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO inventory_stock (item_id, serial_number, quantity, condition, location, note)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(item_id, serial_number || null, quantity, condition || 'new', location || 'Gudang Utama', note || '');

    db.prepare(`
      INSERT INTO inventory_logs (item_id, stock_id, type, quantity, actor, note)
      VALUES (?, ?, 'in', ?, ?, ?)
    `).run(item_id, result.lastInsertRowid, quantity, actor, note || 'Stock Masuk');

    return result;
  });

  return run();
}

function assignStockToCustomer(stockId, customerId, actor = 'Admin', note = '') {
  const stock = db.prepare('SELECT * FROM inventory_stock WHERE id = ?').get(stockId);
  if (!stock) throw new Error('Stock tidak ditemukan');
  if (stock.status === 'assigned') throw new Error('Stock sudah terpasang di pelanggan lain');

  const run = db.transaction(() => {
    db.prepare(`
      UPDATE inventory_stock 
      SET status = 'assigned', assigned_to_customer_id = ?, updated_at = (NOW_LOCAL())
      WHERE id = ?
    `).run(customerId, stockId);

    db.prepare(`
      INSERT INTO inventory_logs (item_id, stock_id, type, quantity, actor, note)
      VALUES (?, ?, 'out', ?, ?, ?)
    `).run(stock.item_id, stockId, stock.quantity, actor, note || `Terpasang ke pelanggan ID: ${customerId}`);
  });

  return run();
}

function adjustStock(stockId, newQuantity, note, actor = 'Admin') {
  const stock = db.prepare('SELECT * FROM inventory_stock WHERE id = ?').get(stockId);
  if (!stock) throw new Error('Stock tidak ditemukan');

  const run = db.transaction(() => {
    const diff = newQuantity - stock.quantity;
    db.prepare('UPDATE inventory_stock SET quantity = ?, updated_at = (NOW_LOCAL()) WHERE id = ?').run(newQuantity, stockId);

    db.prepare(`
      INSERT INTO inventory_logs (item_id, stock_id, type, quantity, actor, note)
      VALUES (?, ?, 'adjust', ?, ?, ?)
    `).run(stock.item_id, stockId, diff, actor, note || 'Penyesuaian Stock');
  });

  return run();
}

function getInventoryLogs(limit = 100) {
  return db.prepare(`
    SELECT l.*, i.name as item_name, s.serial_number
    FROM inventory_logs l
    LEFT JOIN inventory_items i ON l.item_id = i.id
    LEFT JOIN inventory_stock s ON l.stock_id = s.id
    ORDER BY l.created_at DESC
    LIMIT ?
  `).all(limit);
}

function getLowStockItems() {
  return db.prepare(`
    SELECT i.*, c.name as category_name, SUM(s.quantity) as current_stock
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON i.category_id = c.id
    LEFT JOIN inventory_stock s ON s.item_id = i.id AND s.status = 'available'
    GROUP BY i.id
    HAVING current_stock <= i.min_stock OR current_stock IS NULL
  `).all();
}

module.exports = {
  getAllCategories, createCategory, updateCategory, deleteCategory,
  getAllItems, getItemById, createItem, updateItem, deleteItem,
  getStockByItem, addStock, assignStockToCustomer, adjustStock,
  getInventoryLogs, getLowStockItems
};
