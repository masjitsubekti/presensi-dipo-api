const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const workShiftPatternController = require('../controllers/work-shift-pattern.controller');

router.use(authenticate);

router.get('/all', workShiftPatternController.all);
router.get('/', workShiftPatternController.index);
router.post('/', workShiftPatternController.store);
router.get('/:id', workShiftPatternController.show);
router.put('/:id', workShiftPatternController.update);
router.delete('/:id', workShiftPatternController.destroy);

module.exports = router;
