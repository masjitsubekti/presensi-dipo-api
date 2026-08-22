const { v4: uuidv4 } = require('uuid');
const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Role Service
 * Handles CRUD operations for auth_role
 */

const SORT_MAP = {
  name: 'name',
  createdAt: 'createdAt',
  created_at: 'createdAt',
};

/**
 * Get all roles with pagination
 * @param {Object} params
 * @returns {Object}
 */
const resolveAll = async (params = {}) => {
  const { pageNumber, pageSize, skip } = parsePaginationParams(params);
  const keyword = params.q ?? params.search ?? null;
  const sortBy = SORT_MAP[params.sortBy] ?? 'name';
  const sortType = (params.sortType ?? 'asc').toLowerCase() === 'asc' ? 'asc' : 'desc';

  const where = keyword
    ? {
        OR: [
          { name: { contains: keyword } },
          { description: { contains: keyword } },
        ],
      }
    : {};

  const [total, items] = await Promise.all([
    prisma.authRole.count({ where }),
    prisma.authRole.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { [sortBy]: sortType },
    }),
  ]);

  return paginate(items, total, pageNumber, pageSize);
};

/**
 * Get all roles without pagination
 * @returns {Array}
 */
const getAll = async () => {
  return prisma.authRole.findMany({ orderBy: { name: 'asc' } });
};

/**
 * Get role by ID
 * @param {string} id
 * @returns {Object}
 */
const getById = async (id) => {
  const role = await prisma.authRole.findUnique({ where: { id } });
  if (!role) throw { status: 404, message: 'Role tidak ditemukan' };
  return role;
};

/**
 * Create new role
 * @param {Object} data
 * @returns {Object}
 */
const create = async (data) => {
  const existing = await prisma.authRole.findUnique({ where: { name: data.name } });
  if (existing) throw { status: 409, message: 'Nama role sudah dipakai' };

  return prisma.authRole.create({
    data: {
      id: data.id ?? uuidv4(),
      name: data.name,
      description: data.description ?? null,
    },
  });
};

/**
 * Update role
 * @param {string} id
 * @param {Object} data
 * @returns {Object}
 */
const update = async (id, data) => {
  await getById(id);

  return prisma.authRole.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description ?? null,
    },
  });
};

/**
 * Delete role
 * @param {string} id
 */
const remove = async (id) => {
  await getById(id);
  await prisma.authRole.delete({ where: { id } });
};

module.exports = {
  resolveAll,
  getAll,
  getById,
  create,
  update,
  remove,
};
