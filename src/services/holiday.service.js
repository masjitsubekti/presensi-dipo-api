const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Holiday Service (m_holiday / Hari Libur)
 */

const SORT_MAP = {
  id: 'h.id',
  date: 'h.date',
  title: 'h.title',
  type: 'h.type',
  isNational: 'h.is_national',
  is_national: 'h.is_national',
  institutionId: 'h.institution_id',
  institution_id: 'h.institution_id',
  institutionCode: 'i.code',
  institutionName: 'i.name',
  createdAt: 'h.created_at',
  created_at: 'h.created_at',
  updatedAt: 'h.updated_at',
  updated_at: 'h.updated_at',
};

const parseBoolean = (val, defaultVal = false) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const holidaySelect = {
  id: true,
  institutionId: true,
  date: true,
  title: true,
  type: true,
  isNational: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
  institution: { select: { id: true, code: true, name: true } },
};

const selectHolidayDTOQuery = `
  SELECT 
    h.id, h.date, h.title, h.type,
    h.is_national AS isNational, h.created_by AS createdBy, h.created_at AS createdAt, 
    h.updated_by AS updatedBy, h.updated_at AS updatedAt, h.deleted_at AS deletedAt, 
    h.is_deleted AS isDeleted, h.institution_id AS institutionId,
    i.code AS institutionCode, i.name AS institutionName
  FROM m_holiday h
  LEFT JOIN m_institution i ON h.institution_id = i.id
`;

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const isNational = params.isNational ?? params.is_national ?? undefined;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const year = params.year ?? null;
  const month = params.month ?? null;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'h.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['h.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('h.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (isNational !== undefined) {
    conditions.push('h.is_national = ?');
    values.push(parseBoolean(isNational) ? 1 : 0);
  }

  if (year) {
    conditions.push('YEAR(h.date) = ?');
    values.push(Number(year));
  }

  if (month) {
    conditions.push('MONTH(h.date) = ?');
    values.push(Number(month));
  }

  if (keyword) {
    conditions.push('(h.title LIKE ? OR h.type LIKE ? OR i.code LIKE ? OR i.name LIKE ?)');
    values.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectHolidayDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectHolidayDTOQuery}
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
    institutionId: item.institutionId ? Number(item.institutionId) : null,
    isNational: parseBoolean(item.isNational),
    isDeleted: parseBoolean(item.isDeleted),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async (params = {}) => {
  const year = params.year ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const conditions = ['h.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('h.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (year) {
    conditions.push('YEAR(h.date) = ?');
    values.push(Number(year));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectHolidayDTOQuery}
    WHERE ${whereSql}
    ORDER BY h.date ASC
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values);
  return (items || []).map((item) => ({
    ...item,
    id: Number(item.id),
    institutionId: item.institutionId ? Number(item.institutionId) : null,
    isNational: parseBoolean(item.isNational),
    isDeleted: parseBoolean(item.isDeleted),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectHolidayDTOQuery}
    WHERE h.id = ? AND h.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Hari libur tidak ditemukan' };
  return {
    ...result[0],
    id: Number(result[0].id),
    institutionId: result[0].institutionId ? Number(result[0].institutionId) : null,
    isNational: parseBoolean(result[0].isNational),
    isDeleted: parseBoolean(result[0].isDeleted),
  };
};

const getById = async (id) => {
  const holiday = await prisma.mHoliday.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: holidaySelect,
  });
  if (!holiday) throw { status: 404, message: 'Hari libur tidak ditemukan' };
  return holiday;
};

const create = async (data, user = null) => {
  const instId = data.institutionId ?? data.institution_id ?? null;
  return prisma.mHoliday.create({
    data: {
      institutionId: instId ? Number(instId) : null,
      date: new Date(data.date),
      title: data.title,
      type: data.type ?? null,
      isNational: parseBoolean(data.isNational ?? data.is_national, false),
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: holidaySelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  const instId = data.institutionId ?? data.institution_id ?? null;
  return prisma.mHoliday.update({
    where: { id: Number(id) },
    data: {
      institutionId: instId ? Number(instId) : null,
      date: data.date ? new Date(data.date) : undefined,
      title: data.title,
      type: data.type ?? null,
      isNational: parseBoolean(data.isNational ?? data.is_national, false),
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: holidaySelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mHoliday.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
