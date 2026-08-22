const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Work Shift Service (work_shift & work_shift_detail / Master Shift)
 */

const RAW_SORT_MAP = {
  id: 's.id',
  code: 's.code',
  name: 's.name',
  createdAt: 's.created_at',
  created_at: 's.created_at',
  updatedAt: 's.updated_at',
  updated_at: 's.updated_at',
  institutionId: 's.institution_id',
  institution_id: 's.institution_id',
  institutionName: 'i.name',
};

const selectWorkShiftDTOQuery = `
  SELECT 
    s.id, s.code, s.name, s.is_active AS isActive,
    s.created_by AS createdBy, s.created_at AS createdAt, 
    s.updated_by AS updatedBy, s.updated_at AS updatedAt, s.deleted_at AS deletedAt, 
    s.is_deleted AS isDeleted, s.institution_id AS institutionId,
    i.code AS institutionCode, i.name AS institutionName
  FROM work_shift s
  LEFT JOIN m_institution i ON s.institution_id = i.id
`;

const selectWorkShiftDetailDTOQuery = `
  SELECT 
    d.id, d.shift_id AS shiftId, d.day_of_week AS dayOfWeek,
    d.work_time_id AS workTimeId, d.is_working_day AS isWorkingDay,
    d.created_by AS createdBy, d.created_at AS createdAt,
    d.updated_by AS updatedBy, d.updated_at AS updatedAt,
    d.deleted_at AS deletedAt, d.is_deleted AS isDeleted,
    wt.code AS workTimeCode, wt.name AS workTimeName,
    wt.work_start_time AS workStartTime, wt.work_end_time AS workEndTime,
    wt.checkin_start AS checkinStart, wt.checkin_end AS checkinEnd,
    wt.checkout_start AS checkoutStart, wt.checkout_end AS checkoutEnd,
    wt.late_tolerance AS lateTolerance, wt.early_leave_tolerance AS earlyLeaveTolerance
  FROM work_shift_detail d
  LEFT JOIN m_work_time wt ON d.work_time_id = wt.id
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
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const isActive = params.isActive ?? params.is_active ?? null;

  const sortBy = RAW_SORT_MAP[params.sortBy] ?? 's.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['s.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('s.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (isActive !== null && isActive !== undefined) {
    conditions.push('s.is_active = ?');
    values.push(parseBoolean(isActive) ? 1 : 0);
  }

  if (keyword) {
    conditions.push('CONCAT(s.code, s.name, i.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectWorkShiftDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectWorkShiftDTOQuery}
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

const getAll = async (params = {}) => {
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const conditions = ['s.is_deleted = 0', 's.is_active = 1'];
  const values = [];

  if (institutionId) {
    conditions.push('s.institution_id = ?');
    values.push(Number(institutionId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectWorkShiftDTOQuery}
    WHERE ${whereSql}
    ORDER BY s.name ASC
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values);
  return (items || []).map((item) => ({
    ...item,
    isActive: parseBoolean(item.isActive),
  }));
};

const resolveById = async (id) => {
  const headerSql = `
    ${selectWorkShiftDTOQuery}
    WHERE s.id = ? AND s.is_deleted = 0
  `;
  const headers = await prisma.$queryRawUnsafe(headerSql, String(id));
  if (!headers || !headers.length) {
    throw { status: 404, message: 'Master Jam Kerja tidak ditemukan' };
  }

  const header = headers[0];

  const detailSql = `
    ${selectWorkShiftDetailDTOQuery}
    WHERE d.shift_id = ? AND d.is_deleted = 0
    ORDER BY d.day_of_week ASC
  `;
  const details = await prisma.$queryRawUnsafe(detailSql, String(id));

  return {
    ...header,
    isActive: parseBoolean(header.isActive),
    details: (details || []).map((d) => ({
      ...d,
      workTimeId: d.workTimeId ? Number(d.workTimeId) : null,
      isWorkingDay: parseBoolean(d.isWorkingDay),
    })),
  };
};

const create = async (data, user = null) => {
  const shiftId = uuidv4();
  const now = new Date();
  const userId = user?.id ?? null;

  await prisma.$transaction(async (tx) => {
    // Insert Header
    await tx.workShift.create({
      data: {
        id: shiftId,
        code: data.code,
        name: data.name,
        institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
        isActive: parseBoolean(data.isActive ?? data.is_active, true),
        createdAt: now,
        createdBy: userId,
      },
    });

    // Insert Details if provided
    if (Array.isArray(data.details) && data.details.length > 0) {
      const detailsData = data.details.map((d) => ({
        id: uuidv4(),
        shiftId: shiftId,
        dayOfWeek: Number(d.dayOfWeek ?? d.day_of_week),
        workTimeId: d.workTimeId ?? d.work_time_id ? Number(d.workTimeId ?? d.work_time_id) : null,
        isWorkingDay: parseBoolean(d.isWorkingDay ?? d.is_working_day, true),
        createdAt: now,
        createdBy: userId,
      }));

      await tx.workShiftDetail.createMany({
        data: detailsData,
      });
    }
  });

  return resolveById(shiftId);
};

const update = async (id, data, user = null) => {
  await resolveById(id);
  const now = new Date();
  const userId = user?.id ?? null;

  await prisma.$transaction(async (tx) => {
    // Update Header
    await tx.workShift.update({
      where: { id: String(id) },
      data: {
        code: data.code,
        name: data.name,
        institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
        isActive: parseBoolean(data.isActive ?? data.is_active, true),
        updatedAt: now,
        updatedBy: userId,
      },
    });

    // Update Details if provided
    if (Array.isArray(data.details)) {
      // Remove old details
      await tx.workShiftDetail.deleteMany({
        where: { shiftId: String(id) },
      });

      // Insert new details
      if (data.details.length > 0) {
        const detailsData = data.details.map((d) => ({
          id: uuidv4(),
          shiftId: String(id),
          dayOfWeek: Number(d.dayOfWeek ?? d.day_of_week),
          workTimeId: d.workTimeId ?? d.work_time_id ? Number(d.workTimeId ?? d.work_time_id) : null,
          isWorkingDay: parseBoolean(d.isWorkingDay ?? d.is_working_day, true),
          createdAt: now,
          createdBy: userId,
        }));

        await tx.workShiftDetail.createMany({
          data: detailsData,
        });
      }
    }
  });

  return resolveById(id);
};

const remove = async (id) => {
  await resolveById(id);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.workShift.update({
      where: { id: String(id) },
      data: { isDeleted: true, deletedAt: now },
    });

    await tx.workShiftDetail.updateMany({
      where: { shiftId: String(id) },
      data: { isDeleted: true, deletedAt: now },
    });
  });
};

module.exports = {
  resolveAll,
  getAll,
  resolveById,
  create,
  update,
  remove,
};
