const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const locationController = require('../controllers/location.controller');

router.use(authenticate);

router.get('/all', locationController.all);
router.get('/', locationController.index);
router.post('/', locationController.store);
router.get('/:id', locationController.show);
router.put('/:id', locationController.update);
router.delete('/:id', locationController.destroy);

module.exports = router;
