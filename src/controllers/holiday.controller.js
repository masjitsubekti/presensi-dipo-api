const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const holidayService = require('../services/holiday.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/holiday */
exports.index = async (req, res, next) => {
  try {
    const result = await holidayService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/holiday/all */
exports.all = async (req, res, next) => {
  try {
    const data = await holidayService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/holiday/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await holidayService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/holiday */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('date').notEmpty().withMessage('Tanggal libur wajib diisi').isISO8601().withMessage('Format tanggal tidak valid (YYYY-MM-DD)'),
      body('title').notEmpty().withMessage('Judul libur wajib diisi'),
      body('institutionId').optional({ nullable: true }).isNumeric().withMessage('institutionId harus angka'),
      body('institution_id').optional({ nullable: true }).isNumeric().withMessage('institution_id harus angka'),
      body('isNational').optional().isBoolean().withMessage('isNational harus boolean'),
      body('is_national').optional().isBoolean().withMessage('is_national harus boolean'),
    ]);

    const data = await holidayService.create(req.body, req.user);
    return response.success(res, data, 'Hari libur berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/holiday/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('date').notEmpty().withMessage('Tanggal libur wajib diisi').isISO8601().withMessage('Format tanggal tidak valid (YYYY-MM-DD)'),
      body('title').notEmpty().withMessage('Judul libur wajib diisi'),
      body('institutionId').optional({ nullable: true }).isNumeric().withMessage('institutionId harus angka'),
      body('institution_id').optional({ nullable: true }).isNumeric().withMessage('institution_id harus angka'),
      body('isNational').optional().isBoolean().withMessage('isNational harus boolean'),
      body('is_national').optional().isBoolean().withMessage('is_national harus boolean'),
    ]);

    const data = await holidayService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Hari libur berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/holiday/:id */
exports.destroy = async (req, res, next) => {
  try {
    await holidayService.remove(req.params.id);
    return response.success(res, null, 'Hari libur berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
