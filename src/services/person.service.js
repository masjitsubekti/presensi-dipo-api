const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Person Service (m_person / Pegawai/Karyawan)
 */

const SORT_MAP = {
  id: 'p.id',
  nip: 'p.nip',
  name: 'p.name',
  createdAt: 'p.created_at',
  created_at: 'p.created_at',
  updatedAt: 'p.updated_at',
  updated_at: 'p.updated_at',
  institutionId: 'p.institution_id',
  institution_id: 'p.institution_id',
  positionId: 'p.position_id',
  position_id: 'p.position_id',
  departmentId: 'p.department_id',
  department_id: 'p.department_id',
  institutionName: 'i.name',
  positionName: 'pos.name',
  departmentName: 'dept.name',
};

const selectPersonDTOQuery = `
  SELECT 
    p.id, p.nip, p.name, p.gender, p.birth_date AS birthDate, p.tmt, 
    p.phone, p.email, p.address, p.status, p.photo,
    p.created_by AS createdBy, p.created_at AS createdAt, 
    p.updated_by AS updatedBy, p.updated_at AS updatedAt, p.deleted_at AS deletedAt, 
    p.is_deleted AS isDeleted, 
    p.institution_id AS institutionId, i.code AS institutionCode, i.name AS institutionName,
    p.position_id AS positionId, pos.code AS positionCode, pos.name AS positionName,
    p.department_id AS departmentId, dept.code AS departmentCode, dept.name AS departmentName
  FROM m_person p
  LEFT JOIN m_institution i ON p.institution_id = i.id
  LEFT JOIN m_position pos ON p.position_id = pos.id
  LEFT JOIN m_department dept ON p.department_id = dept.id
`;

const personSelect = {
  id: true,
  nip: true,
  name: true,
  gender: true,
  birthDate: true,
  tmt: true,
  phone: true,
  email: true,
  address: true,
  institutionId: true,
  positionId: true,
  departmentId: true,
  status: true,
  photo: true,
  createdAt: true,
  createdBy: true,
  updatedAt: true,
  updatedBy: true,
  deletedAt: true,
  isDeleted: true,
};

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const positionId = params.positionId ?? params.position_id ?? null;
  const departmentId = params.departmentId ?? params.department_id ?? null;
  const status = params.status ?? null;

  const sortBy = SORT_MAP[params.sortBy] ?? 'p.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['p.is_deleted = 0'];
  const values = [];

  if (institutionId) {
    conditions.push('p.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (positionId) {
    conditions.push('p.position_id = ?');
    values.push(Number(positionId));
  }

  if (departmentId) {
    conditions.push('p.department_id = ?');
    values.push(Number(departmentId));
  }

  if (status) {
    conditions.push('p.status = ?');
    values.push(status);
  }

  if (keyword) {
    conditions.push('CONCAT(p.nip, p.name, p.email, p.phone, i.name, pos.name, dept.name) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectPersonDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  const dataSql = `
    ${selectPersonDTOQuery}
    WHERE ${whereSql}
    ORDER BY ${sortBy} ${sortType}
    LIMIT ? OFFSET ?
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values, pageSize, skip);

  return paginate(items, total, pageNumber, pageSize);
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
    ${selectPersonDTOQuery}
    WHERE ${whereSql}
    ORDER BY p.name ASC
  `;

  return prisma.$queryRawUnsafe(dataSql, ...values);
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectPersonDTOQuery}
    WHERE p.id = ? AND p.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) throw { status: 404, message: 'Person/Pegawai tidak ditemukan' };
  return result[0];
};

const getById = async (id) => {
  const person = await prisma.mPerson.findFirst({
    where: { id: Number(id), isDeleted: false },
    select: personSelect,
  });
  if (!person) throw { status: 404, message: 'Person/Pegawai tidak ditemukan' };
  return person;
};

const create = async (data, user = null) => {
  return prisma.mPerson.create({
    data: {
      nip: data.nip ?? null,
      name: data.name,
      gender: data.gender ?? null,
      birthDate: data.birthDate ?? data.birth_date ? new Date(data.birthDate ?? data.birth_date) : null,
      tmt: data.tmt ? new Date(data.tmt) : null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      positionId: data.positionId ?? data.position_id ? Number(data.positionId ?? data.position_id) : null,
      departmentId: data.departmentId ?? data.department_id ? Number(data.departmentId ?? data.department_id) : null,
      status: data.status ?? 'aktif',
      photo: data.photo ?? null,
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
    select: personSelect,
  });
};

const update = async (id, data, user = null) => {
  await getById(id);
  return prisma.mPerson.update({
    where: { id: Number(id) },
    data: {
      nip: data.nip ?? null,
      name: data.name,
      gender: data.gender ?? null,
      birthDate: data.birthDate ?? data.birth_date ? new Date(data.birthDate ?? data.birth_date) : null,
      tmt: data.tmt ? new Date(data.tmt) : null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      positionId: data.positionId ?? data.position_id ? Number(data.positionId ?? data.position_id) : null,
      departmentId: data.departmentId ?? data.department_id ? Number(data.departmentId ?? data.department_id) : null,
      status: data.status ?? 'aktif',
      photo: data.photo ?? null,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
    select: personSelect,
  });
};

const remove = async (id) => {
  await getById(id);
  await prisma.mPerson.update({
    where: { id: Number(id) },
    data: { isDeleted: true, deletedAt: new Date() },
  });
};

module.exports = { resolveAll, getAll, getById, resolveById, create, update, remove };
