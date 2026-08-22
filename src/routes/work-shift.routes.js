const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const workShiftController = require('../controllers/work-shift.controller');

router.use(authenticate);

router.get('/all', workShiftController.all);
router.get('/', workShiftController.index);
router.post('/', workShiftController.store);
router.get('/:id', workShiftController.show);
router.put('/:id', workShiftController.update);
router.delete('/:id', workShiftController.destroy);

module.exports = router;
