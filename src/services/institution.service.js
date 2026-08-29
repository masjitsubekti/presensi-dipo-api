const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Institution Service (m_institution)
 */

const SORT_MAP = {
  id: 'i.id',
  code: 'i.code',
  name: 'i.name',
  npsn: 'i.npsn',
  address: 'i.address',
  phone: 'i.phone',
  email: 'i.email',
  isActive: 'i.is_active',
  is_active: 'i.is_active',
  createdAt: 'i.created_at',
  created_at: 'i.created_at',
  updatedAt: 'i.updated_at',
  updated_at: 'i.updated_at',
  levelId: 'i.level_id',
  level_id: 'i.level_id',
  levelCode: 'l.code',
  levelName: 'l.name',
};

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const institutionSelect = {
  id: true,
  code: true,
  name: true,
  levelId: true,
  npsn: true,
  address: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
};

const selectInstitutionDTOQuery = `
  SELECT 
    i.id, i.code, i.name, i.npsn, i.address, i.phone, i.email, 
    i.is_active AS isActive, i.created_by AS createdBy, i.created_at AS createdAt, 
    i.updated_by AS updatedBy, i.updated_at AS updatedAt, i.deleted_at AS deletedAt, 
    i.is_deleted AS isDeleted, i.level_id AS levelId,
    l.code AS levelCode, l.name AS levelName
  FROM m_institution i
  LEFT JOIN m_level l ON i.level_id = l.id
`;

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;
  const levelId = params.levelId ?? null;
  const isActive = params.isActive ?? undefined;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'i.created_at';
  const sortType = params.sortType ?? 'DESC';

  // WHERE clause & bindings
  const conditions = ['i.is_deleted = 0'];
  const values = [];

  if (levelId) {
    conditions.push('i.level_id = ?');
    values.push(Number(levelId));
  }

  if (isActive !== undefined) {
    conditions.push('i.is_active = ?');
    values.push(parseBoolean(isActive) ? 1 : 0);
  }

  if (keyword) {
    conditions.push('CONCAT(i.code, i.name, i.npsn, i.address, i.phone, i.email, l.code, l.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  // Exec Count Subquery
  const countSql = `SELECT COUNT(*) AS total FROM (${selectInstitutionDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  // Exec Data Query 
  let dataSql = `
    ${selectInstitutionDTOQuery}
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
    isActive: parseBoolean(item.isActive),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async () => {
  const dataSql = `
    ${selectInstitutionDTOQuery}
    WHERE i.is_deleted = 0
    ORDER BY i.name ASC
  `;
  const items = await prisma.$queryRawUnsafe(dataSql);
  return (items || []).map((item) => ({
    ...item,
    isActive: parseBoolean(item.isActive),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectInstitutionDTOQuery}
    WHERE i.id = ? AND i.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Institusi tidak ditemukan' };
  return {
    ...result[0],
    isActive: parseBoolean(result[0].isActive),
  };
};

const getById = async (id) => {
  const institution = await prisma.mInstitution.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: institutionSelect,
  });
  if (!institution) throw { status: 404, message: 'Institusi tidak ditemukan' };
  return institution;
};

const create = async (data, user = null) => {
  return prisma.mInstitution.create({
    data: {
      code: data.code,
      name: data.name,
      levelId: data.levelId ? Number(data.levelId) : null,
      npsn: data.npsn ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: institutionSelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  return prisma.mInstitution.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      name: data.name,
      levelId: data.levelId ? Number(data.levelId) : null,
      npsn: data.npsn ?? null,
      address: data.address ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: institutionSelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mInstitution.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
