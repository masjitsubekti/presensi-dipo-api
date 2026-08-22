const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const departmentService = require('../services/department.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/department */
exports.index = async (req, res, next) => {
  try {
    const result = await departmentService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/department/all */
exports.all = async (req, res, next) => {
  try {
    const data = await departmentService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/department/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await departmentService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/department */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode departemen wajib diisi'),
      body('name').notEmpty().withMessage('Nama departemen wajib diisi'),
    ]);

    const data = await departmentService.create(req.body, req.user);
    return response.success(res, data, 'Departemen berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/department/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode departemen wajib diisi'),
      body('name').notEmpty().withMessage('Nama departemen wajib diisi'),
    ]);

    const data = await departmentService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Departemen berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/department/:id */
exports.destroy = async (req, res, next) => {
  try {
    await departmentService.remove(req.params.id);
    return response.success(res, null, 'Departemen berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
