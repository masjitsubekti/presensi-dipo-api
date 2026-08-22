const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const workShiftService = require('../services/work-shift.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/work-shift */
exports.index = async (req, res, next) => {
  try {
    const result = await workShiftService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift/all */
exports.all = async (req, res, next) => {
  try {
    const data = await workShiftService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await workShiftService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/work-shift */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode shift wajib diisi'),
      body('name').notEmpty().withMessage('Nama shift wajib diisi'),
      body('details').optional().isArray().withMessage('Details harus berupa array'),
    ]);

    const data = await workShiftService.create(req.body, req.user);
    return response.success(res, data, 'Master Jam Kerja berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/work-shift/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode shift wajib diisi'),
      body('name').notEmpty().withMessage('Nama shift wajib diisi'),
      body('details').optional().isArray().withMessage('Details harus berupa array'),
    ]);

    const data = await workShiftService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Master Jam Kerja berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/work-shift/:id */
exports.destroy = async (req, res, next) => {
  try {
    await workShiftService.remove(req.params.id);
    return response.success(res, null, 'Master Jam Kerja berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
