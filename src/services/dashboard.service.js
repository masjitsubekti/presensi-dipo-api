const prisma = require('../config/prisma');

const getTodayStrReal = () => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

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

  // Realtime current date string
  const todayStrReal = getTodayStrReal();

  // Generate array of date strings for the range [todayStr, endDateStr]
  const dateList = [];
  const [y1, m1, d1] = (todayStr || '').split('-').map(Number);
  const [y2, m2, d2] = (endDateStr || todayStr).split('-').map(Number);

  if (y1 && m1 && d1 && y2 && m2 && d2) {
    const start = new Date(Date.UTC(y1, m1 - 1, d1));
    const end = new Date(Date.UTC(y2, m2 - 1, d2));
    let curr = new Date(start);
    while (curr <= end) {
      const yyyy = curr.getUTCFullYear();
      const mm = String(curr.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(curr.getUTCDate()).padStart(2, '0');
      dateList.push(`${yyyy}-${mm}-${dd}`);
      curr.setUTCDate(curr.getUTCDate() + 1);
    }
  }

  if (dateList.length === 0) {
    dateList.push(todayStr);
  }

  // Only count days that have passed (<= todayStrReal) for expected person-days calculation
  const passedDates = dateList.filter(dStr => dStr <= todayStrReal);
  const numberOfPassedDays = passedDates.length > 0 ? passedDates.length : 1;
  const totalExpectedPersonDays = totalEmployees * numberOfPassedDays;

  let attendanceWhereSql = `
    WHERE a.is_deleted = 0 
      AND p.is_deleted = 0
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

  const attendanceByDate = {};
  (attendances || []).forEach(att => {
    const dStr = att.attendanceDateStr;
    if (!attendanceByDate[dStr]) attendanceByDate[dStr] = [];
    attendanceByDate[dStr].push(att);
  });

  let requestWhereSql = `
    WHERE ar.is_deleted = 0 
      AND p.is_deleted = 0
      AND (at.is_deleted IS NULL OR at.is_deleted = 0)
      AND LOWER(ar.status) = 'approved'
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
      ar.person_id AS personId,
      DATE_FORMAT(ar.start_date, '%Y-%m-%d') AS startDateStr,
      DATE_FORMAT(ar.end_date, '%Y-%m-%d') AS endDateStr,
      ar.attendance_type_id AS attendanceTypeId,
      at.code AS typeCode,
      at.name AS typeName,
      at.category AS typeCategory
    FROM attendance_requests ar
    JOIN m_person p ON ar.person_id = p.id
    LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
    ${requestWhereSql}
  `;
  const requests = await prisma.$queryRawUnsafe(requestSql, ...requestParams);

  let totalPresent = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let earlyLeaveCount = 0;
  let totalLateMinutes = 0;
  let totalEarlyLeaveMinutes = 0;
  let severeLateCount = 0;
  let mangkirCount = 0;

  let sickCount = 0;
  let leaveCount = 0;
  let permitCount = 0;
  let dutyCount = 0;
  let alphaCount = 0;

  dateList.forEach(dStr => {
    const dayAtts = attendanceByDate[dStr] || [];
    const presentPersons = new Set();
    const mangkirPersons = new Set();

    dayAtts.forEach(att => {
      const hasCheckin = Boolean(att.checkinTime);
      const hasCheckout = Boolean(att.checkoutTime);
      const statusUpper = String(att.status || '').toUpperCase();
      const typeUpper = String(att.attendanceType || '').toUpperCase();

      const isMangkir = (!hasCheckin || !hasCheckout) || statusUpper === 'MANGKIR' || typeUpper === 'M';

      if (isMangkir) {
        mangkirCount++;
        if (att.personId) mangkirPersons.add(att.personId);
      } else {
        totalPresent++;
        if (att.personId) presentPersons.add(att.personId);
      }

      const late = Number(att.lateMinutes || 0);
      const early = Number(att.earlyLeaveMinutes || 0);

      if (late > 0) {
        lateCount++;
        totalLateMinutes += late;
        if (late > 30) severeLateCount++;
      } else if (!isMangkir) {
        onTimeCount++;
      }

      if (early > 0) {
        earlyLeaveCount++;
        totalEarlyLeaveMinutes += early;
      }
    });

    const requestPersons = new Set();
    (requests || []).forEach(req => {
      if (req.startDateStr && req.endDateStr && dStr >= req.startDateStr && dStr <= req.endDateStr) {
        if (req.personId) requestPersons.add(req.personId);

        const code = String(req.typeCode || '').trim().toUpperCase();
        const name = String(req.typeName || '').trim().toUpperCase();
        const cat = String(req.typeCategory || '').trim().toUpperCase();

        if (code === 'SK' || code.includes('SAKIT') || name.includes('SAKIT')) {
          sickCount++;
        } else if (
          code === 'CT' || 
          code === 'CTH' || 
          code === 'CM' || 
          code === 'CBR' || 
          code.includes('CUTI') || 
          name.includes('CUTI') || 
          cat.includes('CUTI')
        ) {
          leaveCount++;
        } else if (
          code === 'DL' || 
          code.includes('DINAS') || 
          name.includes('DINAS') || 
          cat.includes('DINAS')
        ) {
          dutyCount++;
        } else {
          permitCount++;
        }
      }
    });

    const accountedCount = presentPersons.size + mangkirPersons.size + requestPersons.size;
    const isFutureDay = dStr > todayStrReal;
    // Bounding future days to 0 alpha count
    const dayAlpha = isFutureDay ? 0 : Math.max(0, totalEmployees - accountedCount);
    alphaCount += dayAlpha;
  });

  const totalPermits = sickCount + leaveCount + permitCount + dutyCount;
  const pendingCheckinCount = Math.max(0, Math.round(totalEmployees - (totalPresent / numberOfPassedDays)));
  const totalAbsenceAlert = mangkirCount + alphaCount;

  const attendancePercentage = totalExpectedPersonDays > 0 
    ? Number(Math.min(100, ((totalPresent / totalExpectedPersonDays) * 100)).toFixed(1)) 
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
  const todayStrReal = getTodayStrReal();

  let monthWhereSql = `
    WHERE a.is_deleted = 0 
      AND p.is_deleted = 0
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
      SUM(CASE WHEN a.late_minutes <= 0 AND a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL THEN 1 ELSE 0 END) AS onTimeCount,
      SUM(CASE WHEN a.late_minutes > 0 THEN 1 ELSE 0 END) AS lateCount,
      SUM(CASE WHEN a.early_leave_minutes > 0 THEN 1 ELSE 0 END) AS earlyLeaveCount,
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

  let reqWhereSql = `
    WHERE ar.is_deleted = 0 
      AND p.is_deleted = 0
      AND (at.is_deleted IS NULL OR at.is_deleted = 0)
      AND LOWER(ar.status) = 'approved'
      AND ar.start_date <= ? 
      AND ar.end_date >= ?
  `;
  const reqParams = [endMonthStr, startMonthStr];
  if (institutionId) {
    reqWhereSql += ' AND p.institution_id = ?';
    reqParams.push(institutionId);
  }
  if (departmentId) {
    reqWhereSql += ' AND p.department_id = ?';
    reqParams.push(departmentId);
  }

  const monthRequestSql = `
    SELECT 
      DATE_FORMAT(ar.start_date, '%Y-%m-%d') AS startDateStr,
      DATE_FORMAT(ar.end_date, '%Y-%m-%d') AS endDateStr,
      ar.person_id AS personId,
      at.code AS typeCode,
      at.name AS typeName,
      at.category AS typeCategory
    FROM attendance_requests ar
    JOIN m_person p ON ar.person_id = p.id
    LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
    ${reqWhereSql}
  `;
  const reqRows = await prisma.$queryRawUnsafe(monthRequestSql, ...reqParams);

  const dailyOnTime = [];
  const dailyLate = [];
  const dailyEarlyLeave = [];
  const dailyPermit = [];
  const dailyDuty = [];
  const dailyMangkir = [];
  const dailyAlpha = [];
  const dailyLateMinutes = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const row = monthMap[d];

    const onT = Number(row?.onTimeCount || 0);
    const lT = Number(row?.lateCount || 0);
    const eL = Number(row?.earlyLeaveCount || 0);
    const lM = Number(row?.totalLateMins || 0);

    let permitC = 0;
    let dutyC = 0;
    (reqRows || []).forEach(r => {
      if (r.startDateStr && r.endDateStr && dayStr >= r.startDateStr && dayStr <= r.endDateStr) {
        const code = String(r.typeCode || '').trim().toUpperCase();
        const name = String(r.typeName || '').trim().toUpperCase();
        const cat = String(r.typeCategory || '').trim().toUpperCase();

        if (code === 'DL' || code.includes('DINAS') || name.includes('DINAS') || cat.includes('DINAS')) {
          dutyC++;
        } else {
          permitC++;
        }
      }
    });

    const mangkirC = 0;
    const isFutureDay = dayStr > todayStrReal;
    const alphaCount = isFutureDay ? 0 : Math.max(0, totalEmployees - (onT + lT + permitC + dutyC));

    dailyOnTime.push(onT);
    dailyLate.push(lT);
    dailyEarlyLeave.push(eL);
    dailyPermit.push(permitC);
    dailyDuty.push(dutyC);
    dailyMangkir.push(mangkirC);
    dailyAlpha.push(alphaCount);
    dailyLateMinutes.push(lM);
  }

  return {
    daysInMonth,
    dailyOnTime,
    dailyLate,
    dailyEarlyLeave,
    dailyPermit,
    dailyDuty,
    dailyMangkir,
    dailyAlpha,
    dailyLateMinutes,
  };
};

