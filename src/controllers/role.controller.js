const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const roleService = require('../services/role.service');
const response = require('../helpers/response.helper');

/** GET /v1/roles */
exports.index = async (req, res, next) => {
  try {
    const result = await roleService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/roles/all */
exports.all = async (req, res, next) => {
  try {
    const data = await roleService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/roles/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await roleService.getById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/roles */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama role wajib diisi').isLength({ max: 100 }),
    ]);

    const data = await roleService.create(req.body);
    return response.success(res, data, 'Role berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/roles/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama role wajib diisi').isLength({ max: 100 }),
    ]);

    const data = await roleService.update(req.params.id, req.body);
    return response.success(res, data, 'Role berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/roles/:id */
exports.destroy = async (req, res, next) => {
  try {
    await roleService.remove(req.params.id);
    return response.success(res, null, 'Role berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
