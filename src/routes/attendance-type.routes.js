const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const attendanceTypeController = require('../controllers/attendance-type.controller');

router.use(authenticate);

router.get('/all', attendanceTypeController.all);
router.get('/', attendanceTypeController.index);
router.post('/', attendanceTypeController.store);
router.get('/:id', attendanceTypeController.show);
router.put('/:id', attendanceTypeController.update);
router.delete('/:id', attendanceTypeController.destroy);

module.exports = router;
