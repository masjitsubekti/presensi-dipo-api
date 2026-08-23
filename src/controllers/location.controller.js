const { body, query } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const locationService = require('../services/location.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/location */
exports.index = async (req, res, next) => {
  try {
    const result = await locationService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/location/all */
exports.all = async (req, res, next) => {
  try {
    const data = await locationService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/location/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await locationService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/location */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode lokasi wajib diisi'),
      body('name').notEmpty().withMessage('Nama lokasi wajib diisi'),
      body('institutionId').notEmpty().withMessage('Institusi wajib dipilih'),
      body('latitude').notEmpty().isFloat().withMessage('Latitude wajib diisi dan harus berupa angka desimal'),
      body('longitude').notEmpty().isFloat().withMessage('Longitude wajib diisi dan harus berupa angka desimal'),
      body('radiusMeter').optional().isInt({ min: 1 }).withMessage('Radius harus berupa bilangan bulat positif'),
    ]);

    const data = await locationService.create(req.body, req.user);
    return response.success(res, data, 'Lokasi presensi berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/location/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode lokasi wajib diisi'),
      body('name').notEmpty().withMessage('Nama lokasi wajib diisi'),
      body('institutionId').notEmpty().withMessage('Institusi wajib dipilih'),
      body('latitude').notEmpty().isFloat().withMessage('Latitude wajib diisi dan harus berupa angka desimal'),
      body('longitude').notEmpty().isFloat().withMessage('Longitude wajib diisi dan harus berupa angka desimal'),
      body('radiusMeter').optional().isInt({ min: 1 }).withMessage('Radius harus berupa bilangan bulat positif'),
    ]);

    const data = await locationService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Lokasi presensi berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/location/:id */
exports.destroy = async (req, res, next) => {
  try {
    await locationService.remove(req.params.id);
    return response.success(res, null, 'Lokasi presensi berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
