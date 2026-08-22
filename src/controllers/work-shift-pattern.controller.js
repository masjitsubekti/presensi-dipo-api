const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const workShiftPatternService = require('../services/work-shift-pattern.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/work-shift-pattern */
exports.index = async (req, res, next) => {
  try {
    const result = await workShiftPatternService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift-pattern/all */
exports.all = async (req, res, next) => {
  try {
    const data = await workShiftPatternService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/work-shift-pattern/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await workShiftPatternService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/work-shift-pattern */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('effectiveFrom').notEmpty().withMessage('Tanggal Efektif (effectiveFrom) wajib diisi'),
    ]);

    const hasSingleShift = req.body.shiftId || req.body.shift_id;
    const hasBulkShift = (Array.isArray(req.body.shiftIds) && req.body.shiftIds.length > 0) ||
                          (Array.isArray(req.body.shift_ids) && req.body.shift_ids.length > 0);

    if (!hasSingleShift && !hasBulkShift) {
      return response.error(res, 'Shift (shiftId / shiftIds) wajib diisi', 400);
    }

    const hasSinglePerson = req.body.personId || req.body.person_id;
    const hasBulkPerson = (Array.isArray(req.body.personIds) && req.body.personIds.length > 0) ||
                          (Array.isArray(req.body.person_ids) && req.body.person_ids.length > 0);

    if (!hasSinglePerson && !hasBulkPerson) {
      return response.error(res, 'Pegawai (personId / personIds) wajib diisi', 400);
    }

    const data = await workShiftPatternService.create(req.body, req.user);
    return response.success(res, data, 'Penugasan Jam Kerja berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/work-shift-pattern/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('shiftId').notEmpty().withMessage('Shift (shiftId) wajib diisi'),
      body('effectiveFrom').notEmpty().withMessage('Tanggal Efektif (effectiveFrom) wajib diisi'),
    ]);

    if (!req.body.personId && !req.body.person_id) {
      return response.error(res, 'Pegawai (personId) wajib diisi', 400);
    }

    const data = await workShiftPatternService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Penugasan Jam Kerja berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/work-shift-pattern/:id */
exports.destroy = async (req, res, next) => {
  try {
    await workShiftPatternService.remove(req.params.id);
    return response.success(res, null, 'Penugasan Jam Kerja berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
