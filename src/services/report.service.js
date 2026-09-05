const prisma = require('../config/prisma');
const { formatTz } = require('../utils/timezone');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

const parseBoolean = (val, defaultVal = false) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  const s = String(val).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
};

/**
 * Report Service (MySQL Raw Query)
 * Generates Rekap Presensi Pegawai per Bulan & Tahun
 */

const { MONTH_NAMES, DAY_NAMES } = require('../constants/attendance.constants');

const formatTime = (date) => formatTz(date, 'HH:mm');
const formatDateDDMMYYYY = (date) => formatTz(date, 'DD/MM/YYYY') || '';
const formatDateYYYYMMDD = (date) => formatTz(date, 'YYYY-MM-DD') || '';

const getEmployeeRecap = async (params = {}) => {
  const personId = Number(params.personId || params.person_id);
  if (!personId) throw { status: 400, message: 'ID Pegawai (personId) wajib diisi' };

  const now = new Date();
  const year = Number(params.year || now.getFullYear());
  const month = Number(params.month || (now.getMonth() + 1));

  if (month < 1 || month > 12) throw { status: 400, message: 'Bulan tidak valid (1-12)' };

  // 1. Fetch Person Information via Raw SQL
  const personSql = `
    SELECT 
      p.id, p.nip, p.name, p.institution_id AS institutionId,
      i.code AS institutionCode, i.name AS institutionName,
      dept.code AS departmentCode, dept.name AS departmentName,
      pos.code AS positionCode, pos.name AS positionName
    FROM m_person p
    LEFT JOIN m_institution i ON p.institution_id = i.id
    LEFT JOIN m_department dept ON p.department_id = dept.id
    LEFT JOIN m_position pos ON p.position_id = pos.id
    WHERE p.id = ? AND p.is_deleted = 0
  `;
  const personResult = await prisma.$queryRawUnsafe(personSql, personId);
  if (!personResult || !personResult.length) {
    throw { status: 404, message: 'Data Pegawai tidak ditemukan' };
  }
  const person = personResult[0];

  // 2. Fetch App Config via Raw SQL
  const configSql = `
    SELECT company_name AS companyName, company_logo AS companyLogo, app_name AS appName
    FROM app_config
    LIMIT 1
  `;
  const configResult = await prisma.$queryRawUnsafe(configSql);
  const config = configResult[0] || { companyName: '' };

  // Date range for selected month
  const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // 3. Fetch Attendances via Raw SQL
  const attendanceSql = `
    SELECT 
      a.id, 
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendanceDateStr,
      a.attendance_date AS attendanceDate, 
      a.attendance_type AS attendanceType,
      DATE_FORMAT(a.checkin_time, '%H:%i') AS checkinTimeStr,
      DATE_FORMAT(a.checkout_time, '%H:%i') AS checkoutTimeStr,
      a.checkin_time AS checkinTime, 
      a.checkout_time AS checkoutTime,
      a.late_minutes AS lateMinutes, 
      a.early_leave_minutes AS earlyLeaveMinutes,
      a.status, 
      a.note
    FROM attendances a
    WHERE a.person_id = ? 
      AND a.attendance_date >= ? 
      AND a.attendance_date <= ? 
      AND a.is_deleted = 0
  `;
  const attendanceRows = await prisma.$queryRawUnsafe(attendanceSql, personId, startDateStr, endDateStr);
  
  const attendanceMap = {};
  (attendanceRows || []).forEach((row) => {
    const key = row.attendanceDateStr || formatDateYYYYMMDD(row.attendanceDate);
    attendanceMap[key] = row;
  });

  // 4. Fetch Attendance Requests via Raw SQL
  const requestSql = `
    SELECT 
      ar.id, ar.attendance_type_id AS attendanceTypeId,
      ar.start_date AS startDate, ar.end_date AS endDate,
      ar.start_time AS startTime, ar.end_time AS endTime,
      ar.duration_type AS durationType, ar.reason, ar.status,
      at.code AS attendanceTypeCode, at.name AS attendanceTypeName, at.category AS attendanceTypeCategory
    FROM attendance_requests ar
    LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
    WHERE ar.person_id = ? 
      AND ar.status = 'approved'
      AND ar.is_deleted = 0
      AND ar.start_date <= ?
      AND ar.end_date >= ?
  `;
  const requestRows = await prisma.$queryRawUnsafe(requestSql, personId, endDateStr, startDateStr);

  // 5. Fetch Holidays via Raw SQL
  const holidaySql = `
    SELECT 
      h.id, h.date, h.title, h.type, h.is_national AS isNational, h.institution_id AS institutionId
    FROM m_holiday h
    WHERE h.is_deleted = 0
      AND h.date >= ? 
      AND h.date <= ?
      AND (h.institution_id IS NULL OR h.institution_id = ?)
  `;
  const holidayRows = await prisma.$queryRawUnsafe(holidaySql, startDateStr, endDateStr, person.institutionId || 0);
  
  const holidayMap = {};
  (holidayRows || []).forEach((row) => {
    const key = formatDateYYYYMMDD(row.date);
    holidayMap[key] = row;
  });

  // 5b. Fetch Work Shift Patterns & Details via Raw SQL
  const patternSql = `
    SELECT 
      wsp.id AS patternId, wsp.person_id AS personId, wsp.shift_id AS shiftId,
      wsp.effective_from AS effectiveFrom, wsp.effective_until AS effectiveUntil,
      wsd.day_of_week AS dayOfWeek, wsd.is_working_day AS isWorkingDay, wsd.work_time_id AS workTimeId
    FROM work_shift_pattern wsp
    INNER JOIN work_shift ws ON wsp.shift_id = ws.id AND ws.is_deleted = 0
    LEFT JOIN work_shift_detail wsd ON ws.id = wsd.shift_id AND wsd.is_deleted = 0
    WHERE wsp.person_id = ?
      AND wsp.is_deleted = 0
      AND wsp.effective_from <= ?
      AND (wsp.effective_until IS NULL OR wsp.effective_until >= ?)
  `;
  const patternRows = await prisma.$queryRawUnsafe(patternSql, personId, endDateStr, startDateStr);

  // 6. Build Daily Grid
  const days = [];
  let totalLateMinutes = 0;
  let totalEarlyLeaveMinutes = 0;
  let countHadir = 0;
  let countMangkir = 0;
  let countAlpha = 0;
  let countLibur = 0;
  let countIzinCuti = 0;

  for (let day = 1; day <= lastDay; day++) {
    const currentDate = new Date(year, month - 1, day);
    const dateKey = formatDateYYYYMMDD(currentDate);
    const dayOfWeek = currentDate.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 1 = Senin, ..., 7 = Minggu
    const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const holiday = holidayMap[dateKey];
    const attendance = attendanceMap[dateKey];

    // Determine off day dynamically from WorkShiftPattern
    let isWorkingDayFromShift = null;
    if (patternRows && patternRows.length > 0) {
      const activePatterns = patternRows.filter((p) => {
        const effFrom = formatDateYYYYMMDD(p.effectiveFrom);
        const effUntil = p.effectiveUntil ? formatDateYYYYMMDD(p.effectiveUntil) : '9999-12-31';
        return dateKey >= effFrom && dateKey <= effUntil;
      });

      if (activePatterns.length > 0) {
        const matchedDetail = activePatterns.find(
          (d) => Number(d.dayOfWeek) === isoDay || Number(d.dayOfWeek) === dayOfWeek
        );
        if (matchedDetail) {
          isWorkingDayFromShift = Boolean(Number(matchedDetail.isWorkingDay) === 1 || matchedDetail.isWorkingDay === true);
        }
      }
    }

    const isShiftOffDay = isWorkingDayFromShift !== null ? !isWorkingDayFromShift : isStandardWeekend;

    // Find matching request for currentDate
    const matchedRequest = (requestRows || []).find((req) => {
      const start = formatDateYYYYMMDD(req.startDate);
      const end = formatDateYYYYMMDD(req.endDate);
      return dateKey >= start && dateKey <= end;
    });

    let keterangan = '';
    let keteranganDetail = '';
    let categoryClass = 'normal'; // 'libur', 'izin', 'sakit', 'dinas', 'peringatan', 'terlambat', 'pulang_cepat', 'mangkir', 'alpha', 'hadir'

    let regularMasuk = '-';
    let telatJam = '-';
    let telatMenit = '-';
    let regularPulang = '-';
    let pulangCepatJam = '-';
    let pulangCepatMenit = '-';
    let nonRegularMasuk = '-';
    let nonRegularPulang = '-';

    if (holiday) {
      keterangan = 'LIBUR';
      keteranganDetail = `LIBUR ( ${holiday.title.toUpperCase()} )`;
      categoryClass = 'libur';
      countLibur++;
    } else if (isShiftOffDay) {
      keterangan = 'LIBUR';
      categoryClass = 'libur';
      countLibur++;
    } else if (matchedRequest) {
      const typeCode = (matchedRequest.attendanceTypeCode || 'IZIN').toUpperCase();
      const typeName = (matchedRequest.attendanceTypeName || '').toUpperCase();
      const typeCategory = (matchedRequest.attendanceTypeCategory || '').toUpperCase();

      keterangan = matchedRequest.attendanceTypeCode || 'IZIN';
      keteranganDetail = matchedRequest.reason ? `${matchedRequest.attendanceTypeName} ( ${matchedRequest.reason} )` : matchedRequest.attendanceTypeName;

      if (typeCode === 'SK' || typeName.includes('SAKIT')) {
        categoryClass = 'sakit';
      } else if (['DLK', 'DDS', 'DDK'].includes(typeCode) || typeCategory.includes('DINAS') || typeName.includes('DINAS')) {
        categoryClass = 'dinas';
      } else if (['LBN', 'LIBUR'].includes(typeCode) || typeName.includes('LIBUR')) {
        categoryClass = 'libur';
      } else {
        categoryClass = 'izin';
      }
      countIzinCuti++;

      if (matchedRequest.startTime) nonRegularMasuk = matchedRequest.startTime;
      if (matchedRequest.endTime) nonRegularPulang = matchedRequest.endTime;
    } else {
      const hasCheckin = Boolean(attendance && (attendance.checkinTimeStr || attendance.checkinTime));
      const hasCheckout = Boolean(attendance && (attendance.checkoutTimeStr || attendance.checkoutTime));

      if (hasCheckin && hasCheckout) {
        // Both Check-in and Check-out present -> Hadir
        regularMasuk = attendance.checkinTimeStr || formatTime(attendance.checkinTime) || '-';
        regularPulang = attendance.checkoutTimeStr || formatTime(attendance.checkoutTime) || '-';
        keterangan = 'H';
        categoryClass = 'hadir';
        countHadir++;

        const lateMins = Number(attendance.lateMinutes || 0);
        const earlyMins = Number(attendance.earlyLeaveMinutes || 0);

        if (lateMins > 0) {
          totalLateMinutes += lateMins;
          telatJam = Math.floor(lateMins / 60) > 0 ? String(Math.floor(lateMins / 60)) : '-';
          telatMenit = String(lateMins % 60);
        }

        if (earlyMins > 0) {
          totalEarlyLeaveMinutes += earlyMins;
          pulangCepatJam = Math.floor(earlyMins / 60) > 0 ? String(Math.floor(earlyMins / 60)) : '-';
          pulangCepatMenit = String(earlyMins % 60);
        }

        if (lateMins > 0 && earlyMins > 0) {
          categoryClass = 'peringatan';
        } else if (lateMins > 0) {
          categoryClass = 'terlambat';
        } else if (earlyMins > 0) {
          categoryClass = 'pulang_cepat';
        }
      } else if (hasCheckin || hasCheckout) {
        // One is present, but the other is missing -> Mangkir
        if (hasCheckin) regularMasuk = attendance.checkinTimeStr || formatTime(attendance.checkinTime) || '-';
        if (hasCheckout) regularPulang = attendance.checkoutTimeStr || formatTime(attendance.checkoutTime) || '-';
        keterangan = 'M';
        categoryClass = 'mangkir';
        countMangkir++;
      } else {
        // Neither check-in nor check-out -> Alpha
        const todayKey = formatDateYYYYMMDD(new Date());
        if (dateKey <= todayKey) {
          keterangan = 'A';
          categoryClass = 'alpha';
          countAlpha++;
        }
      }
    }

    days.push({
      date: formatDateDDMMYYYY(currentDate),
      dateKey,
      dayName: DAY_NAMES[dayOfWeek],
      regularMasuk,
      telatJam,
      telatMenit,
      regularPulang,
      pulangCepatJam,
      pulangCepatMenit,
      nonRegularMasuk,
      nonRegularPulang,
      keterangan,
      keteranganDetail,
      categoryClass,
    });
  }

  const totalLateHours = Math.floor(totalLateMinutes / 60);
  const totalLateRemainingMinutes = totalLateMinutes % 60;

  const totalEarlyLeaveHours = Math.floor(totalEarlyLeaveMinutes / 60);
  const totalEarlyLeaveRemainingMinutes = totalEarlyLeaveMinutes % 60;

  return {
    company: {
      name: config.companyName || '',
      logo: config.companyLogo || null,
      title: 'LAPORAN PER PERIODE KEHADIRAN PEGAWAI',
      periodText: `${MONTH_NAMES[month - 1]} ${year}`,
      month,
      year,
    },
    employee: {
      id: person.id,
      name: person.name,
      nip: person.nip || '-',
      department: person.departmentName || '-',
      position: person.positionName || '-',
      institution: person.institutionName || '-',
    },
    summary: {
      daysInMonth: lastDay,
      totalLateMinutes,
      totalLateHours,
      totalLateRemainingMinutes,
      totalEarlyLeaveMinutes,
      totalEarlyLeaveHours,
      totalEarlyLeaveRemainingMinutes,
      countHadir,
      countMangkir,
      countAlpha,
      countLibur,
      countIzinCuti,
    },
    days,
  };
};

