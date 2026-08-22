const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const menuService = require('../services/menu.service');
const response = require('../helpers/response.helper');

/** GET /api/menu */
exports.index = async (req, res, next) => {
  try {
    const result = await menuService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /api/menu/all */
exports.all = async (req, res, next) => {
  try {
    const data = await menuService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /api/menu/tree */
exports.tree = async (req, res, next) => {
  try {
    const data = await menuService.getTree();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /api/menu/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await menuService.getById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /api/menu */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama menu wajib diisi').isLength({ max: 100 }),
    ]);

    const data = await menuService.create(req.body);
    return response.success(res, data, 'Menu berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /api/menu/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama menu wajib diisi').isLength({ max: 100 }),
    ]);

    const data = await menuService.update(req.params.id, req.body);
    return response.success(res, data, 'Menu berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /api/menu/:id */
exports.destroy = async (req, res, next) => {
  try {
    await menuService.remove(req.params.id);
    return response.success(res, null, 'Menu berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** GET /api/menu-role?roleId=... */
exports.getByRole = async (req, res, next) => {
  try {
    const { roleId, role_id } = req.query;
    const id = roleId ?? role_id ?? req.user?.roleId;
    if (!id) return response.error(res, 'roleId diperlukan', 400);
    const data = await menuService.getByRole(id);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /api/menu-role/trx?roleId=... */
exports.getByRoleTrx = async (req, res, next) => {
  try {
    const { roleId, role_id } = req.query;
    const id = roleId ?? role_id ?? req.user?.roleId;
    if (!id) return response.error(res, 'roleId diperlukan', 400);
    const data = await menuService.getByRoleTrx(id);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** POST /api/menu-role/bulk */
exports.bulkAssignRole = async (req, res, next) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body.data || req.body.items);
    if (!items || !Array.isArray(items)) {
      return response.error(res, 'Data items harus berupa array', 400);
    }
    const data = await menuService.bulkAssignRole(items);
    return response.success(res, data, 'Menu role berhasil diperbarui');
  } catch (err) { next(err); }
};
