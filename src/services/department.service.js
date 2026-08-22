const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Department Service (m_department / Departemen)
 */

const RAW_SORT_MAP = {
  id: 'd.id',
  code: 'd.code',
  name: 'd.name',
  createdAt: 'd.created_at',
  created_at: 'd.created_at',
  updatedAt: 'd.updated_at',
  updated_at: 'd.updated_at',
  institutionId: 'd.institution_id',
  institution_id: 'd.institution_id',
  institutionCode: 'i.code',
  institutionName: 'i.name',
};

const selectDepartmentDTOQuery = `
  SELECT 
    d.id, d.code, d.name, d.created_by AS createdBy, d.created_at AS createdAt, 
    d.updated_by AS updatedBy, d.updated_at AS updatedAt, d.deleted_at AS deletedAt, 
    d.is_deleted AS isDeleted, d.institution_id AS institutionId,
    i.code AS institutionCode, i.name AS institutionName
  FROM m_department d
  LEFT JOIN m_institution i ON d.institution_id = i.id
`;

const departmentSelect = {
  id: true,
  code: true,
  name: true,
  institutionId: true,
  createdAt: true,
  updatedAt: true,
  institution: { select: { id: true, code: true, name: true } },
};

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;

  const sortBy = RAW_SORT_MAP[params.sortBy] ?? 'd.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['d.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('d.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (keyword) {
    conditions.push('CONCAT(d.code, d.name, i.code, i.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectDepartmentDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectDepartmentDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);

  return paginate(items, total, pageNumber, pageSize);
};

const getAll = async (params = {}) => {
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const conditions = ['d.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('d.institution_id = ?');
    values.push(Number(institutionId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectDepartmentDTOQuery}
    WHERE ${whereSql}
    ORDER BY d.name ASC
  `;

  return prisma.$queryRawUnsafe(dataSql, ...values);
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectDepartmentDTOQuery}
    WHERE d.id = ? AND d.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Departemen tidak ditemukan' };
  return result[0];
};

const getById = async (id) => {
  const dept = await prisma.mDepartment.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: departmentSelect,
  });
  if (!dept) throw { status: 404, message: 'Departemen tidak ditemukan' };
  return dept;
};

const create = async (data, user = null) => {
  return prisma.mDepartment.create({
    data: {
      code: data.code,
      name: data.name,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: departmentSelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  return prisma.mDepartment.update({
    where: { id: Number(id) },
    data: {
      code: data.code,
      name: data.name,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: departmentSelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mDepartment.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
