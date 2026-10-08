/**
 * Migration Script: Add Photo Fields to Attendance Table
 * Run this once to update existing database
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../database/billing.db');
const db = new Database(dbPath);

console.log('🔄 Starting migration: Add photo fields to attendance table...');

try {
  // Check if columns already exist
  const tableInfo = db.prepare("PRAGMA table_info(attendance)").all();
  const columnNames = tableInfo.map(col => col.name);
  
  const hasCheckInPhoto = columnNames.includes('check_in_photo');
  const hasCheckOutPhoto = columnNames.includes('check_out_photo');
  
  if (hasCheckInPhoto && hasCheckOutPhoto) {
    console.log('✅ Migration already applied. All columns exist.');
    process.exit(0);
  }
  
  // Add columns if they don't exist
  if (!hasCheckInPhoto) {
    console.log('➕ Adding column: check_in_photo');
    db.exec("ALTER TABLE attendance ADD COLUMN check_in_photo TEXT DEFAULT ''");
  }
  
  if (!hasCheckOutPhoto) {
    console.log('➕ Adding column: check_out_photo');
    db.exec("ALTER TABLE attendance ADD COLUMN check_out_photo TEXT DEFAULT ''");
  }
  
  console.log('✅ Migration completed successfully!');
  console.log('');
  console.log('New columns added:');
  console.log('  - check_in_photo: Path foto saat check-in');
  console.log('  - check_out_photo: Path foto saat check-out');
  
} catch (error) {
  console.error('❌ Migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}