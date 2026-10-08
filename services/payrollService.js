/**
 * Service: Payroll / Gaji Karyawan
 * Mengelola pengaturan gaji, generate slip gaji, dan kalkulasi otomatis
 */
const db = require('../config/database');
const { logger } = require('../config/logger');
const attendanceSvc = require('./attendanceService');

const EMPLOYEE_TYPES = ['technician', 'cashier', 'collector'];

// ─── PAYROLL SETTINGS ────────────────────────────────────────────────────────

function getPayrollSetting(employeeType, employeeId) {
  return db.prepare(
    'SELECT * FROM payroll_settings WHERE employee_type = ? AND employee_id = ?'
  ).get(employeeType, employeeId) || null;
}

function getAllPayrollSettings() {
  return db.prepare('SELECT * FROM payroll_settings ORDER BY employee_type, employee_id').all();
}

function upsertPayrollSetting(data) {
  const existing = getPayrollSetting(data.employee_type, data.employee_id);
  if (existing) {
    return db.prepare(`
      UPDATE payroll_settings SET
        base_salary = ?, transport_allowance = ?, meal_allowance = ?,
        phone_allowance = ?, other_allowance = ?, other_allowance_note = ?,
        absence_deduction_per_day = ?, bonus_per_ticket = ?,
        commission_percentage = ?, working_days_per_month = ?,
        updated_at = (NOW_LOCAL())
      WHERE employee_type = ? AND employee_id = ?
    `).run(
      parseInt(data.base_salary) || 0,
      parseInt(data.transport_allowance) || 0,
      parseInt(data.meal_allowance) || 0,
      parseInt(data.phone_allowance) || 0,
      parseInt(data.other_allowance) || 0,
      data.other_allowance_note || '',
      parseInt(data.absence_deduction_per_day) || 0,
      parseInt(data.bonus_per_ticket) || 0,
      parseFloat(data.commission_percentage) || 0,
      parseInt(data.working_days_per_month) || 26,
      data.employee_type,
      data.employee_id
    );
  } else {
    return db.prepare(`
      INSERT INTO payroll_settings (
        employee_type, employee_id,
        base_salary, transport_allowance, meal_allowance,
        phone_allowance, other_allowance, other_allowance_note,
        absence_deduction_per_day, bonus_per_ticket,
        commission_percentage, working_days_per_month
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.employee_type,
      parseInt(data.employee_id),
      parseInt(data.base_salary) || 0,
      parseInt(data.transport_allowance) || 0,
      parseInt(data.meal_allowance) || 0,
      parseInt(data.phone_allowance) || 0,
      parseInt(data.other_allowance) || 0,
      data.other_allowance_note || '',
      parseInt(data.absence_deduction_per_day) || 0,
      parseInt(data.bonus_per_ticket) || 0,
      parseFloat(data.commission_percentage) || 0,
      parseInt(data.working_days_per_month) || 26
    );
  }
}

function deletePayrollSetting(employeeType, employeeId) {
  return db.prepare(
    'DELETE FROM payroll_settings WHERE employee_type = ? AND employee_id = ?'
  ).run(employeeType, employeeId);
}

// ─── EMPLOYEE LIST ───────────────────────────────────────────────────────────

function getAllEmployees() {
  const employees = [];

  const technicians = db.prepare('SELECT id, name, phone, is_active FROM technicians WHERE is_active = 1').all();
  for (const t of technicians) {
    const setting = getPayrollSetting('technician', t.id);
    employees.push({ ...t, employee_type: 'technician', payroll: setting });
  }

  const cashiers = db.prepare('SELECT id, name, phone, is_active FROM cashiers WHERE is_active = 1').all();
  for (const c of cashiers) {
    const setting = getPayrollSetting('cashier', c.id);
    employees.push({ ...c, employee_type: 'cashier', payroll: setting });
  }

  const collectors = db.prepare('SELECT id, name, phone, is_active FROM collectors WHERE is_active = 1').all();
  for (const c of collectors) {
    const setting = getPayrollSetting('collector', c.id);
    employees.push({ ...c, employee_type: 'collector', payroll: setting });
  }

  return employees;
}

function getEmployeeName(employeeType, employeeId) {
  const table = employeeType === 'technician' ? 'technicians'
    : employeeType === 'cashier' ? 'cashiers'
    : employeeType === 'collector' ? 'collectors' : null;
  if (!table) return 'Unknown';
  const row = db.prepare(`SELECT name FROM ${table} WHERE id = ?`).get(employeeId);
  return row ? row.name : 'Unknown';
}

function getEmployeePhone(employeeType, employeeId) {
  const table = employeeType === 'technician' ? 'technicians'
    : employeeType === 'cashier' ? 'cashiers'
    : employeeType === 'collector' ? 'collectors' : null;
  if (!table) return '';
  const row = db.prepare(`SELECT phone FROM ${table} WHERE id = ?`).get(employeeId);
  return row ? (row.phone || '') : '';
}

// ─── PERFORMANCE DATA ────────────────────────────────────────────────────────

function getTicketsResolvedCount(technicianId, month, year) {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);
  const result = db.prepare(`
    SELECT COUNT(*) as cnt FROM tickets
    WHERE technician_id = ? AND status = 'resolved'
      AND strftime('%Y', datetime(updated_at, 'localtime')) = ?
      AND strftime('%m', datetime(updated_at, 'localtime')) = ?
  `).get(technicianId, yearStr, monthStr);
  return result ? result.cnt : 0;
}

function getCollectionAmount(collectorId, month, year) {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);
  const result = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM collector_payment_requests
    WHERE collector_id = ? AND status = 'approved'
      AND strftime('%Y', datetime(created_at, 'localtime')) = ?
      AND strftime('%m', datetime(created_at, 'localtime')) = ?
  `).get(collectorId, yearStr, monthStr);
  return result ? result.total : 0;
}

function getAttendanceData(employeeType, employeeId, month, year) {
  const monthStr = String(month).padStart(2, '0');
  const yearStr = String(year);

  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_days,
      SUM(CASE WHEN status = 'checked_out' THEN 1 ELSE 0 END) as completed_days,
      SUM(work_duration_minutes) as total_minutes,
      SUM(CASE WHEN time(datetime(check_in_time, 'localtime')) > '08:30:00' THEN 1 ELSE 0 END) as late_days,
      SUM(CASE WHEN work_duration_minutes > 480 THEN work_duration_minutes - 480 ELSE 0 END) as overtime_minutes
    FROM attendance
    WHERE employee_type = ? AND employee_id = ?
      AND strftime('%Y', datetime(check_in_time, 'localtime')) = ?
      AND strftime('%m', datetime(check_in_time, 'localtime')) = ?
  `).get(employeeType, employeeId, yearStr, monthStr);

  return {
    workingDays: summary ? (summary.total_days || 0) : 0,
    completedDays: summary ? (summary.completed_days || 0) : 0,
    totalMinutes: summary ? (summary.total_minutes || 0) : 0,
    lateDays: summary ? (summary.late_days || 0) : 0,
    overtimeMinutes: summary ? (summary.overtime_minutes || 0) : 0
  };
}

// ─── PAYROLL SLIP GENERATION ─────────────────────────────────────────────────

function generateSlip(employeeType, employeeId, month, year) {
  const setting = getPayrollSetting(employeeType, employeeId);
  if (!setting) {
    throw new Error(`Pengaturan gaji belum diset untuk ${employeeType} ID ${employeeId}`);
  }

  // Cek apakah slip sudah ada
  const existing = db.prepare(`
    SELECT id FROM payroll_slips
    WHERE employee_type = ? AND employee_id = ? AND period_month = ? AND period_year = ?
  `).get(employeeType, employeeId, month, year);

  if (existing) {
    throw new Error(`Slip gaji sudah ada untuk periode ${month}/${year}. Hapus dulu jika ingin generate ulang.`);
  }

  const employeeName = getEmployeeName(employeeType, employeeId);
  const attendance = getAttendanceData(employeeType, employeeId, month, year);

  // Hitung hari absen
  const absentDays = Math.max(0, setting.working_days_per_month - attendance.workingDays);

  // Hitung bonus performa
  let ticketsResolved = 0;
  let ticketBonus = 0;
  if (employeeType === 'technician' && setting.bonus_per_ticket > 0) {
    ticketsResolved = getTicketsResolvedCount(employeeId, month, year);
    ticketBonus = ticketsResolved * setting.bonus_per_ticket;
  }

  let collectionAmount = 0;
  let collectionCommission = 0;
  if (employeeType === 'collector' && setting.commission_percentage > 0) {
    collectionAmount = getCollectionAmount(employeeId, month, year);
    collectionCommission = Math.round(collectionAmount * (setting.commission_percentage / 100));
  }

  // Hitung overtime bonus (Rp 15.000 per jam lembur)
  const overtimeHours = Math.round((attendance.overtimeMinutes / 60) * 10) / 10;
  const overtimeBonus = Math.round(overtimeHours * 15000);

  // Hitung potongan
  const absenceDeduction = absentDays * setting.absence_deduction_per_day;
  const lateDeduction = attendance.lateDays * Math.round(setting.absence_deduction_per_day * 0.25); // 25% potongan per hari terlambat

  // Total pendapatan
  const grossSalary = setting.base_salary
    + setting.transport_allowance
    + setting.meal_allowance
    + setting.phone_allowance
    + setting.other_allowance
    + ticketBonus
    + collectionCommission
    + overtimeBonus;

  // Total potongan
  const totalDeductions = absenceDeduction + lateDeduction;

  // Gaji bersih
  const netSalary = Math.max(0, grossSalary - totalDeductions);

  const result = db.prepare(`
    INSERT INTO payroll_slips (
      employee_type, employee_id, employee_name, period_month, period_year,
      base_salary, transport_allowance, meal_allowance, phone_allowance,
      other_allowance, other_allowance_note,
      working_days, absent_days, late_days, overtime_hours,
      total_tickets_resolved, total_collection_amount,
      ticket_bonus, collection_commission, overtime_bonus,
      absence_deduction, late_deduction, other_deduction, other_deduction_note,
      gross_salary, total_deductions, net_salary, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    employeeType, employeeId, employeeName, month, year,
    setting.base_salary, setting.transport_allowance, setting.meal_allowance,
    setting.phone_allowance, setting.other_allowance, setting.other_allowance_note || '',
    attendance.workingDays, absentDays, attendance.lateDays, overtimeHours,
    ticketsResolved, collectionAmount,
    ticketBonus, collectionCommission, overtimeBonus,
    absenceDeduction, lateDeduction, 0, '',
    grossSalary, totalDeductions, netSalary
  );

  return result.lastInsertRowid;
}

function generateAllSlips(month, year) {
  const employees = getAllEmployees();
  let generated = 0;
  let skipped = 0;
  const errors = [];

  for (const emp of employees) {
    if (!emp.payroll) {
      skipped++;
      continue;
    }
    try {
      generateSlip(emp.employee_type, emp.id, month, year);
      generated++;
    } catch (e) {
      if (e.message.includes('Slip gaji sudah ada')) {
        skipped++;
      } else {
        errors.push(`${emp.name}: ${e.message}`);
      }
    }
  }

  return { generated, skipped, errors };
}

// ─── PAYROLL SLIP CRUD ───────────────────────────────────────────────────────

function getSlipById(id) {
  return db.prepare('SELECT * FROM payroll_slips WHERE id = ?').get(id);
}

function getSlipsByPeriod(month, year) {
  return db.prepare(`
    SELECT * FROM payroll_slips
    WHERE period_month = ? AND period_year = ?
    ORDER BY employee_type, employee_name
  `).all(month, year);
}

function getSlipsByEmployee(employeeType, employeeId) {
  return db.prepare(`
    SELECT * FROM payroll_slips
    WHERE employee_type = ? AND employee_id = ?
    ORDER BY period_year DESC, period_month DESC
  `).all(employeeType, employeeId);
}

function updateSlipDeductions(id, otherDeduction, otherDeductionNote) {
  const slip = getSlipById(id);
  if (!slip) throw new Error('Slip tidak ditemukan');
  if (slip.status !== 'draft') throw new Error('Hanya slip draft yang bisa diedit');

  const od = parseInt(otherDeduction) || 0;
  const newTotalDeductions = slip.absence_deduction + slip.late_deduction + od;
  const newNetSalary = Math.max(0, slip.gross_salary - newTotalDeductions);

  return db.prepare(`
    UPDATE payroll_slips SET
      other_deduction = ?, other_deduction_note = ?,
      total_deductions = ?, net_salary = ?
    WHERE id = ?
  `).run(od, otherDeductionNote || '', newTotalDeductions, newNetSalary, id);
}

function approveSlip(id) {
  const slip = getSlipById(id);
  if (!slip) throw new Error('Slip tidak ditemukan');
  if (slip.status !== 'draft') throw new Error('Hanya slip draft yang bisa di-approve');

  return db.prepare(`
    UPDATE payroll_slips SET status = 'approved', approved_at = (NOW_LOCAL()) WHERE id = ?
  `).run(id);
}

function markSlipPaid(id) {
  const slip = getSlipById(id);
  if (!slip) throw new Error('Slip tidak ditemukan');
  if (slip.status !== 'approved') throw new Error('Hanya slip yang sudah approved yang bisa ditandai paid');

  const result = db.prepare(`
    UPDATE payroll_slips SET status = 'paid', paid_at = (NOW_LOCAL()) WHERE id = ?
  `).run(id);

  // Auto Insert ke Tabel Pengeluaran (Expenses)
  try {
    db.prepare(`
      INSERT INTO expenses (date, category, amount, description, payment_method, recorded_by_name)
      VALUES (date('now', 'localtime'), 'Gaji & Tunjangan', ?, ?, 'transfer', 'Sistem (Payroll)')
    `).run(slip.net_salary, `Gaji ${slip.employee_name} (Periode ${slip.period_month}/${slip.period_year})`);
  } catch (e) {
    logger.error('Gagal mencatat expense dari slip gaji: ' + e.message);
  }

  return result;
}

function bulkApprove(month, year) {
  return db.prepare(`
    UPDATE payroll_slips SET status = 'approved', approved_at = (NOW_LOCAL())
    WHERE period_month = ? AND period_year = ? AND status = 'draft'
  `).run(month, year);
}

function bulkMarkPaid(month, year) {
  const slipsToPay = db.prepare(`SELECT * FROM payroll_slips WHERE period_month = ? AND period_year = ? AND status = 'approved'`).all(month, year);
  
  const result = db.prepare(`
    UPDATE payroll_slips SET status = 'paid', paid_at = (NOW_LOCAL())
    WHERE period_month = ? AND period_year = ? AND status = 'approved'
  `).run(month, year);

  // Auto Insert ke Tabel Pengeluaran (Expenses) untuk semua slip
  try {
    const stmt = db.prepare(`
      INSERT INTO expenses (date, category, amount, description, payment_method, recorded_by_name)
      VALUES (date('now', 'localtime'), 'Gaji & Tunjangan', ?, ?, 'transfer', 'Sistem (Payroll)')
    `);
    
    for (const slip of slipsToPay) {
      stmt.run(slip.net_salary, `Gaji ${slip.employee_name} (Periode ${slip.period_month}/${slip.period_year})`);
    }
  } catch (e) {
    logger.error('Gagal mencatat expense bulk slip gaji: ' + e.message);
  }

  return result;
}

function deleteSlip(id) {
  const slip = getSlipById(id);
  if (!slip) throw new Error('Slip tidak ditemukan');
  if (slip.status === 'paid') throw new Error('Slip yang sudah paid tidak bisa dihapus');
  return db.prepare('DELETE FROM payroll_slips WHERE id = ?').run(id);
}

function deleteSlipsByPeriod(month, year) {
  return db.prepare(`
    DELETE FROM payroll_slips
    WHERE period_month = ? AND period_year = ? AND status = 'draft'
  `).run(month, year);
}

// ─── STATISTICS ──────────────────────────────────────────────────────────────

function getPayrollSummary(month, year) {
  const result = db.prepare(`
    SELECT
      COUNT(*) as total_slips,
      SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as draft_count,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) as paid_count,
      COALESCE(SUM(gross_salary), 0) as total_gross,
      COALESCE(SUM(total_deductions), 0) as total_deductions,
      COALESCE(SUM(net_salary), 0) as total_net
    FROM payroll_slips
    WHERE period_month = ? AND period_year = ?
  `).get(month, year);

  return result || {
    total_slips: 0, draft_count: 0, approved_count: 0, paid_count: 0,
    total_gross: 0, total_deductions: 0, total_net: 0
  };
}

function getAvailablePeriods() {
  return db.prepare(`
    SELECT DISTINCT period_month, period_year
    FROM payroll_slips
    ORDER BY period_year DESC, period_month DESC
    LIMIT 24
  `).all();
}

module.exports = {
  EMPLOYEE_TYPES,
  getPayrollSetting, getAllPayrollSettings, upsertPayrollSetting, deletePayrollSetting,
  getAllEmployees, getEmployeeName, getEmployeePhone,
  getTicketsResolvedCount, getCollectionAmount, getAttendanceData,
  generateSlip, generateAllSlips,
  getSlipById, getSlipsByPeriod, getSlipsByEmployee,
  updateSlipDeductions, approveSlip, markSlipPaid,
  bulkApprove, bulkMarkPaid,
  deleteSlip, deleteSlipsByPeriod,
  getPayrollSummary, getAvailablePeriods
};
