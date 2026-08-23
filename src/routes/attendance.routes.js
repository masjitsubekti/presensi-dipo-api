const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const ctrl = require('../controllers/attendance.controller');

// All attendance routes require authentication
router.use(authenticate);

// GET — data retrieval
router.get('/today', ctrl.getToday);
router.get('/locations', ctrl.getLocations);
router.get('/history', ctrl.getHistory);
router.get('/logs', ctrl.getLogs);

// POST — presensi actions (multipart/form-data)
router.post('/check-in', ctrl.checkIn);
router.post('/check-out', ctrl.checkOut);

module.exports = router;
