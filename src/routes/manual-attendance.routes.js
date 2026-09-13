const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const manualAttendanceController = require('../controllers/manual-attendance.controller');

router.use(authenticate);

router.get('/', manualAttendanceController.index);
router.post('/', manualAttendanceController.store);
router.post('/bulk-delete', manualAttendanceController.bulkDestroy);
router.get('/:id', manualAttendanceController.show);
router.get('/:id/logs', manualAttendanceController.logs);
router.put('/:id', manualAttendanceController.update);
router.delete('/:id', manualAttendanceController.destroy);

module.exports = router;
