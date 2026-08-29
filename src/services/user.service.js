const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * User Service (auth_user / User System & Access)
 * Refactored to Raw SQL DTO Query pattern
 */

const SORT_MAP = {
  id: 'u.id',
  name: 'u.name',
  username: 'u.username',
  email: 'u.email',
  roleId: 'u.role_id',
  role_id: 'u.role_id',
  roleName: 'r.name',
  institutionId: 'u.institution_id',
  institution_id: 'u.institution_id',
  institutionName: 'i.name',
  active: 'u.active',
  createdAt: 'u.created_at',
  created_at: 'u.created_at',
  updatedAt: 'u.updated_at',
  updated_at: 'u.updated_at',
};

const parseBoolean = (val, defaultVal = true) => {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val === 1;
  if (typeof val === 'string') return val === 'true' || val === '1';
  return Boolean(val);
};

const selectUserDTOQuery = `
  SELECT 
    u.id, u.name, u.username, u.email, u.status, u.foto, 
    u.active, u.role_id AS roleId, r.name AS roleName,
    u.person_id AS personId, p.name AS personName, p.nip AS personNip,
    u.institution_id AS institutionId, i.name AS institutionName,
    u.created_by AS createdBy, u.created_at AS createdAt, 
    u.updated_by AS updatedBy, u.updated_at AS updatedAt, 
    u.deleted_at AS deletedAt, u.is_deleted AS isDeleted
  FROM auth_user u
  LEFT JOIN auth_role r ON u.role_id = r.id
  LEFT JOIN m_person p ON u.person_id = p.id
  LEFT JOIN m_institution i ON u.institution_id = i.id
`;

const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const active = params.active !== undefined ? params.active : undefined;
  const roleId = params.roleId ?? params.role_id ?? null;
  const personId = params.personId ?? params.person_id ?? null;
  const institutionId = params.institutionId ?? params.institution_id ?? null;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'u.created_at';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['u.is_deleted = 0'];
  const values = [];

  if (active !== undefined) {
    conditions.push('u.active = ?');
    values.push(parseBoolean(active) ? 1 : 0);
  }

  if (roleId) {
    conditions.push('u.role_id = ?');
    values.push(String(roleId));
  }

  if (personId) {
    conditions.push('u.person_id = ?');
    values.push(Number(personId));
  }

  if (institutionId) {
    conditions.push('u.institution_id = ?');
    values.push(Number(institutionId));
  }

  if (keyword) {
    conditions.push('CONCAT(u.name, u.username, IFNULL(u.email, ""), r.name, IFNULL(p.name, ""), IFNULL(i.name, "")) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectUserDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectUserDTOQuery}
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
    personId: item.personId ? Number(item.personId) : null,
    institutionId: item.institutionId ? Number(item.institutionId) : null,
    active: parseBoolean(item.active),
    isActive: parseBoolean(item.active),
  }));

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async (params = {}) => {
  const roleId = params.roleId ?? params.role_id ?? null;
  const conditions = ['u.is_deleted = 0'];
  const values = [];

  if (roleId) {
    conditions.push('u.role_id = ?');
    values.push(String(roleId));
  }

  const whereSql = conditions.join(' AND ');
  const dataSql = `
    ${selectUserDTOQuery}
    WHERE ${whereSql}
    ORDER BY u.name ASC
  `;

  const items = await prisma.$queryRawUnsafe(dataSql, ...values);
  return (items || []).map((item) => ({
    ...item,
    personId: item.personId ? Number(item.personId) : null,
    institutionId: item.institutionId ? Number(item.institutionId) : null,
    active: parseBoolean(item.active),
    isActive: parseBoolean(item.active),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectUserDTOQuery}
    WHERE u.id = ? AND u.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, String(id));
  if (!result || !result.length) {
    throw { status: 404, message: 'User tidak ditemukan' };
  }
  const item = result[0];
  return {
    ...item,
    personId: item.personId ? Number(item.personId) : null,
    institutionId: item.institutionId ? Number(item.institutionId) : null,
    active: parseBoolean(item.active),
    isActive: parseBoolean(item.active),
  };
};

const getById = async (id) => {
  return resolveById(id);
};

const create = async (data, currentUser = null) => {
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const id = uuidv4();

  await prisma.authUser.create({
    data: {
      id: id,
      name: data.name,
      username: data.username,
      email: data.email ?? null,
      password: hashedPassword,
      roleId: String(data.roleId ?? data.role_id),
      personId: data.personId ?? data.person_id ? Number(data.personId ?? data.person_id) : null,
      organizationId: data.organizationId ?? data.organization_id ? Number(data.organizationId ?? data.organization_id) : null,
      institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
      status: data.status ?? null,
      active: parseBoolean(data.active ?? data.isActive, true),
      createdAt: new Date(),
      createdBy: currentUser?.id ?? null,
    },
  });

  return resolveById(id);
};

const update = async (id, data, currentUser = null) => {
  await resolveById(id);

  const updateData = {
    name: data.name,
    username: data.username,
    email: data.email ?? null,
    roleId: String(data.roleId ?? data.role_id),
    personId: data.personId ?? data.person_id ? Number(data.personId ?? data.person_id) : null,
    organizationId: data.organizationId ?? data.organization_id ? Number(data.organizationId ?? data.organization_id) : null,
    institutionId: data.institutionId ?? data.institution_id ? Number(data.institutionId ?? data.institution_id) : null,
    status: data.status ?? null,
    active: parseBoolean(data.active ?? data.isActive, true),
    updatedAt: new Date(),
    updatedBy: currentUser?.id ?? null,
  };

  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, 10);
  }

  await prisma.authUser.update({
    where: { id: String(id) },
    data: updateData,
  });

  return resolveById(id);
};

const remove = async (id) => {
  await resolveById(id);
  await prisma.authUser.update({
    where: { id: String(id) },
    data: {
      active: false,
      isDeleted: true,
      deletedAt: new Date(),
    },
  });
};

const updateActiveStatus = async (id, active) => {
  await resolveById(id);
  await prisma.authUser.update({
    where: { id: String(id) },
    data: { active: parseBoolean(active) },
  });
  return resolveById(id);
};

const updateFcmToken = async (id, device, fcmToken) => {
  await resolveById(id);
  const updateData = {};
  if (device.toUpperCase() === 'MOBILE') {
    updateData.mobileFcmToken = fcmToken;
  } else if (device.toUpperCase() === 'WEB') {
    updateData.webFcmToken = fcmToken;
  }

  await prisma.authUser.update({
    where: { id: String(id) },
    data: updateData,
  });

  return resolveById(id);
};

module.exports = {
  resolveAll,
  getAll,
  getById,
  resolveById,
  create,
  update,
  remove,
  updateActiveStatus,
  updateFcmToken,
};
