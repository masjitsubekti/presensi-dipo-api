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

const evaluatePersonSummaryForPeriod = ({
  person,
  startDateStr,
  endDateStr,
  attendanceMap = {},
  requestRows = [],
  holidayMap = {},
  patternRows = [],
}) => {
  let countHadir = 0;
  let countTerlambat = 0;
  let totalLateMinutes = 0;
  let countPulangCepat = 0;
  let totalEarlyLeaveMinutes = 0;
  let countIzin = 0;
  let countCuti = 0;
  let countSakit = 0;
  let countDinas = 0;
  let countMangkir = 0;
  let countAlpha = 0;
  let countLibur = 0;
  let countIzinCuti = 0;
  let countHariKerja = 0;

  const days = [];
  const curDate = new Date(`${startDateStr}T00:00:00`);
  const endDateObj = new Date(`${endDateStr}T00:00:00`);
  const todayKey = formatDateYYYYMMDD(new Date());

  while (curDate <= endDateObj) {
    const currentDate = new Date(curDate);
    const dateKey = formatDateYYYYMMDD(currentDate);
    const dayOfWeek = currentDate.getDay(); // 0 = Minggu, 1 = Senin, ..., 6 = Sabtu
    const isoDay = dayOfWeek === 0 ? 7 : dayOfWeek; // 1 = Senin, ..., 7 = Minggu
    const isStandardWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Check holiday for this person's institution or global (institution_id IS NULL)
    const rawHolidays = holidayMap[dateKey];
    let holiday = null;
    if (Array.isArray(rawHolidays)) {
      holiday = rawHolidays.find(
        (h) => !h.institutionId || Number(h.institutionId) === Number(person.institutionId || 0)
      );
    } else if (rawHolidays) {
      if (!rawHolidays.institutionId || Number(rawHolidays.institutionId) === Number(person.institutionId || 0)) {
        holiday = rawHolidays;
      }
    }

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
      keteranganDetail = `LIBUR ( ${(holiday.title || '').toUpperCase()} )`;
      categoryClass = 'libur';
      countLibur++;
    } else if (isShiftOffDay) {
      keterangan = 'LIBUR';
      categoryClass = 'libur';
      countLibur++;
    } else {
      countHariKerja++;
      if (matchedRequest) {
      const typeCode = (matchedRequest.attendanceTypeCode || 'IZIN').trim().toUpperCase();
      const typeName = (matchedRequest.attendanceTypeName || '').trim().toUpperCase();
      const typeCategory = (matchedRequest.attendanceTypeCategory || '').trim().toUpperCase();

      keteranganDetail = matchedRequest.reason 
        ? `${matchedRequest.attendanceTypeName} ( ${matchedRequest.reason} )` 
        : matchedRequest.attendanceTypeName;

      if (typeCode === 'SK' || typeName.includes('SAKIT')) {
        keterangan = matchedRequest.attendanceTypeCode || 'SK';
        categoryClass = 'sakit';
        countSakit++;
      } else if (
        ['CT', 'CTH', 'CM', 'CBR'].includes(typeCode) || 
        typeCategory === 'TIME_OFF' || 
        typeCategory.includes('TIME_OFF') || 
        typeCategory.includes('CUTI') || 
        typeName.includes('CUTI')
      ) {
        keterangan = matchedRequest.attendanceTypeCode || 'CTH';
        categoryClass = 'cuti';
        countCuti++;
      } else if (
        ['DL', 'DLK', 'DDS', 'DDK'].includes(typeCode) || 
        typeCategory === 'DUTY' || 
        typeCategory.includes('DUTY') || 
        typeCategory.includes('DINAS') || 
        typeName.includes('DINAS')
      ) {
        keterangan = matchedRequest.attendanceTypeCode || 'DL';
        categoryClass = 'dinas';
        countDinas++;
      } else if (typeCode === 'WFH' || typeName.includes('HOME') || typeName.includes('WFH')) {
        keterangan = matchedRequest.attendanceTypeCode || 'WFH';
        categoryClass = 'izin';
        countIzin++;
      } else if (['LBN', 'LIBUR', 'LIBNAS'].includes(typeCode) || typeName.includes('LIBUR')) {
        keterangan = matchedRequest.attendanceTypeCode || 'LBN';
        categoryClass = 'libur';
        countLibur++;
      } else {
        keterangan = matchedRequest.attendanceTypeCode || 'I';
        categoryClass = 'izin';
        countIzin++;
      }
      countIzinCuti++;

      if (matchedRequest.startTime) nonRegularMasuk = matchedRequest.startTime;
      if (matchedRequest.endTime) nonRegularPulang = matchedRequest.endTime;
    } else {
      const isToday = dateKey === todayKey;
      const hasCheckin = Boolean(attendance && (attendance.checkinTimeStr || attendance.checkinTime));
      const hasCheckout = Boolean(attendance && (attendance.checkoutTimeStr || attendance.checkoutTime));
      const attTypeUpper = String(attendance?.attendanceType || '').trim().toUpperCase();
      const attStatusUpper = String(attendance?.status || '').trim().toUpperCase();

      const isExplicitMangkir = attStatusUpper.includes('MANGKIR') || attTypeUpper === 'M';
      const isIncompletePastDay = !isToday && dateKey < todayKey && (!hasCheckin || !hasCheckout);
      const isMangkir = (hasCheckin || hasCheckout) && (isExplicitMangkir || isIncompletePastDay);

      if (hasCheckin || hasCheckout) {
        if (hasCheckin) regularMasuk = attendance.checkinTimeStr || formatTime(attendance.checkinTime) || '-';
        if (hasCheckout) regularPulang = attendance.checkoutTimeStr || formatTime(attendance.checkoutTime) || '-';

        const lateMins = Number(attendance.lateMinutes || 0);
        const earlyMins = Number(attendance.earlyLeaveMinutes || 0);

        if (lateMins > 0) {
          totalLateMinutes += lateMins;
          countTerlambat++;
          telatJam = Math.floor(lateMins / 60) > 0 ? String(Math.floor(lateMins / 60)) : '-';
          telatMenit = String(lateMins % 60);
        }

        if (earlyMins > 0) {
          totalEarlyLeaveMinutes += earlyMins;
          countPulangCepat++;
          pulangCepatJam = Math.floor(earlyMins / 60) > 0 ? String(Math.floor(earlyMins / 60)) : '-';
          pulangCepatMenit = String(earlyMins % 60);
        }

        const lateStr = Math.floor(lateMins / 60) > 0 ? `${Math.floor(lateMins / 60)}j ${lateMins % 60}m` : `${lateMins % 60}m`;

        if (isMangkir) {
          keterangan = 'M';
          categoryClass = 'mangkir';
          countMangkir++;
          countHadir++;
        } else {
          if (attTypeUpper === 'DL' || attStatusUpper.includes('DINAS')) {
            keterangan = 'DL';
            categoryClass = 'dinas';
          } else if (attTypeUpper === 'WFH' || attStatusUpper.includes('WFH')) {
            keterangan = 'WFH';
            categoryClass = 'izin';
          } else {
            keterangan = 'H';
            categoryClass = 'hadir';
          }
          countHadir++;

          const isLateExceeded = attStatusUpper === 'LATE' || attStatusUpper.includes('LATE') || attStatusUpper.includes('TERLAMBAT');

          if (lateMins > 0) {
            if (isLateExceeded) {
              categoryClass = 'terlambat';
            } else {
              categoryClass = 'peringatan';
              keteranganDetail = `PERINGATAN (Terlambat ${lateStr})`;
            }
          } else if (earlyMins > 0) {
            categoryClass = 'pulang_cepat';
          }
        }
      } else {
        if (dateKey <= todayKey) {
          keterangan = 'A';
          categoryClass = 'alpha';
          countAlpha++;
        }
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

    curDate.setDate(curDate.getDate() + 1);
  }

  return {
    countHariKerja,
    countHadir,
    countTerlambat,
    totalLateMinutes,
    countPulangCepat,
    totalEarlyLeaveMinutes,
    countIzin,
    countCuti,
    countSakit,
    countDinas,
    countMangkir,
    countAlpha,
    countLibur,
    countIzinCuti,
    days,
  };
};

const getEmployeeRecap = async (params = {}) => {
  const personId = Number(params.personId || params.person_id);
  if (!personId) throw { status: 400, message: 'ID Pegawai (personId) wajib diisi' };

  const now = new Date();
  let startDateStr = params.startDate || params.start_date;
  let endDateStr = params.endDate || params.end_date;

  if (!startDateStr || !endDateStr) {
    const year = Number(params.year || now.getFullYear());
    const month = Number(params.month || (now.getMonth() + 1));
    if (month < 1 || month > 12) throw { status: 400, message: 'Bulan tidak valid (1-12)' };

    startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

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

  // Evaluate daily grid & summary using shared evaluation function
  const evaluated = evaluatePersonSummaryForPeriod({
    person,
    startDateStr,
    endDateStr,
    attendanceMap,
    requestRows,
    holidayMap,
    patternRows,
  });

  const totalLateHours = Math.floor(evaluated.totalLateMinutes / 60);
  const totalLateRemainingMinutes = evaluated.totalLateMinutes % 60;

  const totalEarlyLeaveHours = Math.floor(evaluated.totalEarlyLeaveMinutes / 60);
  const totalEarlyLeaveRemainingMinutes = evaluated.totalEarlyLeaveMinutes % 60;

  const startObj = new Date(`${startDateStr}T00:00:00`);
  const endObj = new Date(`${endDateStr}T00:00:00`);
  const startMonth = startObj.getMonth();
  const endMonth = endObj.getMonth();
  const startYear = startObj.getFullYear();
  const endYear = endObj.getFullYear();
  const lastDayOfStartMonth = new Date(startYear, startMonth + 1, 0).getDate();
  const isFullMonth = startMonth === endMonth && startYear === endYear && startObj.getDate() === 1 && endObj.getDate() === lastDayOfStartMonth;

  let periodText = '';
  if (isFullMonth) {
    periodText = `${MONTH_NAMES[startMonth]} ${startYear}`;
  } else {
    periodText = `${formatDateDDMMYYYY(startObj)} s/d ${formatDateDDMMYYYY(endObj)}`;
  }

  return {
    company: {
      name: config.companyName || '',
      logo: config.companyLogo || null,
      title: 'LAPORAN PER PERIODE KEHADIRAN PEGAWAI',
      periodText,
      startDate: startDateStr,
      endDate: endDateStr,
      month: startMonth + 1,
      year: startYear,
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
      daysInMonth: evaluated.days.length,
      hariKerja: evaluated.countHariKerja,
      countHariKerja: evaluated.countHariKerja,
      totalLateMinutes: evaluated.totalLateMinutes,
      totalLateHours,
      totalLateRemainingMinutes,
      totalEarlyLeaveMinutes: evaluated.totalEarlyLeaveMinutes,
      totalEarlyLeaveHours,
      totalEarlyLeaveRemainingMinutes,
      countHadir: evaluated.countHadir,
      countMangkir: evaluated.countMangkir,
      countAlpha: evaluated.countAlpha,
      countLibur: evaluated.countLibur,
      countIzinCuti: evaluated.countIzinCuti,
    },
    days: evaluated.days,
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

  // 1. Where clauses & bindings for m_person
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

  const personSql = `
    SELECT 
      p.id AS personId,
      p.nip,
      p.name,
      p.institution_id AS institutionId,
      i.name AS institutionName,
      dept.name AS departmentName,
      pos.name AS positionName
    FROM m_person p
    LEFT JOIN m_institution i ON p.institution_id = i.id
    LEFT JOIN m_department dept ON p.department_id = dept.id
    LEFT JOIN m_position pos ON p.position_id = pos.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY p.name ASC
  `;

  const persons = await prisma.$queryRawUnsafe(personSql, ...whereParams);
  const total = (persons || []).length;

  if (total === 0) {
    const paginationResult = paginate([], 0, pageNumber, pageSize);
    return {
      periodText,
      startDate: startDateStr,
      endDate: endDateStr,
      summary: {
        totalEmployee: 0,
        totalHariKerja: 0,
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

  const personIds = persons.map((p) => Number(p.personId));
  const placeholders = personIds.map(() => '?').join(',');

  // 2. Batch Fetch Attendances
  const attendanceSql = `
    SELECT 
      a.person_id AS personId,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendanceDateStr,
      a.attendance_date AS attendanceDate,
      a.attendance_type AS attendanceType,
      DATE_FORMAT(a.checkin_time, '%H:%i') AS checkinTimeStr,
      DATE_FORMAT(a.checkout_time, '%H:%i') AS checkoutTimeStr,
      a.checkin_time AS checkinTime,
      a.checkout_time AS checkoutTime,
      a.late_minutes AS lateMinutes,
      a.early_leave_minutes AS earlyLeaveMinutes,
      a.status
    FROM attendances a
    WHERE a.is_deleted = 0
      AND a.attendance_date >= ?
      AND a.attendance_date <= ?
      AND a.person_id IN (${placeholders})
  `;
  const attendanceRows = await prisma.$queryRawUnsafe(attendanceSql, startDateStr, endDateStr, ...personIds);

  const attendanceMapByPerson = {};
  (attendanceRows || []).forEach((row) => {
    const pid = Number(row.personId);
    if (!attendanceMapByPerson[pid]) attendanceMapByPerson[pid] = {};
    const key = row.attendanceDateStr || formatDateYYYYMMDD(row.attendanceDate);
    attendanceMapByPerson[pid][key] = row;
  });

  // 3. Batch Fetch Attendance Requests
  const requestSql = `
    SELECT 
      ar.person_id AS personId,
      ar.start_date AS startDate,
      ar.end_date AS endDate,
      ar.start_time AS startTime,
      ar.end_time AS endTime,
      ar.reason,
      ar.status,
      at.code AS attendanceTypeCode,
      at.name AS attendanceTypeName,
      at.category AS attendanceTypeCategory
    FROM attendance_requests ar
    LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
    WHERE ar.status = 'approved'
      AND ar.is_deleted = 0
      AND ar.start_date <= ?
      AND ar.end_date >= ?
      AND ar.person_id IN (${placeholders})
  `;
  const requestRows = await prisma.$queryRawUnsafe(requestSql, endDateStr, startDateStr, ...personIds);

  const requestsByPerson = {};
  (requestRows || []).forEach((row) => {
    const pid = Number(row.personId);
    if (!requestsByPerson[pid]) requestsByPerson[pid] = [];
    requestsByPerson[pid].push(row);
  });

  // 4. Batch Fetch Holidays
  const holidaySql = `
    SELECT 
      h.id, h.date, h.title, h.institution_id AS institutionId
    FROM m_holiday h
    WHERE h.is_deleted = 0
      AND h.date >= ?
      AND h.date <= ?
  `;
  const holidayRows = await prisma.$queryRawUnsafe(holidaySql, startDateStr, endDateStr);

  const holidayMap = {};
  (holidayRows || []).forEach((row) => {
    const key = formatDateYYYYMMDD(row.date);
    if (!holidayMap[key]) holidayMap[key] = [];
    holidayMap[key].push(row);
  });

  // 5. Batch Fetch Work Shift Patterns
  const patternSql = `
    SELECT 
      wsp.person_id AS personId, wsp.shift_id AS shiftId,
      wsp.effective_from AS effectiveFrom, wsp.effective_until AS effectiveUntil,
      wsd.day_of_week AS dayOfWeek, wsd.is_working_day AS isWorkingDay
    FROM work_shift_pattern wsp
    INNER JOIN work_shift ws ON wsp.shift_id = ws.id AND ws.is_deleted = 0
    LEFT JOIN work_shift_detail wsd ON ws.id = wsd.shift_id AND wsd.is_deleted = 0
    WHERE wsp.is_deleted = 0
      AND wsp.effective_from <= ?
      AND (wsp.effective_until IS NULL OR wsp.effective_until >= ?)
      AND wsp.person_id IN (${placeholders})
  `;
  const patternRows = await prisma.$queryRawUnsafe(patternSql, endDateStr, startDateStr, ...personIds);

  const patternsByPerson = {};
  (patternRows || []).forEach((row) => {
    const pid = Number(row.personId);
    if (!patternsByPerson[pid]) patternsByPerson[pid] = [];
    patternsByPerson[pid].push(row);
  });

  // 6. Evaluate summary per person
  const evaluatedItems = persons.map((person) => {
    const pid = Number(person.personId);
    const summary = evaluatePersonSummaryForPeriod({
      person: { ...person, institutionId: person.institutionId },
      startDateStr,
      endDateStr,
      attendanceMap: attendanceMapByPerson[pid] || {},
      requestRows: requestsByPerson[pid] || [],
      holidayMap,
      patternRows: patternsByPerson[pid] || [],
    });

    const lateMins = summary.totalLateMinutes;
    const earlyMins = summary.totalEarlyLeaveMinutes;

    return {
      personId: pid,
      nip: person.nip || '-',
      name: person.name,
      institutionName: person.institutionName || '-',
      departmentName: person.departmentName || '-',
      positionName: person.positionName || '-',
      countHariKerja: summary.countHariKerja,
      totalHariKerja: summary.countHariKerja,
      countHadir: summary.countHadir,
      countTerlambat: summary.countTerlambat,
      totalLateMinutes: lateMins,
      totalLateHours: Math.floor(lateMins / 60),
      totalLateRemainingMinutes: lateMins % 60,
      countPulangCepat: summary.countPulangCepat,
      totalEarlyLeaveMinutes: earlyMins,
      totalEarlyLeaveHours: Math.floor(earlyMins / 60),
      totalEarlyLeaveRemainingMinutes: earlyMins % 60,
      countIzin: summary.countIzin,
      countCuti: summary.countCuti,
      countSakit: summary.countSakit,
      countDinas: summary.countDinas,
      countMangkir: summary.countMangkir,
      countAlpha: summary.countAlpha,
      countLibur: summary.countLibur,
    };
  });

  // 7. Sort evaluated items
  const ALLOWED_SORT_COLUMNS = {
    nip: 'nip',
    name: 'name',
    institutionName: 'institutionName',
    departmentName: 'departmentName',
    positionName: 'positionName',
    countHariKerja: 'countHariKerja',
    totalHariKerja: 'countHariKerja',
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
  const stringSortKeys = ['nip', 'name', 'institutionName', 'departmentName', 'positionName'];

  evaluatedItems.sort((a, b) => {
    let valA = a[sortBy] ?? '';
    let valB = b[sortBy] ?? '';
    let cmp = 0;
    if (stringSortKeys.includes(sortBy)) {
      cmp = String(valA).localeCompare(String(valB), 'id', { sensitivity: 'base' });
    } else {
      cmp = Number(valA) - Number(valB);
    }
    return sortType === 'DESC' ? -cmp : cmp;
  });

  // 8. Total summary aggregation
  const totalSummary = evaluatedItems.reduce(
    (acc, item) => {
      acc.totalHariKerja += item.countHariKerja;
      acc.totalHadir += item.countHadir;
      acc.totalTerlambat += item.countTerlambat;
      acc.totalLateMinutes += item.totalLateMinutes;
      acc.totalPulangCepat += item.countPulangCepat;
      acc.totalEarlyLeaveMinutes += item.totalEarlyLeaveMinutes;
      acc.totalIzin += item.countIzin;
      acc.totalCuti += item.countCuti;
      acc.totalSakit += item.countSakit;
      acc.totalDinas += item.countDinas;
      acc.totalMangkir += item.countMangkir;
      acc.totalAlpha += item.countAlpha;
      acc.totalLibur += item.countLibur;
      return acc;
    },
    {
      totalEmployee: total,
      totalHariKerja: 0,
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
    }
  );

  totalSummary.totalLateHours = Math.floor(totalSummary.totalLateMinutes / 60);
  totalSummary.totalLateRemainingMinutes = totalSummary.totalLateMinutes % 60;
  totalSummary.totalEarlyLeaveHours = Math.floor(totalSummary.totalEarlyLeaveMinutes / 60);
  totalSummary.totalEarlyLeaveRemainingMinutes = totalSummary.totalEarlyLeaveMinutes % 60;

  // 9. Paginate slice
  const items = ignorePaging
    ? evaluatedItems
    : evaluatedItems.slice(skip, skip + pageSize);

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

