const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const workTimeService = require('../services/work-time.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/work-time */
exports.index = async (req, res, next) => {
  try {
    const result = await workTimeService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-time/all */
exports.all = async (req, res, next) => {
  try {
    const data = await workTimeService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-time/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await workTimeService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/work-time */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jam kerja wajib diisi'),
      body('name').notEmpty().withMessage('Nama jam kerja wajib diisi'),
      body('workStartTime').notEmpty().withMessage('Jam masuk kerja wajib diisi'),
      body('workEndTime').notEmpty().withMessage('Jam pulang kerja wajib diisi'),
      body('checkinStart').notEmpty().withMessage('Jam awal presensi masuk wajib diisi'),
      body('checkinEnd').notEmpty().withMessage('Jam akhir presensi masuk wajib diisi'),
    ]);

    const data = await workTimeService.create(req.body, req.user);
    return response.success(res, data, 'Preset Jam Kerja berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/work-time/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jam kerja wajib diisi'),
      body('name').notEmpty().withMessage('Nama jam kerja wajib diisi'),
      body('workStartTime').notEmpty().withMessage('Jam masuk kerja wajib diisi'),
      body('workEndTime').notEmpty().withMessage('Jam pulang kerja wajib diisi'),
      body('checkinStart').notEmpty().withMessage('Jam awal presensi masuk wajib diisi'),
      body('checkinEnd').notEmpty().withMessage('Jam akhir presensi masuk wajib diisi'),
    ]);

    const data = await workTimeService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Preset Jam Kerja berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/work-time/:id */
exports.destroy = async (req, res, next) => {
  try {
    await workTimeService.remove(req.params.id);
    return response.success(res, null, 'Preset Jam Kerja berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
