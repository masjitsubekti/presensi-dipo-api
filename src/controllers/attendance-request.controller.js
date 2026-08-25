const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const { createUpload, uploadFile } = require('../middleware/upload.middleware');
const attendanceRequestService = require('../services/attendance-request.service');
const response = require('../helpers/response.helper');
const storage = require('../storage/storage.service');

const requestUpload = createUpload({ maxSizeMb: 5 });

/** GET /v1/attendance-request */
exports.index = async (req, res, next) => {
  try {
    const result = await attendanceRequestService.resolveAll(req.query, req.user?.id);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/attendance-request/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await attendanceRequestService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/attendance-request */
exports.store = [
  requestUpload.single('file'),
  async (req, res, next) => {
    try {
      if (req.file) {
        req.body.filePath = await storage.save(
          req.file.buffer,
          req.file.mimetype,
          'leaves',
          req.file.originalname
        );
      }

      const data = await attendanceRequestService.create(req.body, req.user);
      return response.success(res, data, 'Pengajuan izin berhasil dibuat', 201);
    } catch (err) {
      if (err.status) return response.error(res, err.message, err.status, err.errors);
      next(err);
    }
  },
];

/** PUT /v1/attendance-request/:id */
exports.update = [
  requestUpload.single('file'),
  async (req, res, next) => {
    try {
      if (req.file) {
        req.body.filePath = await storage.save(
          req.file.buffer,
          req.file.mimetype,
          'leaves',
          req.file.originalname
        );
      }

      const data = await attendanceRequestService.update(req.params.id, req.body, req.user);
      return response.success(res, data, 'Pengajuan izin berhasil diubah');
    } catch (err) {
      if (err.status) return response.error(res, err.message, err.status, err.errors);
      next(err);
    }
  },
];

/** PUT /v1/attendance-request/:id/status */
exports.updateStatus = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('status').notEmpty().isIn(['pending', 'approved', 'rejected', 'cancelled']).withMessage('Status tidak valid'),
    ]);

    const approvalNote = req.body.approvalNote ?? req.body.approval_note ?? null;
    const data = await attendanceRequestService.updateStatus(req.params.id, req.body.status, req.user, approvalNote);
    return response.success(res, data, `Status pengajuan berhasil diubah menjadi ${req.body.status}`);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/attendance-request/:id */
exports.destroy = async (req, res, next) => {
  try {
    await attendanceRequestService.remove(req.params.id);
    return response.success(res, null, 'Pengajuan izin berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
