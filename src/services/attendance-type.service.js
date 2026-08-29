const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Attendance Type Service (m_attendance_type)
 */

const SORT_MAP = {
  id: 'at.id',
  code: 'at.code',
  name: 'at.name',
  category: 'at.category',
  countsAsPresent: 'at.counts_as_present',
  counts_as_present: 'at.counts_as_present',
  requiresApproval: 'at.requires_approval',
  requires_approval: 'at.requires_approval',
  requiresAttendance: 'at.requires_attendance',
  requires_attendance: 'at.requires_attendance',
  colorLabel: 'at.color_label',
  color_label: 'at.color_label',
  isActive: 'at.is_active',
  is_active: 'at.is_active',
  createdAt: 'at.created_at',
  created_at: 'at.created_at',
  updatedAt: 'at.updated_at',
  updated_at: 'at.updated_at',
};

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const attendanceTypeSelect = {
  id: true,
  code: true,
  name: true,
  category: true,
  countsAsPresent: true,
  requiresApproval: true,
  requiresAttendance: true,
  colorLabel: true,
  isActive: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
};

const selectAttendanceTypeDTOQuery = `
  SELECT 
    at.id, at.code, at.name, at.category,
    at.counts_as_present AS countsAsPresent,
    at.requires_approval AS requiresApproval,
    at.requires_attendance AS requiresAttendance,
    at.color_label AS colorLabel,
    at.is_active AS isActive, at.created_by AS createdBy, at.created_at AS createdAt, 
    at.updated_by AS updatedBy, at.updated_at AS updatedAt, at.deleted_at AS deletedAt, 
    at.is_deleted AS isDeleted
  FROM m_attendance_type at
`;

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

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;
  const categories = parseCategoryParam(params.category);
  const isActive = params.isActive ?? undefined;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'at.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['at.is_deleted = 0'];
  const values = [];

  if (categories.length > 0) {
    const placeholders = categories.map(() => '?').join(', ');
    conditions.push(`at.category IN (${placeholders})`);
    values.push(...categories);
  }

  if (isActive !== undefined) {
    conditions.push('at.is_active = ?');
    values.push(parseBoolean(isActive) ? 1 : 0);
  }

  if (keyword) {
    conditions.push('CONCAT(at.code, at.name, at.category) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectAttendanceTypeDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectAttendanceTypeDTOQuery}
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
    countsAsPresent: parseBoolean(item.countsAsPresent, false),
    requiresApproval: parseBoolean(item.requiresApproval, false),
    requiresAttendance: parseBoolean(item.requiresAttendance, false),
    isActive: parseBoolean(item.isActive, true),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async (params = {}) => {
  const categories = parseCategoryParam(params.category);
  const conditions = ['at.is_deleted = 0 AND at.is_active = 1'];
  const values = [];

  if (categories.length > 0) {
    const placeholders = categories.map(() => '?').join(', ');
    conditions.push(`at.category IN (${placeholders})`);
    values.push(...categories);
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectAttendanceTypeDTOQuery}
    WHERE ${whereSql}
    ORDER BY at.name ASC
  `;
  const items = await prisma.$queryRawUnsafe(dataSql, ...values);
  return (items || []).map((item) => ({
    ...item,
    countsAsPresent: parseBoolean(item.countsAsPresent, false),
    requiresApproval: parseBoolean(item.requiresApproval, false),
    requiresAttendance: parseBoolean(item.requiresAttendance, false),
    isActive: parseBoolean(item.isActive, true),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectAttendanceTypeDTOQuery}
    WHERE at.id = ? AND at.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Jenis presensi tidak ditemukan' };
  const item = result[0];
  return {
    ...item,
    countsAsPresent: parseBoolean(item.countsAsPresent, false),
    requiresApproval: parseBoolean(item.requiresApproval, false),
    requiresAttendance: parseBoolean(item.requiresAttendance, false),
    isActive: parseBoolean(item.isActive, true),
  };
};

const getById = async (id) => {
  const attendanceType = await prisma.mAttendanceType.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: attendanceTypeSelect,
  });
  if (!attendanceType) throw { status: 404, message: 'Jenis presensi tidak ditemukan' };
  return attendanceType;
};

const create = async (data, user = null) => {
  return prisma.mAttendanceType.create({
    data: {
      code: data.code,
      name: data.name,
      category: data.category || 'attendance',
      countsAsPresent: parseBoolean(data.countsAsPresent ?? data.counts_as_present, false),
      requiresApproval: parseBoolean(data.requiresApproval ?? data.requires_approval, false),
      requiresAttendance: parseBoolean(data.requiresAttendance ?? data.requires_attendance, false),
      colorLabel: data.colorLabel ?? data.color_label ?? null,
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: attendanceTypeSelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  return prisma.mAttendanceType.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      name: data.name,
      category: data.category || 'attendance',
      countsAsPresent: parseBoolean(data.countsAsPresent ?? data.counts_as_present, false),
      requiresApproval: parseBoolean(data.requiresApproval ?? data.requires_approval, false),
      requiresAttendance: parseBoolean(data.requiresAttendance ?? data.requires_attendance, false),
      colorLabel: data.colorLabel ?? data.color_label ?? null,
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: attendanceTypeSelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mAttendanceType.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
