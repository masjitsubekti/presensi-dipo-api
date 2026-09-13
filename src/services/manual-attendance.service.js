const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');
const moment = require('moment-timezone');
const { APP_TIMEZONE, nowInTz } = require('../utils/timezone');
const storage = require('../storage/storage.service');

const SORT_MAP = {
  id: 'a.id',
  attendanceDate: 'a.attendance_date',
  attendance_date: 'a.attendance_date',
  date: 'a.attendance_date',
  personId: 'a.person_id',
  person_id: 'a.person_id',
  personName: 'p.name',
  person_name: 'p.name',
  personNip: 'p.nip',
  person_nip: 'p.nip',
  nip: 'p.nip',
  departmentId: 'p.department_id',
  department_id: 'p.department_id',
  departmentName: 'd.name',
  department_name: 'd.name',
  positionId: 'p.position_id',
  position_id: 'p.position_id',
  positionName: 'pos.name',
  position_name: 'pos.name',
  institutionId: 'a.institution_id',
  institution_id: 'a.institution_id',
  institutionName: 'inst.name',
  institution_name: 'inst.name',
  attendanceType: 'a.attendance_type',
  attendance_type: 'a.attendance_type',
  attendanceTypeId: 'a.attendance_type_id',
  attendance_type_id: 'a.attendance_type_id',
  attendanceTypeName: 'at.name',
  attendance_type_name: 'at.name',
  checkinTime: 'a.checkin_time',
  checkin_time: 'a.checkin_time',
  checkoutTime: 'a.checkout_time',
  checkout_time: 'a.checkout_time',
  status: 'a.status',
  mode: 'a.mode',
  note: 'a.note',
  createdAt: 'a.created_at',
  created_at: 'a.created_at',
  updatedAt: 'a.updated_at',
  updated_at: 'a.updated_at',
};

const selectManualAttendanceDTOQuery = `
  SELECT 
    a.id,
    a.institution_id AS institutionId,
    inst.name AS institutionName,
    a.person_id AS personId,
    p.name AS personName,
    p.nip AS personNip,
    d.id AS departmentId,
    d.name AS departmentName,
    pos.id AS positionId,
    pos.name AS positionName,
    a.attendance_type AS attendanceType,
    a.attendance_type_id AS attendanceTypeId,
    at.name AS attendanceTypeName,
    at.code AS attendanceTypeCode,
    at.color_label AS attendanceTypeColorLabel,
    at.category AS attendanceTypeCategory,
    a.attendance_date AS attendanceDate,
    a.checkin_time AS checkinTime,
    a.checkout_time AS checkoutTime,
    a.checkin_photo AS checkinPhoto,
    a.checkout_photo AS checkoutPhoto,
    a.status,
    a.teaching_status AS teachingStatus,
    a.mode,
    a.late_minutes AS lateMinutes,
    a.early_leave_minutes AS earlyLeaveMinutes,
    a.overtime_minutes AS overtimeMinutes,
    a.note,
    a.created_by AS createdBy,
    a.created_at AS createdAt,
    a.updated_by AS updatedBy,
    a.updated_at AS updatedAt,
    a.deleted_at AS deletedAt,
    a.is_deleted AS isDeleted
  FROM attendances a
  LEFT JOIN m_person p ON a.person_id = p.id
  LEFT JOIN m_department d ON p.department_id = d.id
  LEFT JOIN m_position pos ON p.position_id = pos.id
  LEFT JOIN m_institution inst ON a.institution_id = inst.id
  LEFT JOIN m_attendance_type at ON a.attendance_type_id = at.id
`;

/**
 * Format date & time input into a valid JS Date for MySQL timestamp
 */
const parseDateTime = (dateStr, timeStr) => {
  if (!timeStr) return null;
  if (timeStr instanceof Date) return timeStr;

  let cleanTime = null;

  if (typeof timeStr === 'string' && /^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr.trim())) {
    const parts = timeStr.trim().split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1].padStart(2, '0');
    const ss = (parts[2] || '00').padStart(2, '0');
    cleanTime = `${hh}:${mm}:${ss}`;
  } else if (typeof timeStr === 'string' && (timeStr.includes('T') || timeStr.includes(' '))) {
    const m = moment(timeStr).tz(APP_TIMEZONE);
    if (m.isValid()) cleanTime = m.format('HH:mm:ss');
  }

  if (!cleanTime) return null;

  const cleanDate = dateStr ? moment(dateStr).format('YYYY-MM-DD') : moment().tz(APP_TIMEZONE).format('YYYY-MM-DD');
  return new Date(`${cleanDate}T${cleanTime}.000Z`);
};

