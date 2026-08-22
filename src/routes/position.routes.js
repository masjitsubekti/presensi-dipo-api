const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const positionController = require('../controllers/position.controller');

router.use(authenticate);

router.get('/all', positionController.all);
router.get('/', positionController.index);
router.post('/', positionController.store);
router.get('/:id', positionController.show);
router.put('/:id', positionController.update);
router.delete('/:id', positionController.destroy);

module.exports = router;
