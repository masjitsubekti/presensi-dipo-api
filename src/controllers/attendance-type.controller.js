const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const attendanceTypeService = require('../services/attendance-type.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/attendance-type */
exports.index = async (req, res, next) => {
  try {
    const result = await attendanceTypeService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/attendance-type/all */
exports.all = async (req, res, next) => {
  try {
    const data = await attendanceTypeService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/attendance-type/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await attendanceTypeService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/attendance-type */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jenis presensi wajib diisi'),
      body('name').notEmpty().withMessage('Nama jenis presensi wajib diisi'),
      body('category').notEmpty().isIn(['attendance', 'leave', 'time_off', 'duty', 'absence']).withMessage('Kategori tidak valid (attendance, leave, time_off, duty, absence)'),
    ]);

    const data = await attendanceTypeService.create(req.body, req.user);
    return response.success(res, data, 'Jenis presensi berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/attendance-type/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('code').notEmpty().withMessage('Kode jenis presensi wajib diisi'),
      body('name').notEmpty().withMessage('Nama jenis presensi wajib diisi'),
      body('category').notEmpty().isIn(['attendance', 'leave', 'time_off', 'duty', 'absence']).withMessage('Kategori tidak valid (attendance, leave, time_off, duty, absence)'),
    ]);

    const data = await attendanceTypeService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Jenis presensi berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/attendance-type/:id */
exports.destroy = async (req, res, next) => {
  try {
    await attendanceTypeService.remove(req.params.id);
    return response.success(res, null, 'Jenis presensi berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
