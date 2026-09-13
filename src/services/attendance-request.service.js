const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');
const storage = require('../storage/storage.service');

/**
 * Attendance Request Service (attendance_requests)
 */

const SORT_MAP = {
  id: 'ar.id',
  startDate: 'ar.start_date',
  start_date: 'ar.start_date',
  endDate: 'ar.end_date',
  end_date: 'ar.end_date',
  startTime: 'ar.start_time',
  start_time: 'ar.start_time',
  endTime: 'ar.end_time',
  end_time: 'ar.end_time',
  durationType: 'ar.duration_type',
  duration_type: 'ar.duration_type',
  reason: 'ar.reason',
  status: 'ar.status',
  approvedAt: 'ar.approved_at',
  approved_at: 'ar.approved_at',
  createdAt: 'ar.created_at',
  created_at: 'ar.created_at',
  updatedAt: 'ar.updated_at',
  updated_at: 'ar.updated_at',
  personId: 'ar.person_id',
  person_id: 'ar.person_id',
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
  attendanceTypeId: 'ar.attendance_type_id',
  attendance_type_id: 'ar.attendance_type_id',
  attendanceTypeName: 'at.name',
  attendance_type_name: 'at.name',
  attendanceTypeCode: 'at.code',
  attendance_type_code: 'at.code',
  attendanceTypeCategory: 'at.category',
  attendance_type_category: 'at.category',
};

const selectAttendanceRequestDTOQuery = `
  SELECT 
    ar.id, ar.institution_id AS institutionId, ar.person_id AS personId,
    ar.attendance_type_id AS attendanceTypeId,
    ar.start_date AS startDate, ar.end_date AS endDate,
    ar.start_time AS startTime, ar.end_time AS endTime, ar.duration_type AS durationType,
    ar.reason, ar.file_path AS filePath, ar.status,
    ar.approved_by AS approvedBy, ar.approved_at AS approvedAt, ar.approval_note AS approvalNote,
    au.name AS approverName,
    ar.created_by AS createdBy, ar.created_at AS createdAt,
    ar.updated_by AS updatedBy, ar.updated_at AS updatedAt,
    ar.deleted_at AS deletedAt, ar.is_deleted AS isDeleted,
    at.code AS attendanceTypeCode, at.name AS attendanceTypeName, at.category AS attendanceTypeCategory, at.color_label AS attendanceTypeColorLabel,
    p.name AS personName, p.nip AS personNip,
    p.department_id AS departmentId, d.name AS departmentName,
    p.position_id AS positionId, pos.name AS positionName
  FROM attendance_requests ar
  LEFT JOIN m_attendance_type at ON ar.attendance_type_id = at.id
  LEFT JOIN m_person p ON ar.person_id = p.id
  LEFT JOIN m_department d ON p.department_id = d.id
  LEFT JOIN m_position pos ON p.position_id = pos.id
  LEFT JOIN auth_user au ON ar.approved_by = au.id
`;

const attendanceRequestSelect = {
  id: true,
  institutionId: true,
  personId: true,
  attendanceTypeId: true,
  startDate: true,
  endDate: true,
  startTime: true,
  endTime: true,
  durationType: true,
  reason: true,
  filePath: true,
  status: true,
  approvedBy: true,
  approvedAt: true,
  approvalNote: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
  attendanceType: {
    select: {
      id: true,
      code: true,
      name: true,
      category: true,
      colorLabel: true,
    },
  },
};

const parseCategoryParam = (categoryParam) => {
  if (!categoryParam) return [];
  if (Array.isArray(categoryParam)) {
    return categoryParam.flatMap((item) => String(item).split(',')).map((c) => c.trim()).filter(Boolean);
  }
  if (typeof categoryParam === 'string') {
    return categoryParam.split(',').map((c) => c.trim()).filter(Boolean);
  }
  return [];
};

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
  const personId = params.personId ?? params.person_id ?? null;
  const attendanceTypeId = params.attendanceTypeId ?? params.attendance_type_id ?? null;
  const departmentId = params.departmentId ?? params.department_id ?? null;
  const positionId = params.positionId ?? params.position_id ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const startDate = params.startDate ?? params.start_date ?? null;
  const endDate = params.endDate ?? params.end_date ?? null;
  const categories = parseCategoryParam(params.category ?? params.attendanceTypeCategory ?? params.attendance_type_category);

  const sortBy = SORT_MAP[params.sortBy] ?? 'ar.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['ar.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('ar.institution_id = ?');
    values.push(Number(institutionId));
  } else if (ctxInstitutionId) {
    conditions.push('ar.institution_id = ?');
    values.push(ctxInstitutionId);
  }

  if (personId) {
    conditions.push('ar.person_id = ?');
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

  if (attendanceTypeId) {
    conditions.push('ar.attendance_type_id = ?');
    values.push(Number(attendanceTypeId));
  }

  if (categories.length > 0) {
    const placeholders = categories.map(() => '?').join(', ');
    conditions.push(`at.category IN (${placeholders})`);
    values.push(...categories);
  }

  if (status) {
    conditions.push('ar.status = ?');
    values.push(status);
  }

  if (startDate) {
    conditions.push('ar.start_date >= ?');
    values.push(`${startDate}`);
  }

  if (endDate) {
    conditions.push('ar.end_date <= ?');
    values.push(`${endDate}`);
  }

  if (keyword) {
    conditions.push("CONCAT(IFNULL(p.name,''), IFNULL(p.nip,''), IFNULL(d.name,''), IFNULL(pos.name,''), IFNULL(ar.reason,''), IFNULL(at.name,''), IFNULL(at.code,'')) LIKE ?");
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectAttendanceRequestDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectAttendanceRequestDTOQuery}
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
    attendanceTypeId: Number(item.attendanceTypeId),
    departmentId: item.departmentId ? Number(item.departmentId) : null,
    positionId: item.positionId ? Number(item.positionId) : null,
    filePathUrl: storage.getUrl(item.filePath),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectAttendanceRequestDTOQuery}
    WHERE ar.id = ? AND ar.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Data pengajuan izin tidak ditemukan' };
  return result[0];
};

