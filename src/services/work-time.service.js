const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Master Work Time Service (m_work_time / Preset Jam Kerja)
 */

const RAW_SORT_MAP = {
  id: 'wt.id',
  code: 'wt.code',
  name: 'wt.name',
  createdAt: 'wt.created_at',
  created_at: 'wt.created_at',
  updatedAt: 'wt.updated_at',
  updated_at: 'wt.updated_at',
};

const selectWorkTimeDTOQuery = `
  SELECT 
    wt.id, wt.code, wt.name, 
    wt.work_start_time AS workStartTime, wt.work_end_time AS workEndTime,
    wt.checkin_start AS checkinStart, wt.checkin_end AS checkinEnd,
    wt.checkout_start AS checkoutStart, wt.checkout_end AS checkoutEnd,
    wt.late_tolerance AS lateTolerance, wt.early_leave_tolerance AS earlyLeaveTolerance,
    wt.is_active AS isActive,
    wt.created_by AS createdBy, wt.created_at AS createdAt, 
    wt.updated_by AS updatedBy, wt.updated_at AS updatedAt, wt.deleted_at AS deletedAt, 
    wt.is_deleted AS isDeleted
  FROM m_work_time wt
`;

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const isActive = params.isActive ?? params.is_active ?? null;

  const sortBy = RAW_SORT_MAP[params.sortBy] ?? 'wt.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['wt.is_deleted = 0'];
  const values = [];

  if (isActive !== null && isActive !== undefined) {
    conditions.push('wt.is_active = ?');
    values.push(parseBoolean(isActive) ? 1 : 0);
  }

  if (keyword) {
    conditions.push('CONCAT(wt.code, wt.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectWorkTimeDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectWorkTimeDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);
  const formattedItems = (items || []).map((item) => ({
    ...item,
    id: Number(item.id),
    isActive: parseBoolean(item.isActive),
  }));

  return paginate(formattedItems, total, pageNumber, pageSize);
};

const getAll = async () => {
  const dataSql = `
    ${selectWorkTimeDTOQuery}
    WHERE wt.is_deleted = 0 AND wt.is_active = 1
    ORDER BY wt.name ASC
  `;

  const items = await prisma.$queryRawUnsafe(dataSql);
  return (items || []).map((item) => ({
    ...item,
    id: Number(item.id),
    isActive: parseBoolean(item.isActive),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectWorkTimeDTOQuery}
    WHERE wt.id = ? AND wt.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) {
    throw { status: 404, message: 'Master Jam Kerja / Work Time tidak ditemukan' };
  }
  return {
    ...result[0],
    id: Number(result[0].id),
    isActive: parseBoolean(result[0].isActive),
  };
};

const getById = async (id) => {
  return resolveById(id);
};

const create = async (data, user = null) => {
  const now = new Date();
  const userId = user?.id ?? null;

  const created = await prisma.mWorkTime.create({
    data: {
      code: data.code,
      name: data.name,
      workStartTime: data.workStartTime ?? data.work_start_time,
      workEndTime: data.workEndTime ?? data.work_end_time,
      checkinStart: data.checkinStart ?? data.checkin_start,
      checkinEnd: data.checkinEnd ?? data.checkin_end,
      checkoutStart: data.checkoutStart ?? data.checkout_start ?? null,
      checkoutEnd: data.checkoutEnd ?? data.checkout_end ?? null,
      lateTolerance: Number(data.lateTolerance ?? data.late_tolerance ?? 0),
      earlyLeaveTolerance: Number(data.earlyLeaveTolerance ?? data.early_leave_tolerance ?? 0),
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      createdAt: now,
      createdBy: userId,
    },
  });

  return resolveById(created.id);
};

const update = async (id, data, user = null) => {
  await getById(id);
  const now = new Date();
  const userId = user?.id ?? null;

  await prisma.mWorkTime.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      name: data.name,
      workStartTime: data.workStartTime ?? data.work_start_time,
      workEndTime: data.workEndTime ?? data.work_end_time,
      checkinStart: data.checkinStart ?? data.checkin_start,
      checkinEnd: data.checkinEnd ?? data.checkin_end,
      checkoutStart: data.checkoutStart ?? data.checkout_start ?? null,
      checkoutEnd: data.checkoutEnd ?? data.checkout_end ?? null,
      lateTolerance: Number(data.lateTolerance ?? data.late_tolerance ?? 0),
      earlyLeaveTolerance: Number(data.earlyLeaveTolerance ?? data.early_leave_tolerance ?? 0),
      isActive: parseBoolean(data.isActive ?? data.is_active, true),
      updatedAt: now,
      updatedBy: userId,
    },
  });

  return resolveById(id);
};

const remove = async (id) => {
  await getById(id);
  await prisma.mWorkTime.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = {
  resolveAll,
  getAll,
  resolveById,
  getById,
  create,
  update,
  remove,
};