/**
 * Helper: Fetch Department Breakdown Summary
 */
const fetchDepartmentSummary = async (prisma, { monthStr, now, institutionId, departmentId }) => {
  const [yStr, mStr] = (monthStr || '').split('-').map(Number);
  const year = yStr || (now ? now.getFullYear() : new Date().getFullYear());
  const month = mStr || (now ? now.getMonth() + 1 : new Date().getMonth() + 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startMonthStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const endMonthStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const sqlParams = [startMonthStr, endMonthStr];
  let deptWhereSql = 'WHERE d.is_deleted = 0';

  if (institutionId) {
    deptWhereSql += ' AND d.institution_id = ?';
    sqlParams.push(institutionId);
  }
  if (departmentId) {
    deptWhereSql += ' AND d.id = ?';
    sqlParams.push(departmentId);
  }

  const deptSql = `
    SELECT 
      d.id, d.name,
      COUNT(DISTINCT p.id) AS totalEmployees,
      COUNT(DISTINCT a.id) AS presentCount
    FROM m_department d
    LEFT JOIN m_person p ON p.department_id = d.id AND p.is_deleted = 0
    LEFT JOIN attendances a ON a.person_id = p.id 
      AND a.attendance_date >= ? 
      AND a.attendance_date <= ? 
      AND a.is_deleted = 0
    ${deptWhereSql}
    GROUP BY d.id, d.name
    ORDER BY presentCount DESC, d.name ASC
    LIMIT 10
  `;
  const deptRows = await prisma.$queryRawUnsafe(deptSql, ...sqlParams);

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
    fetchDepartmentSummary(prisma, { monthStr, now, institutionId, departmentId }),
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
