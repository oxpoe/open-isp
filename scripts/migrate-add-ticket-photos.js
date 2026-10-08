/**
 * Migration Script: Add Photo Fields to Tickets Table
 * Run this once to update existing database
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/billing.db');
const db = new Database(dbPath);

console.log('🔄 Starting migration: Add photo fields to tickets table...');

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(tickets)").all();
  const columnNames = tableInfo.map(col => col.name);
  
  const hasNotes = columnNames.includes('technician_notes');
  const hasPhotos = columnNames.includes('photos');
  const hasMetadata = columnNames.includes('photo_metadata');
  const hasCustomerPhotos = columnNames.includes('customer_photos');
  const hasCustomerMetadata = columnNames.includes('customer_photo_metadata');
  
  if (hasNotes && hasPhotos && hasMetadata && hasCustomerPhotos && hasCustomerMetadata) {
    console.log('✅ Migration already applied. All columns exist.');
    process.exit(0);
  }
  
  // Add columns if they don't exist
  if (!hasNotes) {
    console.log('➕ Adding column: technician_notes');
    db.exec("ALTER TABLE tickets ADD COLUMN technician_notes TEXT DEFAULT ''");
  }
  
  if (!hasPhotos) {
    console.log('➕ Adding column: photos');
    db.exec("ALTER TABLE tickets ADD COLUMN photos TEXT DEFAULT ''");
  }
  
  if (!hasMetadata) {
    console.log('➕ Adding column: photo_metadata');
    db.exec("ALTER TABLE tickets ADD COLUMN photo_metadata TEXT DEFAULT ''");
  }
  
  if (!hasCustomerPhotos) {
    console.log('➕ Adding column: customer_photos');
    db.exec("ALTER TABLE tickets ADD COLUMN customer_photos TEXT DEFAULT ''");
  }
  
  if (!hasCustomerMetadata) {
    console.log('➕ Adding column: customer_photo_metadata');
    db.exec("ALTER TABLE tickets ADD COLUMN customer_photo_metadata TEXT DEFAULT ''");
  }
  
  console.log('✅ Migration completed successfully!');
  console.log('');
  console.log('New columns added:');
  console.log('  - technician_notes: Catatan teknisi saat menyelesaikan tugas');
  console.log('  - photos: JSON array path foto yang diupload teknisi');
  console.log('  - photo_metadata: JSON array metadata foto teknisi (timestamp, GPS, dll)');
  console.log('  - customer_photos: JSON array path foto yang diupload pelanggan');
  console.log('  - customer_photo_metadata: JSON array metadata foto pelanggan');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
