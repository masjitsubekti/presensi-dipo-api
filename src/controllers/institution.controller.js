const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const institutionService = require('../services/institution.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/institution */
exports.index = async (req, res, next) => {
  try {
    const result = await institutionService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/institution/all */
exports.all = async (req, res, next) => {
  try {
    const data = await institutionService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/institution/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await institutionService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/institution */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode institusi wajib diisi'),
      body('name').notEmpty().withMessage('Nama institusi wajib diisi'),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
    ]);

    const data = await institutionService.create(req.body, req.user);
    return response.success(res, data, 'Institusi berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/institution/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode institusi wajib diisi'),
      body('name').notEmpty().withMessage('Nama institusi wajib diisi'),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
    ]);

    const data = await institutionService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Institusi berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/institution/:id */
exports.destroy = async (req, res, next) => {
  try {
    await institutionService.remove(req.params.id);
    return response.success(res, null, 'Institusi berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
