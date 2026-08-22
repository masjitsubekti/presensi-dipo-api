const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const personController = require('../controllers/person.controller');

router.use(authenticate);

router.get('/all', personController.all);
router.get('/', personController.index);
router.post('/', personController.store);
router.get('/:id', personController.show);
router.put('/:id', personController.update);
router.delete('/:id', personController.destroy);

module.exports = router;
