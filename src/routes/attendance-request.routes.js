const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const attendanceRequestController = require('../controllers/attendance-request.controller');

router.use(authenticate);

router.get('/', attendanceRequestController.index);
router.post('/', attendanceRequestController.store);
router.get('/:id', attendanceRequestController.show);
router.put('/:id', attendanceRequestController.update);
router.put('/:id/status', attendanceRequestController.updateStatus);
router.patch('/:id/status', attendanceRequestController.updateStatus);
router.delete('/:id', attendanceRequestController.destroy);

module.exports = router;
