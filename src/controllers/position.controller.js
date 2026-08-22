const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const positionService = require('../services/position.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/position */
exports.index = async (req, res, next) => {
  try {
    const result = await positionService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/position/all */
exports.all = async (req, res, next) => {
  try {
    const data = await positionService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/position/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await positionService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/position */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jabatan wajib diisi'),
      body('name').notEmpty().withMessage('Nama jabatan wajib diisi'),
    ]);

    const data = await positionService.create(req.body, req.user);
    return response.success(res, data, 'Posisi/Jabatan berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/position/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jabatan wajib diisi'),
      body('name').notEmpty().withMessage('Nama jabatan wajib diisi'),
    ]);

    const data = await positionService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Posisi/Jabatan berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/position/:id */
exports.destroy = async (req, res, next) => {
  try {
    await positionService.remove(req.params.id);
    return response.success(res, null, 'Posisi/Jabatan berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
