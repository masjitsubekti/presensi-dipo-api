const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Work Shift Pattern Service (work_shift_pattern / Penugasan Jam Kerja Pegawai)
 */

const RAW_SORT_MAP = {
  id: 'p.id',
  effectiveFrom: 'p.effective_from',
  effective_from: 'p.effective_from',
  effectiveUntil: 'p.effective_until',
  effective_until: 'p.effective_until',
  createdAt: 'p.created_at',
  created_at: 'p.created_at',
  updatedAt: 'p.updated_at',
  updated_at: 'p.updated_at',
  personName: 'per.name',
  shiftName: 's.name',
};

const selectWorkShiftPatternDTOQuery = `
  SELECT 
    p.id, p.effective_from AS effectiveFrom, p.effective_until AS effectiveUntil,
    p.created_by AS createdBy, p.created_at AS createdAt, 
    p.updated_by AS updatedBy, p.updated_at AS updatedAt, p.deleted_at AS deletedAt, 
    p.is_deleted AS isDeleted,
    p.person_id AS personId, per.nip AS personNip, per.name AS personName,
    p.shift_id AS shiftId, s.code AS shiftCode, s.name AS shiftName
  FROM work_shift_pattern p
  LEFT JOIN m_person per ON p.person_id = per.id
  LEFT JOIN work_shift s ON p.shift_id = s.id
`;

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const personId = params.personId ?? params.person_id ?? null;
  const shiftId = params.shiftId ?? params.shift_id ?? null;

  const sortBy = RAW_SORT_MAP[params.sortBy] ?? 'p.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['p.is_deleted = 0'];
  const values = [];

  if (personId) {
    conditions.push('p.person_id = ?');
    values.push(Number(personId));
  }

  if (shiftId) {
    conditions.push('p.shift_id = ?');
    values.push(String(shiftId));
  }

  if (keyword) {
    conditions.push('CONCAT(per.nip, per.name, s.code, s.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectWorkShiftPatternDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectWorkShiftPatternDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);

  return paginate(items, total, pageNumber, pageSize);
};

const getAll = async (params = {}) => {
  const personId = params.personId ?? params.person_id ?? null;
  const shiftId = params.shiftId ?? params.shift_id ?? null;

  const conditions = ['p.is_deleted = 0'];
  const values = [];

  if (personId) {
    conditions.push('p.person_id = ?');
    values.push(Number(personId));
  }

  if (shiftId) {
    conditions.push('p.shift_id = ?');
    values.push(String(shiftId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectWorkShiftPatternDTOQuery}
    WHERE ${whereSql}
    ORDER BY p.effective_from DESC
  `;

  return prisma.$queryRawUnsafe(dataSql, ...values);
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectWorkShiftPatternDTOQuery}
    WHERE p.id = ? AND p.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, String(id));
  if (!result || !result.length) {
    throw { status: 404, message: 'Penugasan Jam Kerja tidak ditemukan' };
  }
  return result[0];
};

const create = async (data, user = null) => {
  const now = new Date();
  const userId = user?.id ?? null;

  const personIdsList = Array.isArray(data.personIds ?? data.person_ids)
    ? (data.personIds ?? data.person_ids)
    : (data.personId ?? data.person_id ? [data.personId ?? data.person_id] : []);

  const shiftIdsList = Array.isArray(data.shiftIds ?? data.shift_ids)
    ? (data.shiftIds ?? data.shift_ids)
    : (data.shiftId ?? data.shift_id ? [data.shiftId ?? data.shift_id] : []);

  // Bulk creation if multiple persons or multiple shifts are provided
  if (personIdsList.length > 0 && shiftIdsList.length > 0 && (personIdsList.length > 1 || shiftIdsList.length > 1)) {
    const effectiveFrom = new Date(data.effectiveFrom ?? data.effective_from);
    const effectiveUntil = data.effectiveUntil ?? data.effective_until ? new Date(data.effectiveUntil ?? data.effective_until) : null;

    const createManyData = [];
    for (const pId of personIdsList) {
      for (const sId of shiftIdsList) {
        createManyData.push({
          id: uuidv4(),
          personId: Number(pId),
          shiftId: String(sId),
          effectiveFrom: effectiveFrom,
          effectiveUntil: effectiveUntil,
          createdAt: now,
          createdBy: userId,
        });
      }
    }

    await prisma.workShiftPattern.createMany({
      data: createManyData,
    });

    return { count: createManyData.length };
  }

  // Single creation
  const id = uuidv4();
  const singlePersonId = personIdsList[0] ?? data.personId ?? data.person_id;
  const singleShiftId = shiftIdsList[0] ?? data.shiftId ?? data.shift_id;

  await prisma.workShiftPattern.create({
    data: {
      id: id,
      personId: Number(singlePersonId),
      shiftId: String(singleShiftId),
      effectiveFrom: new Date(data.effectiveFrom ?? data.effective_from),
      effectiveUntil: data.effectiveUntil ?? data.effective_until ? new Date(data.effectiveUntil ?? data.effective_until) : null,
      createdAt: now,
      createdBy: userId,
    },
  });

  return resolveById(id);
};

const update = async (id, data, user = null) => {
  await resolveById(id);
  const now = new Date();

  await prisma.workShiftPattern.update({
    where: { id: String(id) },
    data: {
      personId: Number(data.personId ?? data.person_id),
      shiftId: String(data.shiftId ?? data.shift_id),
      effectiveFrom: new Date(data.effectiveFrom ?? data.effective_from),
      effectiveUntil: data.effectiveUntil ?? data.effective_until ? new Date(data.effectiveUntil ?? data.effective_until) : null,
      updatedAt: now,
      updatedBy: user?.id ?? null,
    },
  });

  return resolveById(id);
};

const remove = async (id) => {
  await resolveById(id);
  await prisma.workShiftPattern.update({
    where: { id: String(id) },
    data: { isDeleted: true, deletedAt: new Date() },
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
