const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const manualAttendanceService = require('../services/manual-attendance.service');
const response = require('../helpers/response.helper');

/**
 * GET /v1/attendance-manual
 * Returns paginated manual attendance records with filters
 */
exports.index = async (req, res, next) => {
  try {
    const result = await manualAttendanceService.resolveAll(req.query, req.user?.id);
    return response.paginated(res, result);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /v1/attendance-manual/:id
 * Returns single attendance record details
 */
exports.show = async (req, res, next) => {
  try {
    const data = await manualAttendanceService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
/**
 * GET /v1/attendance-manual/:id/logs
 * Returns audit trail logs for specific attendance record
 */
exports.logs = async (req, res, next) => {
  try {
    const data = await manualAttendanceService.resolveLogsById(req.params.id);
    return response.success(res, data, 'Berhasil mengambil riwayat log presensi');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/**
 * POST /v1/attendance-manual
 * Create manual attendance / dispensation for single or multiple employees
 */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('attendanceDate')
        .optional()
        .matches(/^\d{4}-\d{2}-\d{2}$/)
        .withMessage('Format tanggal presensi tidak valid (YYYY-MM-DD)'),
    ]);

    const data = await manualAttendanceService.create(req.body, req.user);
    return response.success(res, data, 'Presensi manual berhasil disimpan', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/**
 * PUT /v1/attendance-manual/:id
 * Update single manual attendance record
 */
exports.update = async (req, res, next) => {
  try {
    const data = await manualAttendanceService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Data presensi berhasil diperbarui');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/**
 * DELETE /v1/attendance-manual/:id
 * Soft delete attendance record
 */
exports.destroy = async (req, res, next) => {
  try {
    await manualAttendanceService.remove(req.params.id, req.user);
    return response.success(res, null, 'Data presensi berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/**
 * POST /v1/attendance-manual/bulk-delete
 * Bulk delete attendance records
 */
exports.bulkDestroy = async (req, res, next) => {
  try {
    const ids = req.body.ids || [];
    const result = await manualAttendanceService.bulkRemove(ids, req.user);
    return response.success(res, result, `${result.count || 0} data presensi berhasil dihapus`);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
