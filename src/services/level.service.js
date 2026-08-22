const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Level Service (m_level / Jenjang Pendidikan)
 */

const SORT_MAP = {
  id: 'l.id',
  code: 'l.code',
  name: 'l.name',
  seq: 'l.seq',
  createdAt: 'l.created_at',
  created_at: 'l.created_at',
  updatedAt: 'l.updated_at',
  updated_at: 'l.updated_at',
};

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const selectLevelDTOQuery = `
  SELECT 
    l.id, l.code, l.name, l.seq, l.is_active AS isActive,
    l.created_at AS createdAt, l.updated_at AS updatedAt
  FROM m_level l
`;

const levelSelect = {
  id: true,
  code: true,
  name: true,
  seq: true,
  is_active: true,
  createdAt: true,
  updatedAt: true,
};

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;

  const sortBy = SORT_MAP[params.sortBy] ?? 'l.seq';
  const sortType = params.sortType ?? 'ASC';

  const conditions = ['1=1'];
  const values = [];

  if (keyword) {
    conditions.push('CONCAT(l.code, l.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectLevelDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectLevelDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);
  const formattedItems = (items || []).map((item) => ({
    ...item,
    isActive: parseBoolean(item.isActive),
  }));

  return paginate(formattedItems, total, pageNumber, pageSize);
};

const getAll = async () => {
  const dataSql = `
    ${selectLevelDTOQuery}
    ORDER BY l.seq ASC
  `;
  const items = await prisma.$queryRawUnsafe(dataSql);
  return (items || []).map((item) => ({
    ...item,
    isActive: parseBoolean(item.isActive),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectLevelDTOQuery}
    WHERE l.id = ?
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Jenjang pendidikan tidak ditemukan' };
  return {
    ...result[0],
    isActive: parseBoolean(result[0].isActive),
  };
};

const getById = async (id) => {
  const level = await prisma.mLevel.findFirst({
    where: { id: Number(id) },
    select: levelSelect,
  });
  if (!level) throw { status: 404, message: 'Jenjang pendidikan tidak ditemukan' };
  return {
    ...level,
    isActive: parseBoolean(level.is_active),
  };
};

module.exports = { resolveAll, getAll, getById, resolveById };
