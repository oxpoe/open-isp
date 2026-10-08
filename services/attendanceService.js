const db = require('../config/database');
const { getSetting, getCurrentDateInTimezone, parseDateInTimezone } = require('../config/settingsManager');

/**
 * ATTENDANCE SERVICE
 * Mengelola absensi karyawan (teknisi, admin, cashier, collector)
 */

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c * 1000; // Convert to meters
  return distance;
}

// Validate if location is within allowed radius
function validateLocation(lat, lng) {
  // Get office location from settings
  const officeLat = parseFloat(getSetting('office_lat', '0'));
  const officeLng = parseFloat(getSetting('office_lng', '0'));
  const allowedRadius = parseInt(getSetting('attendance_radius', '100')); // Default 100 meters
  const geofencingEnabled = getSetting('attendance_geofencing', 'true') === 'true';
  
  // If geofencing disabled or office location not set, allow all
  if (!geofencingEnabled || !officeLat || !officeLng) {
    return { valid: true, distance: 0, message: 'Geofencing disabled' };
  }
  
  // If no GPS provided
  if (!lat || !lng) {
    return { valid: false, distance: 0, message: 'GPS location required' };
  }
  
  // Calculate distance
  const distance = calculateDistance(officeLat, officeLng, parseFloat(lat), parseFloat(lng));
  
  // Check if within radius
  if (distance <= allowedRadius) {
    return {
      valid: true,
      distance: Math.round(distance),
      message: `Within range (${Math.round(distance)}m from office)`
    };
  } else {
    return {
      valid: false,
      distance: Math.round(distance),
      message: `Too far from office (${Math.round(distance)}m, max ${allowedRadius}m)`
    };
  }
}

// Create attendance record (check-in)
function checkIn(data) {
  // Validate location
  const locationCheck = validateLocation(data.lat, data.lng);
  if (!locationCheck.valid) {
    throw new Error(locationCheck.message);
  }
  const stmt = db.prepare(`
    INSERT INTO attendance (
      employee_type, employee_id, employee_name,
      check_in_time, check_in_lat, check_in_lng, check_in_note, check_in_photo
    ) VALUES (?, ?, ?, NOW_LOCAL(), ?, ?, ?, ?)
  `);
  
  return stmt.run(
    data.employee_type,
    data.employee_id,
    data.employee_name,
    data.lat || '',
    data.lng || '',
    data.note || '',
    data.photo || ''
  );
}

// Update attendance record (check-out)
function checkOut(attendanceId, data) {
  const attendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(attendanceId);
  if (!attendance) {
    throw new Error('Attendance record not found');
  }
  
  if (attendance.status === 'checked_out') {
    throw new Error('Already checked out');
  }
  
  // Validate location for check-out
  const locationCheck = validateLocation(data.lat, data.lng);
  if (!locationCheck.valid) {
    throw new Error(locationCheck.message);
  }
  
  // Calculate work duration in minutes
  const checkInTime = parseDateInTimezone(attendance.check_in_time);
  const checkOutTime = new Date();
  const durationMinutes = Math.floor((checkOutTime - checkInTime) / 1000 / 60);
  
  const stmt = db.prepare(`
    UPDATE attendance 
    SET check_out_time = NOW_LOCAL(),
        check_out_lat = ?,
        check_out_lng = ?,
        check_out_note = ?,
        check_out_photo = ?,
        work_duration_minutes = ?,
        status = 'checked_out'
    WHERE id = ?
  `);
  
  return stmt.run(
    data.lat || '',
    data.lng || '',
    data.note || '',
    data.photo || '',
    durationMinutes,
    attendanceId
  );
}

// Get today's attendance for an employee
function getTodayAttendance(employeeType, employeeId) {
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE employee_type = ? 
      AND employee_id = ? 
      AND date(check_in_time) = date(NOW_LOCAL())
    ORDER BY check_in_time DESC
    LIMIT 1
  `);
  
  return stmt.get(employeeType, employeeId);
}

// Get attendance history for an employee
function getAttendanceHistory(employeeType, employeeId, limit = 30) {
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE employee_type = ? AND employee_id = ?
    ORDER BY check_in_time DESC
    LIMIT ?
  `);
  
  return stmt.all(employeeType, employeeId, limit);
}

