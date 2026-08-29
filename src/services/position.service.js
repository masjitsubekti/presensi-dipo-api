const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Position Service (m_position / Jabatan)
 */

const SORT_MAP = {
  id: 'p.id',
  code: 'p.code',
  name: 'p.name',
  createdAt: 'p.created_at',
  created_at: 'p.created_at',
  updatedAt: 'p.updated_at',
  updated_at: 'p.updated_at',
  institutionId: 'p.institution_id',
  institution_id: 'p.institution_id',
  institutionCode: 'i.code',
  institutionName: 'i.name',
};

const selectPositionDTOQuery = `
  SELECT 
    p.id, p.code, p.name, p.created_by AS createdBy, p.created_at AS createdAt, 
    p.updated_by AS updatedBy, p.updated_at AS updatedAt, p.deleted_at AS deletedAt, 
    p.is_deleted AS isDeleted, p.institution_id AS institutionId,
    i.code AS institutionCode, i.name AS institutionName
  FROM m_position p
  LEFT JOIN m_institution i ON p.institution_id = i.id
`;

const positionSelect = {
  id: true,
  code: true,
  name: true,
  institutionId: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
};

const parseBoolean = (val, defaultVal = false) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'p.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['p.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('p.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (keyword) {
    conditions.push('CONCAT(p.code, p.name, i.code, i.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectPositionDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectPositionDTOQuery}
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

  return paginate(items, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async (params = {}) => {
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const conditions = ['p.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('p.institution_id = ?');
    values.push(Number(institutionId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectPositionDTOQuery}
    WHERE ${whereSql}
    ORDER BY p.name ASC
  `;

  return prisma.$queryRawUnsafe(dataSql, ...values);
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectPositionDTOQuery}
    WHERE p.id = ? AND p.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Posisi/Jabatan tidak ditemukan' };
  return result[0];
};

const getById = async (id) => {
  const position = await prisma.mPosition.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: positionSelect,
  });
  if (!position) throw { status: 404, message: 'Posisi/Jabatan tidak ditemukan' };
  return position;
};

const create = async (data, user = null) => {
  return prisma.mPosition.create({
    data: {
      code: data.code,
      name: data.name,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: positionSelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  return prisma.mPosition.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      name: data.name,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: positionSelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mPosition.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
