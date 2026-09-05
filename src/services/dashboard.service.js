const prisma = require('../config/prisma');

/**
 * Helper: Fetch KPI Summary Metrics
 */
const fetchSummaryMetrics = async (prisma, { todayStr, endDateStr, institutionId, departmentId }) => {
  let personWhereSql = 'WHERE p.is_deleted = 0';
  const personParams = [];
  if (institutionId) {
    personWhereSql += ' AND p.institution_id = ?';
    personParams.push(institutionId);
  }
  if (departmentId) {
    personWhereSql += ' AND p.department_id = ?';
    personParams.push(departmentId);
  }

  const totalEmployeesResult = await prisma.$queryRawUnsafe(
    `SELECT COUNT(p.id) AS total FROM m_person p ${personWhereSql}`,
    ...personParams
  );
  const totalEmployees = Number(totalEmployeesResult[0]?.total || 0);

  let attendanceWhereSql = `
    WHERE a.is_deleted = 0 
      AND a.attendance_date >= ? 
      AND a.attendance_date <= ?
  `;
  const attendanceParams = [todayStr, endDateStr];
  if (institutionId) {
    attendanceWhereSql += ' AND p.institution_id = ?';
    attendanceParams.push(institutionId);
  }
  if (departmentId) {
    attendanceWhereSql += ' AND p.department_id = ?';
    attendanceParams.push(departmentId);
  }

  const attendanceSql = `
    SELECT 
      a.id,
      a.person_id AS personId,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendanceDateStr,
      a.attendance_type AS attendanceType,
      a.checkin_time AS checkinTime,
      a.checkout_time AS checkoutTime,
      a.late_minutes AS lateMinutes,
      a.early_leave_minutes AS earlyLeaveMinutes,
      a.status
    FROM attendances a
    JOIN m_person p ON a.person_id = p.id
    ${attendanceWhereSql}
  `;
  const attendances = await prisma.$queryRawUnsafe(attendanceSql, ...attendanceParams);

  let totalPresent = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let totalLateMinutes = 0;
  let totalEarlyLeaveMinutes = 0;
  let severeLateCount = 0;
  let mangkirCount = 0;

  (attendances || []).forEach(att => {
    totalPresent++;
    const late = Number(att.lateMinutes || 0);
    const early = Number(att.earlyLeaveMinutes || 0);
    
    if (late > 0) {
      lateCount++;
      totalLateMinutes += late;
      if (late > 30) severeLateCount++;
    } else {
      onTimeCount++;
    }

    if (early > 0) {
      earlyLeaveCount++;
      totalEarlyLeaveMinutes += early;
    }

    if (att.checkinTime && !att.checkoutTime) {
      mangkirCount++;
    }
  });

  let requestWhereSql = `
    WHERE ar.is_deleted = 0 
      AND ar.status = 'APPROVED'
      AND ar.start_date <= ?
      AND ar.end_date >= ?
  `;
  const requestParams = [endDateStr, todayStr];
  if (institutionId) {
    requestWhereSql += ' AND p.institution_id = ?';
    requestParams.push(institutionId);
  }
  if (departmentId) {
    requestWhereSql += ' AND p.department_id = ?';
    requestParams.push(departmentId);
  }

  const requestSql = `
    SELECT 
      ar.id,
      ar.attendance_type_id AS attendanceTypeId,
      at.code AS typeCode,
      at.name AS typeName
    FROM attendance_requests ar
    JOIN m_person p ON ar.person_id = p.id
    LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
    ${requestWhereSql}
  `;
  const requests = await prisma.$queryRawUnsafe(requestSql, ...requestParams);

  let sickCount = 0;
  let leaveCount = 0;
  let permitCount = 0;
  let dutyCount = 0;

  (requests || []).forEach(req => {
    const code = String(req.typeCode || '').toUpperCase();
    if (code.includes('SAKIT')) sickCount++;
    else if (code.includes('CUTI')) leaveCount++;
    else if (code.includes('DINAS')) dutyCount++;
    else permitCount++;
  });

  const totalPermits = sickCount + leaveCount + permitCount + dutyCount;
  const alphaCount = Math.max(0, totalEmployees - totalPresent - totalPermits);
  const pendingCheckinCount = Math.max(0, totalEmployees - totalPresent);
  const totalAbsenceAlert = mangkirCount + alphaCount;

  const attendancePercentage = totalEmployees > 0 
    ? Number(((totalPresent / totalEmployees) * 100).toFixed(1)) 
    : 0;

  const totalLateHours = Number((totalLateMinutes / 60).toFixed(1));
  const totalEarlyLeaveHours = Number((totalEarlyLeaveMinutes / 60).toFixed(1));
  const avgLateMins = lateCount > 0 ? Number((totalLateMinutes / lateCount).toFixed(1)) : 0;

  return {
    totalEmployees,
    summary: {
      totalEmployees,
      totalPresent,
      attendancePercentage,
      onTimeCount,
      lateCount,
      earlyLeaveCount,
      pendingCheckinCount,
      totalLateMinutes,
      totalLateHours,
      totalEarlyLeaveMinutes,
      totalEarlyLeaveHours,
      avgLateMins,
      severeLateCount,
      totalPermits,
      sickCount,
      leaveCount,
      permitCount,
      dutyCount,
      totalAbsenceAlert,
      mangkirCount,
      alphaCount,
    },
  };
};

