const prisma = require('../config/prisma');
const { paginate, parsePaginationParams } = require('../helpers/pagination.helper');

/**
 * Menu Service (c_menu / Hak Akses & Menu System)
 * Refactored to Raw SQL DTO Query pattern
 */

const SORT_MAP = {
  id: 'm.id',
  name: 'm.name',
  seq: 'm.seq',
  level: 'm.level',
  link: 'm.link',
  permissionLabel: 'm.permission_label',
  createdAt: 'm.created_at',
  created_at: 'm.created_at',
  updatedAt: 'm.updated_at',
  updated_at: 'm.updated_at',
  parentId: 'm.parent_id',
  parent_id: 'm.parent_id',
  parentName: 'p.name',
};

const selectMenuDTOQuery = `
  SELECT 
    m.id, m.name, m.link, m.icon, m.description, 
    m.permission_label AS permissionLabel, m.action, 
    m.level, m.seq, m.parent_id AS parentId, p.name AS parentName,
    m.created_by AS createdBy, m.created_at AS createdAt, 
    m.updated_by AS updatedBy, m.updated_at AS updatedAt, 
    m.is_deleted AS isDeleted
  FROM c_menu m
  LEFT JOIN c_menu p ON m.parent_id = p.id
`;

const formatMenuItem = (item) => {
  if (!item) return null;
  return {
    ...item,
    id: item.id ? Number(item.id) : null,
    parentId: item.parentId ? Number(item.parentId) : null,
    level: item.level ? Number(item.level) : 1,
    seq: item.seq ? Number(item.seq) : 1,
    isDeleted: Boolean(item.isDeleted),
  };
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
  const keyword = params.q ?? params.search ?? null;
  const level = params.level ? parseInt(params.level, 10) : null;
  const parentId = params.parentId ?? params.parent_id ?? null;
  const ignorePaging = parseBoolean(params.ignorePaging, false);

  const sortBy = SORT_MAP[params.sortBy] ?? 'm.seq';
  const sortType = params.sortType ?? 'DESC';

  const conditions = ['m.is_deleted = 0'];
  const values = [];

  if (level) {
    conditions.push('m.level = ?');
    values.push(level);
  }

  if (parentId) {
    conditions.push('m.parent_id = ?');
    values.push(Number(parentId));
  }

  if (keyword) {
    conditions.push('CONCAT(m.name, IFNULL(m.link, ""), IFNULL(m.permission_label, ""), IFNULL(p.name, "")) LIKE ?');
    values.push(`%${keyword}%`);
  }

  const whereSql = conditions.join(' AND ');

  const countSql = `SELECT COUNT(*) AS total FROM (${selectMenuDTOQuery} WHERE ${whereSql}) x`;
  const countResult = await prisma.$queryRawUnsafe(countSql, ...values);
  const total = Number(countResult[0]?.total ?? 0);

  let dataSql = `
    ${selectMenuDTOQuery}
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

  const formattedItems = (items || []).map(formatMenuItem);

  return paginate(formattedItems, total, pageNumber, ignorePaging ? (total || 1) : pageSize);
};

const getAll = async () => {
  const dataSql = `
    ${selectMenuDTOQuery}
    WHERE m.is_deleted = 0
    ORDER BY m.seq ASC
  `;
  const items = await prisma.$queryRawUnsafe(dataSql);
  return (items || []).map(formatMenuItem);
};

const getTree = async () => {
  const allItems = await getAll();
  const rootMenus = allItems.filter((m) => m.parentId === null);

  return rootMenus.map((root) => ({
    ...root,
    children: allItems.filter((m) => m.parentId === root.id),
  }));
};

const resolveById = async (id) => {
  const dataSql = `
    ${selectMenuDTOQuery}
    WHERE m.id = ? AND m.is_deleted = 0
  `;
  const result = await prisma.$queryRawUnsafe(dataSql, Number(id));
  if (!result || !result.length) {
    throw { status: 404, message: 'Menu tidak ditemukan' };
  }
  return formatMenuItem(result[0]);
};

const getById = async (id) => {
  return resolveById(id);
};

const create = async (data, user = null) => {
  const created = await prisma.cMenu.create({
    data: {
      name: data.name,
      link: data.link ?? null,
      icon: data.icon ?? null,
      description: data.description ?? null,
      permissionLabel: data.permissionLabel ?? null,
      action: data.action ?? null,
      level: data.level ? Number(data.level) : 1,
      seq: data.seq ? Number(data.seq) : 1,
      parentId: data.parentId ? Number(data.parentId) : null,
      createdAt: new Date(),
      createdBy: user?.id ?? null,
    },
  });

  return resolveById(created.id);
};

const update = async (id, data, user = null) => {
  await resolveById(id);

  await prisma.cMenu.update({
    where: { id: Number(id) },
    data: {
      name: data.name,
      link: data.link ?? null,
      icon: data.icon ?? null,
      description: data.description ?? null,
      permissionLabel: data.permissionLabel ?? null,
      action: data.action ?? null,
      level: data.level ? Number(data.level) : 1,
      seq: data.seq ? Number(data.seq) : 1,
      parentId: data.parentId ? Number(data.parentId) : null,
      updatedAt: new Date(),
      updatedBy: user?.id ?? null,
    },
  });

  return resolveById(id);
};

const remove = async (id) => {
  await getById(id);
  await prisma.cMenu.update({
    where: { id: Number(id) },
    data: { isDeleted: true },
  });
};

const bulkAssignRole = async (items) => {
  if (!Array.isArray(items)) return [];

  const results = [];

  for (const item of items) {
    if (!item.menuId || !item.roleId) continue;

    const menuIdNum = Number(item.menuId);
    const roleId = String(item.roleId);

    let permission = null;
    if (Array.isArray(item.permission)) {
      permission = item.permission.filter(Boolean).join(',');
    } else if (Array.isArray(item.permissionList)) {
      permission = item.permissionList.filter(Boolean).join(',');
    } else if (typeof item.permission === 'string') {
      permission = item.permission.trim();
    }
    if (!permission) permission = null;

    const mainPage = Boolean(item.mainPage);

    const existing = await prisma.cMenuRole.findFirst({
      where: {
        menuId: menuIdNum,
        roleId: roleId,
      },
    });

    if (!permission && !mainPage) {
      if (existing) {
        await prisma.cMenuRole.delete({
          where: { id: existing.id },
        });
      }
      continue;
    }

    if (existing) {
      const updated = await prisma.cMenuRole.update({
        where: { id: existing.id },
        data: {
          permission,
          mainPage,
        },
      });
      results.push({
        ...updated,
        id: updated.id.toString(),
        menuId: updated.menuId.toString(),
      });
    } else {
      const created = await prisma.cMenuRole.create({
        data: {
          menuId: menuIdNum,
          roleId: roleId,
          permission,
          mainPage,
        },
      });
      results.push({
        ...created,
        id: created.id.toString(),
        menuId: created.menuId.toString(),
      });
    }
  }

  return results;
};

const getByRole = async (roleId) => {
  const menuRoles = await prisma.cMenuRole.findMany({
    where: {
      roleId,
      menu: { isDeleted: false },
    },
  });

  const roleMap = new Map();
  menuRoles.forEach((mr) => {
    roleMap.set(mr.menuId.toString(), mr);
  });

  const allMenus = await getAll();
  const allRootMenus = allMenus.filter((m) => m.parentId === null);

  const formatAuthMenuItem = (menu) => {
    const menuIdStr = menu.id.toString();
    const mapping = roleMap.get(menuIdStr);

    const rawPermissions = mapping?.permission
      ? mapping.permission.split(',').map((p) => p.trim()).filter(Boolean)
      : [];

    const label = menu.permissionLabel ? menu.permissionLabel.trim() : null;
    const permissionList = rawPermissions.map((p) => (label ? `${label}.${p}` : p));

    return {
      id: mapping ? mapping.id.toString() : null,
      menuId: menuIdStr,
      roleId: roleId,
      name: menu.name,
      link: menu.link,
      icon: menu.icon,
      description: menu.description,
      level: menu.level,
      seq: menu.seq,
      permissionLabel: menu.permissionLabel,
      action: menu.action,
      permission: mapping?.permission ?? null,
      permissionList,
      mainPage: mapping?.mainPage ?? false,
    };
  };

  const results = [];
  for (const rootMenu of allRootMenus) {
    const childMenus = allMenus.filter((m) => m.parentId === rootMenu.id);

    const formattedChildren = childMenus
      .map(formatAuthMenuItem)
      .filter((cm) => cm.permission || cm.mainPage);

    const formattedRoot = formatAuthMenuItem(rootMenu);

    if (formattedRoot.permission || formattedRoot.mainPage || formattedChildren.length > 0) {
      formattedRoot.children = formattedChildren;
      results.push(formattedRoot);
    }
  }

  return results;
};

const getByRoleTrx = async (roleId) => {
  const allMenus = await getAll();
  const rootMenus = allMenus.filter((m) => m.parentId === null);

  const roleMappings = await prisma.cMenuRole.findMany({
    where: { roleId },
  });

  const roleMap = new Map();
  roleMappings.forEach((rm) => {
    roleMap.set(rm.menuId.toString(), rm);
  });

  const formatMenuItem = (menu) => {
    const menuIdStr = menu.id.toString();
    const mapping = roleMap.get(menuIdStr);

    const actionList = menu.action
      ? menu.action.split(',').map((a) => a.trim()).filter(Boolean)
      : ['VIEW', 'CREATE', 'UPDATE', 'DELETE'];

    const permissionList = mapping?.permission
      ? mapping.permission.split(',').map((p) => p.trim()).filter(Boolean)
      : [];

    return {
      id: mapping ? mapping.id.toString() : null,
      menuId: menuIdStr,
      roleId: roleId,
      name: menu.name,
      link: menu.link,
      icon: menu.icon,
      description: menu.description,
      level: menu.level,
      seq: menu.seq,
      permissionLabel: menu.permissionLabel,
      action: menu.action,
      actionList,
      permission: mapping?.permission ?? null,
      permissionList,
      mainPage: mapping?.mainPage ?? false,
    };
  };

  const results = [];
  for (const rootMenu of rootMenus) {
    const childMenus = allMenus.filter((m) => m.parentId === rootMenu.id);

    const formattedRoot = formatMenuItem(rootMenu);
    formattedRoot.children = childMenus.map(formatMenuItem);
    results.push(formattedRoot);
  }

  return results;
};

module.exports = {
  resolveAll,
  getAll,
  getTree,
  getById,
  resolveById,
  create,
  update,
  remove,
  bulkAssignRole,
  getByRole,
  getByRoleTrx,
};
