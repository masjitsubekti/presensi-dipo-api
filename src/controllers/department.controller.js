const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const departmentService = require('../services/department.service');
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


/** GET /v1/master/department */
exports.index = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const result = await departmentService.resolveAll(params);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/department/all */
exports.all = async (req, res, next) => {
  try {
    const params = {
      ...req.query,
      institutionId: resolveInstitutionId(req.user, req.query.institutionId ?? req.query.institution_id),
    };
    const data = await departmentService.getAll(params);
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

    const payload = {
      ...req.body,
      institutionId: resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id),
    };

    const data = await departmentService.create(payload, req.user);
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

    const current = await departmentService.getById(req.params.id);

    // Cegah Admin Sekolah mengubah data Global
    if (!current.institutionId && req.user?.institutionId) {
      return response.error(res, 'Departemen global hanya dapat diubah oleh Admin Yayasan / Superadmin', 403);
    }

    // Cegah Admin Sekolah mengubah data milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk mengubah departemen institusi lain', 403);
    }

    const payload = {
      ...req.body,
      institutionId: resolveInstitutionId(req.user, req.body.institutionId ?? req.body.institution_id),
    };

    const data = await departmentService.update(req.params.id, payload, req.user);
    return response.success(res, data, 'Departemen berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/department/:id */
exports.destroy = async (req, res, next) => {
  try {
    const current = await departmentService.getById(req.params.id);

    // Cegah Admin Sekolah menghapus data Global
    if (!current.institutionId && req.user?.institutionId) {
      return response.error(res, 'Departemen global hanya dapat dihapus oleh Admin Yayasan / Superadmin', 403);
    }

    // Cegah Admin Sekolah menghapus data milik sekolah lain
    if (current.institutionId && req.user?.institutionId && Number(current.institutionId) !== Number(req.user.institutionId)) {
      return response.error(res, 'Anda tidak memiliki hak akses untuk menghapus departemen institusi lain', 403);
    }

    await departmentService.remove(req.params.id);
    return response.success(res, null, 'Departemen berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