/**
 * Helper: Fetch Monthly Daily Trend
 */
const fetchMonthlyTrend = async (prisma, { monthStr, now, totalEmployees, institutionId, departmentId }) => {
  const [yStr, mStr] = monthStr.split('-').map(Number);
  const year = yStr || now.getFullYear();
  const month = mStr || (now.getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  let monthWhereSql = `
    WHERE a.is_deleted = 0 
      AND a.attendance_date >= ? 
      AND a.attendance_date <= ?
  `;
  const monthParams = [startMonthStr, endMonthStr];

  if (institutionId) {
    monthWhereSql += ' AND p.institution_id = ?';
    monthParams.push(institutionId);
  }
  if (departmentId) {
    monthWhereSql += ' AND p.department_id = ?';
    monthParams.push(departmentId);
  }

  const monthAttendanceSql = `
    SELECT 
      DATE_FORMAT(a.attendance_date, '%d') AS dayNum,
      COUNT(a.id) AS totalHadir,
      SUM(CASE WHEN a.late_minutes <= 0 THEN 1 ELSE 0 END) AS onTimeCount,
      SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS lateCount,
      SUM(a.late_minutes) AS totalLateMins
    FROM attendances a
    JOIN m_person p ON a.person_id = p.id
    ${monthWhereSql}
    GROUP BY DATE_FORMAT(a.attendance_date, '%d')
  `;
  const monthRows = await prisma.$queryRawUnsafe(monthAttendanceSql, ...monthParams);
  const monthMap = {};
  (monthRows || []).forEach(r => {
    monthMap[Number(r.dayNum)] = r;
  });

  const dailyOnTime = [];
  const dailyLate = [];
  const dailyAbsent = [];
  const dailyLateMinutes = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const row = monthMap[d];
    if (row) {
      const onT = Number(row.onTimeCount || 0);
      const lT = Number(row.lateCount || 0);
      const abS = Math.max(0, totalEmployees - (onT + lT));
      dailyOnTime.push(onT);
      dailyLate.push(lT);
      dailyAbsent.push(abS);
      dailyLateMinutes.push(Number(row.totalLateMins || 0));
    } else {
      dailyOnTime.push(0);
      dailyLate.push(0);
      dailyAbsent.push(0);
      dailyLateMinutes.push(0);
    }
  }

  return {
    daysInMonth,
    dailyOnTime,
    dailyLate,
    dailyAbsent,
    dailyLateMinutes,
  };
};

/**
 * Helper: Fetch Department Breakdown Summary
 */
const fetchDepartmentSummary = async (prisma, { todayStr, endDateStr, institutionId }) => {
  let personWhereSql = 'AND p.is_deleted = 0';
  const deptParams = [todayStr, endDateStr];

  if (institutionId) {
    personWhereSql += ' AND p.institution_id = ?';
    deptParams.push(institutionId);
  }

  const deptSql = `
    SELECT 
      d.id, d.name,
      COUNT(DISTINCT p.id) AS totalEmployees,
      COUNT(DISTINCT a.id) AS presentCount
    FROM m_department d
    LEFT JOIN m_person p ON p.department_id = d.id ${personWhereSql}
    LEFT JOIN attendances a ON a.person_id = p.id AND a.attendance_date >= ? AND a.attendance_date <= ? AND a.is_deleted = 0
    WHERE d.is_deleted = 0
    GROUP BY d.id, d.name
    LIMIT 6
  `;
  const deptRows = await prisma.$queryRawUnsafe(deptSql, ...deptParams);

  return (deptRows || []).map(d => ({
    id: d.id,
    name: d.name,
    totalEmployees: Number(d.totalEmployees || 0),
    presentCount: Number(d.presentCount || 0),
  }));
};