// Get all attendance records for a specific date
function getAttendanceByDate(date) {
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE date(check_in_time) = date(?)
    ORDER BY check_in_time DESC
  `);
  
  return stmt.all(date);
}

// Get attendance records for a date range
function getAttendanceByDateRange(startDate, endDate) {
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE date(check_in_time) BETWEEN date(?) AND date(?)
    ORDER BY check_in_time DESC
  `);
  
  return stmt.all(startDate, endDate);
}

// Get attendance summary for an employee (monthly)
function getMonthlyAttendanceSummary(employeeType, employeeId, year, month) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total_days,
      SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) as completed_days,
      SUM(work_duration_minutes) as total_minutes,
      AVG(work_duration_minutes) as avg_minutes
    FROM attendance 
    WHERE employee_type = ? 
      AND employee_id = ?
      AND strftime('%Y', check_in_time) = ?
      AND strftime('%m', check_in_time) = ?
  `);
  
  const yearStr = String(year);
  const monthStr = String(month).padStart(2, '0');
  
  return stmt.get(employeeType, employeeId, yearStr, monthStr);
}

// Get all attendance for today (for admin dashboard)
function getTodayAllAttendance() {
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE date(check_in_time) = date(NOW_LOCAL())
    ORDER BY check_in_time DESC
  `);
  
  return stmt.all();
}

// Get attendance statistics for admin
function getAttendanceStats(date = null) {
  const dateFilter = date ? `date(check_in_time) = date('${date}')` : `date(check_in_time) = date(NOW_LOCAL())`;
  
  const stmt = db.prepare(`
    SELECT 
      employee_type,
      COUNT(*) as total,
      SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END) as checked_in,
      SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) as checked_out
    FROM attendance 
    WHERE ${dateFilter}
    GROUP BY employee_type
  `);
  
  return stmt.all();
}

// Check if employee has checked in today
function hasCheckedInToday(employeeType, employeeId) {
  const today = getTodayAttendance(employeeType, employeeId);
  return today !== undefined;
}

// Get late check-ins (after 8:30 AM)
function getLateCheckIns(date = null) {
  const dateFilter = date ? `date(check_in_time) = date('${date}')` : `date(check_in_time) = date(NOW_LOCAL())`;
  
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE ${dateFilter}
      AND time(check_in_time) > '08:30:00'
    ORDER BY check_in_time DESC
  `);
  
  return stmt.all();
}

// Get employees who haven't checked out
function getNotCheckedOut(date = null) {
  const dateFilter = date ? `date(check_in_time) = date('${date}')` : `date(check_in_time) = date(NOW_LOCAL())`;
  
  const stmt = db.prepare(`
    SELECT * FROM attendance 
    WHERE ${dateFilter}
      AND status = 'checked_in'
    ORDER BY check_in_time DESC
  `);
  
  return stmt.all();
}

// Delete attendance record (admin only)
function deleteAttendance(id) {
  return db.prepare('DELETE FROM attendance WHERE id = ?').run(id);
}

// Update attendance record (admin only - for corrections)
function updateAttendance(id, data) {
  const stmt = db.prepare(`
    UPDATE attendance 
    SET check_in_time = ?,
        check_in_note = ?,
        check_out_time = ?,
        check_out_note = ?,
        work_duration_minutes = ?
    WHERE id = ?
  `);
  
  return stmt.run(
    data.check_in_time,
    data.check_in_note || '',
    data.check_out_time || null,
    data.check_out_note || '',
    data.work_duration_minutes || 0,
    id
  );
}

// Get geofencing settings
function getGeofencingSettings() {
  return {
    enabled: getSetting('attendance_geofencing', 'true') === 'true',
    officeLat: parseFloat(getSetting('office_lat', '0')),
    officeLng: parseFloat(getSetting('office_lng', '0')),
    radius: parseInt(getSetting('attendance_radius', '100'))
  };
}

module.exports = {
  checkIn,
  checkOut,
  getTodayAttendance,
  getAttendanceHistory,
  getAttendanceByDate,
  getAttendanceByDateRange,
  getMonthlyAttendanceSummary,
  getTodayAllAttendance,
  getAttendanceStats,
  hasCheckedInToday,
  getLateCheckIns,
  getNotCheckedOut,
  deleteAttendance,
  updateAttendance,
  validateLocation,
  calculateDistance,
  getGeofencingSettings
};

// Made with Bob