const getById = async (id) => {
  const request = await prisma.attendanceRequest.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: attendanceRequestSelect,
  });
  if (!request) throw { status: 404, message: 'Data pengajuan izin tidak ditemukan' };
  return request;
};

const create = async (data, user = null) => {
  const institutionId = Number(data.institutionId ?? data.institution_id ?? user?.institutionId ?? 1);
  const personId = Number(data.personId ?? data.person_id ?? user?.personId);

  if (!personId) throw { status: 400, message: 'Person ID wajib diisi' };

  const attendanceTypeId = Number(data.attendanceTypeId ?? data.attendance_type_id ?? data.leaveTypeId ?? data.leave_type_id);

  return prisma.attendanceRequest.create({
    data: {
      institutionId,
      personId,
      attendanceTypeId,
      startDate: new Date(data.startDate ?? data.start_date),
      endDate: new Date(data.endDate ?? data.end_date),
      startTime: data.startTime ?? data.start_time ?? null,
      endTime: data.endTime ?? data.end_time ?? null,
      durationType: data.durationType ?? data.duration_type ?? 'full_day',
      reason: data.reason ?? null,
      filePath: data.filePath ?? data.file_path ?? null,
      status: data.status ?? 'pending',
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: attendanceRequestSelect,
  });
};

const update = async (id, data, user = null) => {
  const existing = await getById(id);

  // If a new file was uploaded, delete the old file from storage (Local / Supabase)
  const newFilePath = data.filePath ?? data.file_path;
  if (newFilePath && existing.filePath && existing.filePath !== newFilePath) {
    try {
      await storage.deleteFile(existing.filePath);
    } catch (err) {
      console.error('[AttendanceRequestService] Failed to delete old file on update:', err.message || err);
    }
  }

  const attendanceTypeId = (data.attendanceTypeId || data.attendance_type_id || data.leaveTypeId || data.leave_type_id)
    ? Number(data.attendanceTypeId ?? data.attendance_type_id ?? data.leaveTypeId ?? data.leave_type_id)
    : undefined;

  const personId = (data.personId || data.person_id || user?.personId)
    ? Number(data.personId ?? data.person_id ?? user?.personId)
    : existing.personId;

  await prisma.attendanceRequest.update({
    where: { id: Number(id) },
    data: {
      personId,
      attendanceTypeId,
      startDate: (data.startDate || data.start_date) ? new Date(data.startDate ?? data.start_date) : undefined,
      endDate: (data.endDate || data.end_date) ? new Date(data.endDate ?? data.end_date) : undefined,
      startTime: data.startTime ?? data.start_time ?? undefined,
      endTime: data.endTime ?? data.end_time ?? undefined,
      durationType: data.durationType ?? data.duration_type ?? undefined,
      reason: data.reason ?? undefined,
      filePath: newFilePath ?? undefined,
      status: data.status ?? undefined,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
  });

  return resolveById(id);
};

const updateStatus = async (id, status, user = null, approvalNote = undefined) => {
  await getById(id);
  return prisma.attendanceRequest.update({
    where: { id: Number(id) },
    data: {
      status,
      approvalNote: approvalNote !== undefined ? approvalNote : undefined,
      approvedBy: status === 'approved' ? (user?.id ?? null) : undefined,
      approvedAt: status === 'approved' ? new Date() : undefined,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: attendanceRequestSelect,
  });
};

const remove = async (id) => {
  const existing = await getById(id);

  // Remove file from storage if present
  if (existing.filePath) {
    try {
      await storage.deleteFile(existing.filePath);
    } catch (err) {
      console.error('[AttendanceRequestService] Failed to delete file on remove:', err.message || err);
    }
  }

  await prisma.attendanceRequest.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date(), filePath: null },
  });
};

module.exports = { resolveAll, getById, resolveById, create, update, updateStatus, remove };