/**
 * Helper: Fetch Top 10 Late Employees
 */
const fetchTopLateEmployees = async (prisma, { monthStr, now, institutionId, departmentId }) => {
  const [yStr, mStr] = monthStr.split('-').map(Number);
  const year = yStr || now.getFullYear();
  const month = mStr || (now.getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  let whereSql = `
    WHERE a.is_deleted = 0 
      AND a.late_minutes > 0
      AND a.attendance_date >= ? 
      AND a.attendance_date <= ?
  `;
  const sqlParams = [startMonthStr, endMonthStr];

  if (institutionId) {
    whereSql += ' AND p.institution_id = ?';
    sqlParams.push(institutionId);
  }
  if (departmentId) {
    whereSql += ' AND p.department_id = ?';
    sqlParams.push(departmentId);
  }

  const topLateSql = `
    SELECT 
      p.id, p.nip, p.name,
      d.name AS department,
      pos.name AS position,
      SUM(a.late_minutes) AS totalLateMins,
      COUNT(a.id) AS lateCount,
      MAX(DATE_FORMAT(a.checkin_time, '%H:%i')) AS checkInTime
    FROM attendances a
    JOIN m_person p ON a.person_id = p.id
    LEFT JOIN m_department d ON p.department_id = d.id
    LEFT JOIN m_position pos ON p.position_id = pos.id
    ${whereSql}
    GROUP BY p.id, p.nip, p.name, d.name, pos.name
    ORDER BY totalLateMins DESC, lateCount DESC
    LIMIT 10
  `;
  const topLateRows = await prisma.$queryRawUnsafe(topLateSql, ...sqlParams);

  return (topLateRows || []).map((row, idx) => {
    const initials = row.name
      ? row.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      : 'PG';
    const count = Number(row.lateCount || 0);
    return {
      id: row.id,
      rank: idx + 1,
      name: row.name,
      nip: row.nip || '-',
      initials,
      department: row.department || '-',
      position: row.position || '-',
      checkInTime: row.checkInTime || '-',
      lateDuration: Number(row.totalLateMins || 0),
      monthlyCount: count,
      statusText: count >= 5 ? 'Perlu SP' : count >= 3 ? 'Peringatan' : 'Ringan',
    };
  });
};

/**
 * Main Executive Dashboard Service
 */
const getExecutiveSummary = async (params = {}) => {
  const now = new Date();
  const todayStr = params.startDate || now.toISOString().slice(0, 10);
  const endDateStr = params.endDate || todayStr;
  const monthStr = params.month || todayStr.slice(0, 7);

  const institutionId = params.institutionId && params.institutionId !== 'all' ? Number(params.institutionId) : null;
  const departmentId = params.departmentId && params.departmentId !== 'all' ? Number(params.departmentId) : null;

  const { summary, totalEmployees } = await fetchSummaryMetrics(prisma, {
    todayStr,
    endDateStr,
    institutionId,
    departmentId,
  });

  const [monthlyTrend, departmentSummary, topLateEmployees] = await Promise.all([
    fetchMonthlyTrend(prisma, { monthStr, now, totalEmployees, institutionId, departmentId }),
    fetchDepartmentSummary(prisma, { todayStr, endDateStr, institutionId }),
    fetchTopLateEmployees(prisma, { monthStr, now, institutionId, departmentId }),
  ]);

  return {
    summary,
    monthlyTrend,
    departmentSummary,
    topLateEmployees,
  };
};

/**
 * Dedicated Service for Top 10 Late Employees Monitoring
 */
const getTopLateEmployees = async (params = {}) => {
  const now = new Date();
  const monthStr = params.month || now.toISOString().slice(0, 7);
  const institutionId = params.institutionId && params.institutionId !== 'all' ? Number(params.institutionId) : null;
  const departmentId = params.departmentId && params.departmentId !== 'all' ? Number(params.departmentId) : null;

  return fetchTopLateEmployees(prisma, { monthStr, now, institutionId, departmentId });
};

module.exports = {
  getExecutiveSummary,
  getTopLateEmployees,
};
