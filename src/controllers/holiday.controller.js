const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const holidayService = require('../services/holiday.service');
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

/** GET /v1/master/holiday */
exports.index = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const result = await holidayService.resolveAll(params);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/holiday/all */
exports.all = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const data = await holidayService.getAll(params);
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

    const institutionId = resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id);
    const isNational = req.user?.institutionId ? false : (req.body.isNational ?? req.body.is_national ?? false);

    const payload = {
      ...req.body,
      institutionId,
      isNational,
    };

    const data = await holidayService.create(payload, req.user);
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

    const current = await holidayService.getById(req.params.id);

    // Cegah Admin Sekolah mengubah libur nasional / umum
    if ((current.isNational || !current.institutionId) && req.user?.institutionId) {
      return response.error(res, 'Hari libur nasional / umum hanya dapat diubah oleh Admin Yayasan / Superadmin', 403);
    }

    // Cegah Admin Sekolah mengubah libur milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk mengubah hari libur institusi lain', 403);
    }

    const institutionId = resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id);
    const isNational = req.user?.institutionId ? false : (req.body.isNational ?? req.body.is_national ?? false);

    const payload = {
      ...req.body,
      institutionId,
      isNational,
    };

    const data = await holidayService.update(req.params.id, payload, req.user);
    return response.success(res, data, 'Hari libur berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/holiday/:id */
exports.destroy = async (req, res, next) => {
  try {
    const current = await holidayService.getById(req.params.id);

    // Cegah Admin Sekolah menghapus libur nasional / umum
    if ((current.isNational || !current.institutionId) && req.user?.institutionId) {
      return response.error(res, 'Hari libur nasional / umum hanya dapat dihapus oleh Admin Yayasan / Superadmin', 403);
    }

    // Cegah Admin Sekolah menghapus libur milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk menghapus hari libur institusi lain', 403);
    }

    await holidayService.remove(req.params.id);
    return response.success(res, null, 'Hari libur berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

