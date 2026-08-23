const multer = require('multer');
const attendanceService = require('../services/attendance.service');
const response = require('../helpers/response.helper');
const {
  PHOTO_MAX_SIZE_MB,
  PHOTO_ALLOWED_TYPES,
} = require('../constants/attendance.constants');

// ==================== Multer Setup (memory storage) ====================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (PHOTO_ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Format foto tidak didukung. Gunakan: ${PHOTO_ALLOWED_TYPES.join(', ')}`));
    }
  },
});

// ==================== Handlers ====================

/**
 * GET /attendance/today
 * Returns today's attendance status + shift + location info
 */
const getToday = async (req, res, next) => {
  try {
    const data = await attendanceService.getTodayAttendance(req.user.id);
    return response.success(res, data, 'Berhasil memuat data presensi hari ini');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.data ?? null);
    next(err);
  }
};

/**
 * GET /attendance/locations
 * Returns active attendance locations for user's institution
 */
const getLocations = async (req, res, next) => {
  try {
    const data = await attendanceService.getActiveLocations(req.user.id);
    return response.success(res, data, 'Berhasil memuat lokasi presensi');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/**
 * GET /attendance/history
 * Returns paginated attendance history with filters
 */
const getHistory = async (req, res, next) => {
  try {
    const data = await attendanceService.getHistory(req.user.id, req.query);
    return response.success(res, data, 'Berhasil memuat riwayat presensi');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/**
 * GET /attendance/logs
 * Returns paginated attendance logs (audit trail)
 */
const getLogs = async (req, res, next) => {
  try {
    const data = await attendanceService.resolveAll(req.query, req.user?.id);
    return response.success(res, data, 'Berhasil memuat log presensi');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/**
 * POST /attendance/check-in
 * Content-Type: multipart/form-data
 * Fields: photo (file, optional if configured), latitude, longitude, attendance_location_id
 */
const checkIn = [
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const { latitude, longitude, attendance_location_id } = req.body;

      if (!latitude || !longitude) {
        return response.error(res, 'Koordinat GPS (latitude, longitude) wajib disertakan', 400);
      }

      const data = await attendanceService.checkIn(req.user.id, {
        photoBuffer: req.file ? req.file.buffer : null,
        photoMimeType: req.file ? req.file.mimetype : null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        attendanceLocationId: attendance_location_id || null,
        device: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      });

      return response.success(res, data, 'Check-in berhasil', 201);
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          message: err.message,
          code: err.code || null,
          data: err.data || null,
        });
      }
      next(err);
    }
  },
];

/**
 * POST /attendance/check-out
 * Content-Type: multipart/form-data
 * Fields: photo (file, optional if configured), latitude, longitude, attendance_location_id
 */
const checkOut = [
  upload.single('photo'),
  async (req, res, next) => {
    try {
      const { latitude, longitude, attendance_location_id } = req.body;

      if (!latitude || !longitude) {
        return response.error(res, 'Koordinat GPS (latitude, longitude) wajib disertakan', 400);
      }

      const data = await attendanceService.checkOut(req.user.id, {
        photoBuffer: req.file ? req.file.buffer : null,
        photoMimeType: req.file ? req.file.mimetype : null,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        attendanceLocationId: attendance_location_id || null,
        device: req.headers['user-agent'] || null,
        ipAddress: req.ip || req.headers['x-forwarded-for'] || null,
      });

      return response.success(res, data, 'Check-out berhasil');
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({
          success: false,
          message: err.message,
          code: err.code || null,
          data: err.data || null,
        });
      }
      next(err);
    }
  },
];

module.exports = { getToday, getLocations, getHistory, getLogs, checkIn, checkOut };
