const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const levelController = require('../controllers/level.controller');

router.use(authenticate);

router.get('/all', levelController.all);
router.get('/', levelController.index);
router.get('/:id', levelController.show);

module.exports = router;