/**
 * Resolve paginated manual attendances list
 */
const resolveAll = async (params = {}, userId = null) => {
  let ctxInstitutionId = null;
  if (userId) {
    const user = await prisma.authUser.findFirst({
      where: { id: userId, isDeleted: false },
    });
    if (user && user.institutionId) {
      ctxInstitutionId = Number(user.institutionId);
    }
  }

  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const parseBoolean = (val, defaultVal = false) => {
    if (val === null || val === undefined) return defaultVal;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'number') return val === 1;
    if (typeof val === 'string') return val === 'true' || val === '1';
    return Boolean(val);
  };
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const keyword = params.q ?? null;
  const status = params.status ?? null;
  const mode = params.mode ?? null; // 'manual' | 'auto' | null (null shows manual by default or all if specified)
  const attendanceType = params.attendanceType ?? params.attendance_type ?? null;
  const attendanceTypeId = params.attendanceTypeId ?? params.attendance_type_id ?? null;
  const departmentId = params.departmentId ?? params.department_id ?? null;
  const positionId = params.positionId ?? params.position_id ?? null;
  const personId = params.personId ?? params.person_id ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const startDate = params.startDate ?? params.start_date ?? null;
  const endDate = params.endDate ?? params.end_date ?? null;

  const sortBy = SORT_MAP[params.sortBy] ?? 'a.attendance_date';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['a.is_deleted = 0'];
  const values = [];

  // Filter mode: default to 'manual' if not explicitly passed as 'all'
  if (mode && mode !== 'all') {
    conditions.push('a.mode = ?');
    values.push(mode);
  } else if (!mode) {
    // If no mode filter specified, show manual presensi records
    conditions.push('a.mode = ?');
    values.push('manual');
  }

  if (institutionId) {
    conditions.push('a.institution_id = ?');
    values.push(Number(institutionId));
  } else if (ctxInstitutionId) {
    conditions.push('a.institution_id = ?');
    values.push(ctxInstitutionId);
  }

  if (personId) {
    conditions.push('a.person_id = ?');
    values.push(Number(personId));
  }

  if (departmentId) {
    conditions.push('p.department_id = ?');
    values.push(Number(departmentId));
  }

  if (positionId) {
    conditions.push('p.position_id = ?');
    values.push(Number(positionId));
  }

  if (attendanceType) {
    conditions.push('a.attendance_type = ?');
    values.push(attendanceType);
  }

  if (attendanceTypeId) {
    conditions.push('a.attendance_type_id = ?');
    values.push(Number(attendanceTypeId));
  }

  if (status) {
    conditions.push('a.status = ?');
    values.push(status);
  }

  if (startDate) {
    conditions.push('a.attendance_date >= ?');
    values.push(`${startDate}`);
  }

  if (endDate) {
    conditions.push('a.attendance_date <= ?');
    values.push(`${endDate}`);
  }

  if (keyword) {
    conditions.push('CONCAT(IFNULL(p.name,""), IFNULL(p.nip,""), IFNULL(d.name,""), IFNULL(pos.name,""), IFNULL(a.note,""), IFNULL(at.name,""), IFNULL(a.status,"")) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectManualAttendanceDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectManualAttendanceDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
  `;

  let items;
  if (ignorePaging) {
    items = await prisma.$queryRawUnsafe(dataSql, ...values);
  } else {
    dataSql += ` LIMIT ? OFFSET ?`;
    items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);
  }

  const formattedItems = (items || []).map((item) => ({
    ...item,
    id: Number(item.id),
    personId: Number(item.personId),
    institutionId: Number(item.institutionId),
    attendanceTypeId: item.attendanceTypeId ? Number(item.attendanceTypeId) : null,
    departmentId: item.departmentId ? Number(item.departmentId) : null,
    positionId: item.positionId ? Number(item.positionId) : null,
    lateMinutes: item.lateMinutes ? Number(item.lateMinutes) : 0,
    earlyLeaveMinutes: item.earlyLeaveMinutes ? Number(item.earlyLeaveMinutes) : 0,
    overtimeMinutes: item.overtimeMinutes ? Number(item.overtimeMinutes) : 0,
    checkinPhoto: storage.getUrl(item.checkinPhoto),
    checkoutPhoto: storage.getUrl(item.checkoutPhoto),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

/**
 * Resolve single record by ID
 */
const resolveById = async (id) => {
  const dataSql = `
    ${selectManualAttendanceDTOQuery}
    WHERE a.id = ? AND a.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Data presensi manual tidak ditemukan' };
  
  const item = result[0];
  return {
    ...item,
    id: Number(item.id),
    personId: Number(item.personId),
    institutionId: Number(item.institutionId),
    attendanceTypeId: item.attendanceTypeId ? Number(item.attendanceTypeId) : null,
    departmentId: item.departmentId ? Number(item.departmentId) : null,
    positionId: item.positionId ? Number(item.positionId) : null,
    checkinPhoto: storage.getUrl(item.checkinPhoto),
    checkoutPhoto: storage.getUrl(item.checkoutPhoto),
  };
};

/**
 * Create manual attendance / dispensation for single or multiple employees
 */
const create = async (data, user = null) => {
  let personIds = [];
  if (Array.isArray(data.personIds)) {
    personIds = data.personIds.map(Number).filter(Boolean);
  } else if (Array.isArray(data.person_ids)) {
    personIds = data.person_ids.map(Number).filter(Boolean);
  } else if (data.personId || data.person_id) {
    personIds = [Number(data.personId || data.person_id)];
  }

  if (personIds.length === 0) {
    throw { status: 400, message: 'Minimal pilih 1 pegawai untuk presensi manual' };
  }

  const attendanceDateStr = data.attendanceDate || data.attendance_date || moment().tz(APP_TIMEZONE).format('YYYY-MM-DD');
  const attendanceDate = new Date(attendanceDateStr);

  const attendanceType = data.attendanceType || data.attendance_type || 'regular';
  const attendanceTypeId = (data.attendanceTypeId || data.attendance_type_id) ? Number(data.attendanceTypeId || data.attendance_type_id) : null;
  const status = data.status || 'present';
  const teachingStatus = data.teachingStatus || data.teaching_status || null;
  const mode = data.mode || 'manual';
  const note = data.note || null;
  const lateMinutes = data.lateMinutes !== undefined ? Number(data.lateMinutes) : (data.late_minutes !== undefined ? Number(data.late_minutes) : 0);
  const earlyLeaveMinutes = data.earlyLeaveMinutes !== undefined ? Number(data.earlyLeaveMinutes) : (data.early_leave_minutes !== undefined ? Number(data.early_leave_minutes) : 0);
  const overtimeMinutes = data.overtimeMinutes !== undefined ? Number(data.overtimeMinutes) : (data.overtime_minutes !== undefined ? Number(data.overtime_minutes) : 0);

  const checkinTime = parseDateTime(attendanceDateStr, data.checkinTime ?? data.checkin_time);
  const checkoutTime = parseDateTime(attendanceDateStr, data.checkoutTime ?? data.checkout_time);

  const now = nowInTz();

  // Retrieve persons info to ensure institutionId is correct
  const persons = await prisma.mPerson.findMany({
    where: {
      id: { in: personIds },
      isDeleted: false,
    },
    select: { id: true, institutionId: true, name: true },
  });

  const personMap = new Map(persons.map((p) => [p.id, p]));

  const createdResults = [];

  for (const pid of personIds) {
    const personInfo = personMap.get(pid);
    const institutionId = Number(data.institutionId || data.institution_id || personInfo?.institutionId || user?.institutionId || 1);

    // Check if an attendance record already exists for this person on this date & attendanceType
    const existing = await prisma.attendance.findFirst({
      where: {
        personId: pid,
        institutionId,
        attendanceDate,
        attendanceType,
        isDeleted: false,
      },
    });

    if (existing) {
      // Update existing record with manual data
      const updated = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          attendanceTypeId,
          checkinTime: checkinTime !== null ? checkinTime : existing.checkinTime,
          checkoutTime: checkoutTime !== null ? checkoutTime : existing.checkoutTime,
          status,
          teachingStatus,
          mode,
          lateMinutes,
          earlyLeaveMinutes,
          overtimeMinutes,
          note,
          updatedAt: now,
          updatedBy: user?.id ?? null,
        },
      });
      createdResults.push(Number(updated.id));
    } else {
      // Create new attendance record
      const created = await prisma.attendance.create({
        data: {
          institutionId,
          personId: pid,
          attendanceType,
          attendanceTypeId,
          attendanceDate,
          checkinTime,
          checkoutTime,
          status,
          teachingStatus,
          mode,
          lateMinutes,
          earlyLeaveMinutes,
          overtimeMinutes,
          note,
          createdAt: now,
          createdBy: user?.id ?? null,
        },
      });
      createdResults.push(Number(created.id));
    }
  }

  return {
    success: true,
    totalCreated: createdResults.length,
    ids: createdResults,
  };
};

