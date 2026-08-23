const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Location Service (m_location)
 * Master data lokasi presensi pegawai
 */

const SORT_MAP = {
  id: 'l.id',
  code: 'l.code',
  name: 'l.name',
  latitude: 'l.latitude',
  longitude: 'l.longitude',
  radiusMeter: 'l.radius_meter',
  radius_meter: 'l.radius_meter',
  isActive: 'l.is_active',
  is_active: 'l.is_active',
  createdAt: 'l.created_at',
  created_at: 'l.created_at',
  updatedAt: 'l.updated_at',
  updated_at: 'l.updated_at',
  institutionId: 'l.institution_id',
  institutionName: 'i.name',
};

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const selectLocationDTOQuery = `
  SELECT 
    l.id, l.code, l.name, l.latitude, l.longitude, l.radius_meter AS radiusMeter, 
    l.is_active AS isActive, l.created_by AS createdBy, l.created_at AS createdAt, 
    l.updated_by AS updatedBy, l.updated_at AS updatedAt, l.deleted_at AS deletedAt, 
    l.is_deleted AS isDeleted, l.institution_id AS institutionId,
    i.code AS institutionCode, i.name AS institutionName
  FROM m_location l
  LEFT JOIN m_institution i ON l.institution_id = i.id
`;

/**
 * Paginated list with filters
 */
const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const isActive = params.isActive ?? params.is_active ?? null;

  const sortBy = SORT_MAP[params.sortBy] ?? 'l.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['l.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('l.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (isActive !== null && isActive !== undefined) {
    conditions.push('l.is_active = ?');
    values.push(parseBoolean(isActive) ? 1 : 0);
  }

  if (keyword) {
    conditions.push('CONCAT(l.code, l.name, i.code, i.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectLocationDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectLocationDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);
  const formatted = (items || []).map((item) => ({
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    radiusMeter: Number(item.radiusMeter),
    isActive: parseBoolean(item.isActive),
  }));

  return paginate(formatted, total, pageNumber, pageSize);
};

/**
 * Full list (no pagination) — for dropdowns
 */
const getAll = async (params = {}) => {
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const conditions = ['l.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('l.institution_id = ?');
    values.push(Number(institutionId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectLocationDTOQuery}
    WHERE ${whereSql}
    ORDER BY l.name ASC
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values);
  return (items || []).map((item) => ({
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    radiusMeter: Number(item.radiusMeter),
    isActive: parseBoolean(item.isActive),
  }));
};

/**
 * Get single record with JOIN (for detail view)
 */
const resolveById = async (id) => {
  const dataSql = `${selectLocationDTOQuery} WHERE l.id = ? AND l.is_deleted = 0`;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Lokasi presensi tidak ditemukan' };
  const item = result[0];
  return {
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    radiusMeter: Number(item.radiusMeter),
    isActive: parseBoolean(item.isActive),
  };
};

/**
 * Simple Prisma findFirst (for internal use / before update/delete)
 */
const getById = async (id) => {
  const loc = await prisma.mLocation.findFirst({
    where: { id: Number(id), isDeleted: false },
  });
  if (!loc) throw { status: 404, message: 'Lokasi presensi tidak ditemukan' };
  return loc;
};

/**
 * Create new location
 */
const create = async (data, user = null) => {
  const now = new Date();
  await prisma.mLocation.create({
    data: {
      institutionId: Number(data.institutionId ?? data.institution_id),
      code: data.code,
      name: data.name,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      radiusMeter: Number(data.radiusMeter ?? data.radius_meter ?? 100),
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      createdAt: now,
      createdBy: user?.id ?? null,
    },
  });

  // Re-query to get JOIN data
  const created = await prisma.mLocation.findFirst({
    where: { code: data.code, isDeleted: false },
    orderBy: { id: 'desc' },
  });
  return resolveById(created.id);
};

/**
 * Update existing location
 */
const update = async (id, data, user = null) => {
  await getById(id);
  await prisma.mLocation.update({
    where: { id: Number(id) },
    data: {
      institutionId: Number(data.institutionId ?? data.institution_id),
      code: data.code,
      name: data.name,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      radiusMeter: Number(data.radiusMeter ?? data.radius_meter ?? 100),
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
  });
  return resolveById(id);
};

/**
 * Soft delete
 */
const remove = async (id) => {
  await getById(id);
  await prisma.mLocation.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
