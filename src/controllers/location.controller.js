const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const locationService = require('../services/location.service');
const response = require('../helpers/response.helper');

/**
 * Helper to resolve institutionId from explicit parameter (query/body) first, fallback to user session
 */
const resolveInstitutionId = (user, explicitId) => {
  if (explicitId !== undefined && explicitId !== null && explicitId !== '') {
    return Number(explicitId);
  }
  if (user?.institutionId) {
    return Number(user.institutionId);
  }
  return null;
};

/** GET /v1/master/location */
exports.index = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const result = await locationService.resolveAll(params);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/location/all */
exports.all = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const data = await locationService.getAll(params);
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
    const institutionId = resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id);
    if (!institutionId) {
      return response.error(res, 'Institusi wajib dipilih', 422);
    }
    req.body.institutionId = institutionId;

    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode lokasi wajib diisi'),
      body('name').notEmpty().withMessage('Nama lokasi wajib diisi'),
      body('latitude').notEmpty().isFloat().withMessage('Latitude wajib diisi dan harus berupa angka desimal'),
      body('longitude').notEmpty().isFloat().withMessage('Longitude wajib diisi dan harus berupa angka desimal'),
      body('radiusMeter').optional().isInt({ min: 1 }).withMessage('Radius harus berupa bilangan bulat positif'),
    ]);

    const payload = {
      ...req.body,
      institutionId,
    };

    const data = await locationService.create(payload, req.user);
    return response.success(res, data, 'Lokasi presensi berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/location/:id */
exports.update = async (req, res, next) => {
  try {
    const current = await locationService.getById(req.params.id);

    // Cegah Admin Sekolah mengubah lokasi milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk mengubah lokasi presensi institusi lain', 403);
    }

    const institutionId = resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id) ?? current.institutionId;
    req.body.institutionId = institutionId;

    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode lokasi wajib diisi'),
      body('name').notEmpty().withMessage('Nama lokasi wajib diisi'),
      body('latitude').notEmpty().isFloat().withMessage('Latitude wajib diisi dan harus berupa angka desimal'),
      body('longitude').notEmpty().isFloat().withMessage('Longitude wajib diisi dan harus berupa angka desimal'),
      body('radiusMeter').optional().isInt({ min: 1 }).withMessage('Radius harus berupa bilangan bulat positif'),
    ]);

    const payload = {
      ...req.body,
      institutionId,
    };

    const data = await locationService.update(req.params.id, payload, req.user);
    return response.success(res, data, 'Lokasi presensi berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/location/:id */
exports.destroy = async (req, res, next) => {
  try {
    const current = await locationService.getById(req.params.id);

    // Cegah Admin Sekolah menghapus lokasi milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk menghapus lokasi presensi institusi lain', 403);
    }

    await locationService.remove(req.params.id);
    return response.success(res, null, 'Lokasi presensi berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

