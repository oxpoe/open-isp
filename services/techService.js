const db = require('../config/database');

function authenticate(username, password) {
  const tech = db.prepare('SELECT * FROM technicians WHERE username = ? AND password = ? AND is_active = 1').get(username, password);
  return tech;
}

function getTechById(id) {
  return db.prepare('SELECT id, username, name, phone, area FROM technicians WHERE id = ?').get(id);
}

function getTechStats(techId) {
  const total = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE technician_id = ?").get(techId).count;
  const inProgress = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE technician_id = ? AND status = 'in_progress'").get(techId).count;
  const resolved = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE technician_id = ? AND status = 'resolved'").get(techId).count;
  
  // Ambil open tickets yang belum ada teknisinya atau di-assign ke teknisi ini
  const open = db.prepare("SELECT COUNT(*) as count FROM tickets WHERE status = 'open'").get().count;

  return { total, open, inProgress, resolved };
}

function getAssignedTickets(techId) {
  return db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address 
    FROM tickets t 
    JOIN customers c ON t.customer_id = c.id 
    WHERE t.technician_id = ? AND t.status != 'resolved'
    ORDER BY t.created_at DESC
  `).all(techId);
}

function getOpenTickets() {
  return db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address 
    FROM tickets t 
    JOIN customers c ON t.customer_id = c.id 
    WHERE t.status = 'open'
    ORDER BY t.created_at DESC
  `).all();
}

function getResolvedTickets(techId) {
  return db.prepare(`
    SELECT t.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address 
    FROM tickets t 
    JOIN customers c ON t.customer_id = c.id 
    WHERE t.technician_id = ? AND t.status = 'resolved'
    ORDER BY t.updated_at DESC LIMIT 50
  `).all(techId);
}

function takeTicket(ticketId, techId) {
  let validTechId = Number(techId);
  const exists = db.prepare('SELECT id FROM technicians WHERE id = ?').get(validTechId);
  if (!exists) {
    const fallback = db.prepare('SELECT id FROM technicians WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get();
    if (fallback) validTechId = fallback.id;
  }
  db.prepare("UPDATE tickets SET technician_id = ?, status = 'in_progress', updated_at = (NOW_LOCAL()) WHERE id = ?").run(validTechId, ticketId);
  return validTechId;
}

function updateTicketStatus(ticketId, techId, status, extraData = {}) {
  const { notes, photos, photoMetadata } = extraData;
  
  const updates = ['status = ?', 'updated_at = (NOW_LOCAL())'];
  const params = [status];
  
  if (techId) {
    updates.push('technician_id = COALESCE(technician_id, ?)');
    params.push(techId);
  }
  if (notes !== undefined) {
    updates.push('technician_notes = ?');
    params.push(notes);
  }
  if (photos !== undefined) {
    updates.push('photos = ?');
    params.push(photos);
  }
  if (photoMetadata !== undefined) {
    updates.push('photo_metadata = ?');
    params.push(photoMetadata);
  }
  
  params.push(ticketId);
  const sql = `UPDATE tickets SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);
}

// Admin helper
function getAllTechnicians() {
  return db.prepare('SELECT id, username, name, phone, area, is_active FROM technicians').all();
}

function createTechnician(data) {
  const stmt = db.prepare('INSERT INTO technicians (username, password, name, phone, area) VALUES (?, ?, ?, ?, ?)');
  return stmt.run(data.username, data.password, data.name, data.phone || '', data.area || '');
}

module.exports = {
  authenticate,
  getTechById,
  getTechStats,
  getAssignedTickets,
  getOpenTickets,
  getResolvedTickets,
  takeTicket,
  updateTicketStatus,
  getAllTechnicians,
  createTechnician
};
