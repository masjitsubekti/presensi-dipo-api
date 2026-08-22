const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const roleController = require('../controllers/role.controller');

router.use(authenticate);

router.get('/all', roleController.all);
router.get('/', roleController.index);
router.post('/', roleController.store);
router.get('/:id', roleController.show);
router.put('/:id', roleController.update);
router.delete('/:id', roleController.destroy);

module.exports = router;