/**
 * Update single manual attendance record
 */
const update = async (id, data, user = null) => {
  const existing = await prisma.attendance.findFirst({
    where: { id: BigInt(id), isDeleted: false },
  });

  if (!existing) throw { status: 404, message: 'Data presensi tidak ditemukan' };

  const attendanceDateStr = data.attendanceDate || data.attendance_date || moment(existing.attendanceDate).format('YYYY-MM-DD');
  const attendanceDate = new Date(attendanceDateStr);

  const checkinTime = (data.checkinTime !== undefined || data.checkin_time !== undefined)
    ? parseDateTime(attendanceDateStr, data.checkinTime ?? data.checkin_time)
    : existing.checkinTime;

  const checkoutTime = (data.checkoutTime !== undefined || data.checkout_time !== undefined)
    ? parseDateTime(attendanceDateStr, data.checkoutTime ?? data.checkout_time)
    : existing.checkoutTime;

  const attendanceTypeId = (data.attendanceTypeId !== undefined || data.attendance_type_id !== undefined)
    ? (data.attendanceTypeId || data.attendance_type_id ? Number(data.attendanceTypeId || data.attendance_type_id) : null)
    : existing.attendanceTypeId;

  const personId = (data.personId || data.person_id) ? Number(data.personId || data.person_id) : existing.personId;

  await prisma.attendance.update({
    where: { id: BigInt(id) },
    data: {
      personId,
      attendanceDate,
      attendanceType: data.attendanceType ?? data.attendance_type ?? existing.attendanceType,
      attendanceTypeId,
      checkinTime,
      checkoutTime,
      status: data.status ?? existing.status,
      teachingStatus: data.teachingStatus ?? data.teaching_status ?? existing.teachingStatus,
      mode: data.mode ?? 'manual',
      lateMinutes: data.lateMinutes !== undefined ? Number(data.lateMinutes) : (data.late_minutes !== undefined ? Number(data.late_minutes) : existing.lateMinutes),
      earlyLeaveMinutes: data.earlyLeaveMinutes !== undefined ? Number(data.earlyLeaveMinutes) : (data.early_leave_minutes !== undefined ? Number(data.early_leave_minutes) : existing.earlyLeaveMinutes),
      overtimeMinutes: data.overtimeMinutes !== undefined ? Number(data.overtimeMinutes) : (data.overtime_minutes !== undefined ? Number(data.overtime_minutes) : existing.overtimeMinutes),
      note: data.note !== undefined ? data.note : existing.note,
      updatedAt: nowInTz(),
      updatedBy: user?.id ?? null,
    },
  });

  return resolveById(id);
};

/**
 * Soft delete attendance record
 */
const remove = async (id, user = null) => {
  const existing = await prisma.attendance.findFirst({
    where: { id: BigInt(id), isDeleted: false },
  });
  if (!existing) throw { status: 404, message: 'Data presensi tidak ditemukan' };

  await prisma.attendance.update({
    where: { id: BigInt(id) },
    data: {
      isDeleted: true,
      deletedAt: nowInTz(),
      updatedBy: user?.id ?? null,
    },
  });
};

/**
 * Bulk soft delete
 */
const bulkRemove = async (ids = [], user = null) => {
  if (!Array.isArray(ids) || ids.length === 0) return { count: 0 };
  const bigIntIds = ids.map(BigInt);

  const result = await prisma.attendance.updateMany({
    where: { id: { in: bigIntIds } },
    data: {
      isDeleted: true,
      deletedAt: nowInTz(),
      updatedBy: user?.id ?? null,
    },
  });

  return result;
};

module.exports = {
  resolveAll,
  resolveById,
  create,
  update,
  remove,
  bulkRemove,
};
