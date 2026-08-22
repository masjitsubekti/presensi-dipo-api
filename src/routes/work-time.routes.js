const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const workTimeController = require('../controllers/work-time.controller');

router.use(authenticate);

router.get('/all', workTimeController.all);
router.get('/', workTimeController.index);
router.post('/', workTimeController.store);
router.get('/:id', workTimeController.show);
router.put('/:id', workTimeController.update);
router.delete('/:id', workTimeController.destroy);

module.exports = router;