const getEmployeeSummary = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const ignorePaging = parseBoolean(params.ignorePaging, false);
  const keyword = params.q ?? null;

  const now = new Date();
  let startDateStr = '';
  let endDateStr = '';
  let periodText = '';

  if (params.startDate && params.endDate) {
    startDateStr = params.startDate;
    endDateStr = params.endDate;
    periodText = `${formatDateDDMMYYYY(new Date(startDateStr))} s/d ${formatDateDDMMYYYY(new Date(endDateStr))}`;
  } else {
    const year = Number(params.year || now.getFullYear());
    const month = Number(params.month || (now.getMonth() + 1));
    if (month < 1 || month > 12) throw { status: 400, message: 'Bulan tidak valid (1-12)' };

    startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    periodText = `${MONTH_NAMES[month - 1]} ${year}`;
  }

  // Bindings for CTE dates
  const cteParams = [startDateStr, endDateStr];

  // Where clauses & bindings for m_person
  let whereClauses = ['p.is_deleted = 0'];
  let whereParams = [];

  const institutionId = params.institutionId || params.institution_id;
  if (institutionId) {
    whereClauses.push('p.institution_id = ?');
    whereParams.push(Number(institutionId));
  }

  const departmentId = params.departmentId || params.department_id;
  if (departmentId) {
    whereClauses.push('p.department_id = ?');
    whereParams.push(Number(departmentId));
  }

  if (keyword) {
    whereClauses.push("CONCAT(IFNULL(p.name, ''), IFNULL(p.nip, ''), IFNULL(dept.name, ''), IFNULL(pos.name, ''), IFNULL(i.name, '')) LIKE ?");
    whereParams.push(`%${keyword}%`);
  }

  const ALLOWED_SORT_COLUMNS = {
    nip: 'nip',
    name: 'name',
    institutionName: 'institutionName',
    departmentName: 'departmentName',
    positionName: 'positionName',
    countHadir: 'countHadir',
    countTerlambat: 'countTerlambat',
    totalLateMinutes: 'totalLateMinutes',
    countPulangCepat: 'countPulangCepat',
    totalEarlyLeaveMinutes: 'totalEarlyLeaveMinutes',
    countIzin: 'countIzin',
    countCuti: 'countCuti',
    countSakit: 'countSakit',
    countDinas: 'countDinas',
    countMangkir: 'countMangkir',
    countAlpha: 'countAlpha',
    countLibur: 'countLibur',
  };

  const rawSortBy = params.sortBy || params.sort_by;
  const sortBy = ALLOWED_SORT_COLUMNS[rawSortBy] || 'name';
  const sortType = (params.sortType || params.sort_type || 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const sqlBindings = [...cteParams, ...whereParams];

  const fullCteQuery = `
    WITH RECURSIVE dates AS (
      SELECT CAST(? AS DATE) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY)
      FROM dates
      WHERE d < CAST(? AS DATE)
    ),
    person_summary AS (
      SELECT 
        p.id AS personId,
        p.nip,
        p.name,
        i.name AS institutionName,
        dept.name AS departmentName,
        pos.name AS positionName,
        
        CAST(SUM(CASE WHEN a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL THEN 1 ELSE 0 END) AS SIGNED) AS countHadir,
        CAST(SUM(CASE WHEN a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL AND IFNULL(a.late_minutes, 0) > 0 THEN 1 ELSE 0 END) AS SIGNED) AS countTerlambat,
        CAST(SUM(CASE WHEN a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL THEN IFNULL(a.late_minutes, 0) ELSE 0 END) AS SIGNED) AS totalLateMinutes,
        CAST(SUM(CASE WHEN a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL AND IFNULL(a.early_leave_minutes, 0) > 0 THEN 1 ELSE 0 END) AS SIGNED) AS countPulangCepat,
        CAST(SUM(CASE WHEN a.checkin_time IS NOT NULL AND a.checkout_time IS NOT NULL THEN IFNULL(a.early_leave_minutes, 0) ELSE 0 END) AS SIGNED) AS totalEarlyLeaveMinutes,
        CAST(SUM(CASE WHEN a.id IS NULL AND ar.id IS NOT NULL AND (UPPER(at.code) = 'SK' OR UPPER(at.name) LIKE '%SAKIT%') THEN 1 ELSE 0 END) AS SIGNED) AS countSakit,
        CAST(SUM(CASE WHEN a.id IS NULL AND ar.id IS NOT NULL AND (UPPER(at.code) IN ('DLK','DDS','DDK') OR UPPER(at.category) LIKE '%DINAS%' OR UPPER(at.name) LIKE '%DINAS%') THEN 1 ELSE 0 END) AS SIGNED) AS countDinas,
        CAST(SUM(CASE WHEN a.id IS NULL AND ar.id IS NOT NULL AND (UPPER(at.code) LIKE '%CT%' OR UPPER(at.name) LIKE '%CUTI%') THEN 1 ELSE 0 END) AS SIGNED) AS countCuti,
        CAST(SUM(CASE WHEN a.id IS NULL AND ar.id IS NOT NULL AND NOT (UPPER(at.code) = 'SK' OR UPPER(at.name) LIKE '%SAKIT%') AND NOT (UPPER(at.code) IN ('DLK','DDS','DDK') OR UPPER(at.category) LIKE '%DINAS%' OR UPPER(at.name) LIKE '%DINAS%') AND NOT (UPPER(at.code) LIKE '%CT%' OR UPPER(at.name) LIKE '%CUTI%') AND NOT (UPPER(at.code) IN ('LBN','LIBUR') OR UPPER(at.name) LIKE '%LIBUR%') THEN 1 ELSE 0 END) AS SIGNED) AS countIzin,
        CAST(SUM(CASE WHEN h.id IS NOT NULL OR DAYOFWEEK(d.d) IN (1, 7) OR (a.id IS NULL AND ar.id IS NOT NULL AND (UPPER(at.code) IN ('LBN','LIBUR') OR UPPER(at.name) LIKE '%LIBUR%')) THEN 1 ELSE 0 END) AS SIGNED) AS countLibur,
        CAST(SUM(CASE WHEN (a.checkin_time IS NOT NULL AND a.checkout_time IS NULL) OR (a.checkin_time IS NULL AND a.checkout_time IS NOT NULL) THEN 1 ELSE 0 END) AS SIGNED) AS countMangkir,
        CAST(SUM(CASE WHEN a.id IS NULL AND ar.id IS NULL AND h.id IS NULL AND DAYOFWEEK(d.d) NOT IN (1, 7) AND d.d <= CURRENT_DATE() THEN 1 ELSE 0 END) AS SIGNED) AS countAlpha
      FROM dates d
      CROSS JOIN m_person p
      LEFT JOIN m_institution i ON p.institution_id = i.id
      LEFT JOIN m_department dept ON p.department_id = dept.id
      LEFT JOIN m_position pos ON p.position_id = pos.id
      LEFT JOIN attendances a ON p.id = a.person_id AND a.attendance_date = d.d AND a.is_deleted = 0
      LEFT JOIN attendance_requests ar ON p.id = ar.person_id AND ar.status = 'approved' AND ar.is_deleted = 0 AND d.d >= ar.start_date AND d.d <= ar.end_date
      LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
      LEFT JOIN m_holiday h ON h.date = d.d AND h.is_deleted = 0 AND (h.institution_id IS NULL OR h.institution_id = p.institution_id)
      WHERE ${whereClauses.join(' AND ')}
      GROUP BY p.id, p.nip, p.name, i.name, dept.name, pos.name
    )
  `;

  // Exec Total Summary Query
  const totalSummarySql = `
    ${fullCteQuery}
    SELECT 
      COUNT(*) AS totalEmployee,
      CAST(IFNULL(SUM(countHadir), 0) AS SIGNED) AS totalHadir,
      CAST(IFNULL(SUM(countTerlambat), 0) AS SIGNED) AS totalTerlambat,
      CAST(IFNULL(SUM(totalLateMinutes), 0) AS SIGNED) AS totalLateMinutes,
      CAST(IFNULL(SUM(countPulangCepat), 0) AS SIGNED) AS totalPulangCepat,
      CAST(IFNULL(SUM(totalEarlyLeaveMinutes), 0) AS SIGNED) AS totalEarlyLeaveMinutes,
      CAST(IFNULL(SUM(countIzin), 0) AS SIGNED) AS totalIzin,
      CAST(IFNULL(SUM(countCuti), 0) AS SIGNED) AS totalCuti,
      CAST(IFNULL(SUM(countSakit), 0) AS SIGNED) AS totalSakit,
      CAST(IFNULL(SUM(countDinas), 0) AS SIGNED) AS totalDinas,
      CAST(IFNULL(SUM(countMangkir), 0) AS SIGNED) AS totalMangkir,
      CAST(IFNULL(SUM(countAlpha), 0) AS SIGNED) AS totalAlpha,
      CAST(IFNULL(SUM(countLibur), 0) AS SIGNED) AS totalLibur
    FROM person_summary
  `;
  const totalSummaryRows = await prisma.$queryRawUnsafe(totalSummarySql, ...sqlBindings);
  const summaryRow = totalSummaryRows[0] || {};
  const total = Number(summaryRow.totalEmployee || 0);

  if (total === 0) {
    const paginationResult = paginate([], 0, pageNumber, pageSize);
    return {
      periodText,
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        totalEmployee: 0,
        totalHadir: 0,
        totalTerlambat: 0,
        totalLateMinutes: 0,
        totalLateHours: 0,
        totalLateRemainingMinutes: 0,
        totalPulangCepat: 0,
        totalEarlyLeaveMinutes: 0,
        totalEarlyLeaveHours: 0,
        totalEarlyLeaveRemainingMinutes: 0,
        totalIzin: 0,
        totalCuti: 0,
        totalSakit: 0,
        totalDinas: 0,
        totalMangkir: 0,
        totalAlpha: 0,
        totalLibur: 0,
      },
      ...paginationResult,
    };
  }

  // Exec Data Query with ORDER BY and LIMIT/OFFSET
  let dataSql = `
    ${fullCteQuery}
    SELECT * FROM person_summary
    ORDER BY ${sortBy} ${sortType}
  `;

  let rows;
  if (ignorePaging) {
    rows = await prisma.$queryRawUnsafe(dataSql, ...sqlBindings);
  } else {
    dataSql += ` LIMIT ? OFFSET ?`;
    rows = await prisma.$queryRawUnsafe(dataSql, ...sqlBindings, pageSize, skip);
  }

  const items = (rows || []).map((row) => {
    const lateMins = Number(row.totalLateMinutes || 0);
    const earlyMins = Number(row.totalEarlyLeaveMinutes || 0);
    return {
      personId: Number(row.personId),
      nip: row.nip || '-',
      name: row.name,
      institutionName: row.institutionName || '-',
      departmentName: row.departmentName || '-',
      positionName: row.positionName || '-',
      countHadir: Number(row.countHadir || 0),
      countTerlambat: Number(row.countTerlambat || 0),
      totalLateMinutes: lateMins,
      totalLateHours: Math.floor(lateMins / 60),
      totalLateRemainingMinutes: lateMins % 60,
      countPulangCepat: Number(row.countPulangCepat || 0),
      totalEarlyLeaveMinutes: earlyMins,
      totalEarlyLeaveHours: Math.floor(earlyMins / 60),
      totalEarlyLeaveRemainingMinutes: earlyMins % 60,
      countIzin: Number(row.countIzin || 0),
      countCuti: Number(row.countCuti || 0),
      countSakit: Number(row.countSakit || 0),
      countDinas: Number(row.countDinas || 0),
      countMangkir: Number(row.countMangkir || 0),
      countAlpha: Number(row.countAlpha || 0),
      countLibur: Number(row.countLibur || 0),
    };
  });

  const sumLateMinutes = Number(summaryRow.totalLateMinutes || 0);
  const sumEarlyLeaveMinutes = Number(summaryRow.totalEarlyLeaveMinutes || 0);

  const totalSummary = {
    totalEmployee: total,
    totalHadir: Number(summaryRow.totalHadir || 0),
    totalTerlambat: Number(summaryRow.totalTerlambat || 0),
    totalLateMinutes: sumLateMinutes,
    totalLateHours: Math.floor(sumLateMinutes / 60),
    totalLateRemainingMinutes: sumLateMinutes % 60,
    totalPulangCepat: Number(summaryRow.totalPulangCepat || 0),
    totalEarlyLeaveMinutes: sumEarlyLeaveMinutes,
    totalEarlyLeaveHours: Math.floor(sumEarlyLeaveMinutes / 60),
    totalEarlyLeaveRemainingMinutes: sumEarlyLeaveMinutes % 60,
    totalIzin: Number(summaryRow.totalIzin || 0),
    totalCuti: Number(summaryRow.totalCuti || 0),
    totalSakit: Number(summaryRow.totalSakit || 0),
    totalDinas: Number(summaryRow.totalDinas || 0),
    totalMangkir: Number(summaryRow.totalMangkir || 0),
    totalAlpha: Number(summaryRow.totalAlpha || 0),
    totalLibur: Number(summaryRow.totalLibur || 0),
  };

  return {
    periodText,
    startDate: startDateStr,
    endDate: endDateStr,
    summary: totalSummary,
    ...paginate(
      items,
      total,
      pageNumber,
      ignorePaging ? (total || 1) : pageSize
    ),
  };
};

module.exports = { getEmployeeRecap, getEmployeeSummary };

