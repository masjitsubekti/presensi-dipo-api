const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const institutionController = require('../controllers/institution.controller');

router.use(authenticate);

router.get('/all', institutionController.all);
router.get('/', institutionController.index);
router.post('/', institutionController.store);
router.get('/:id', institutionController.show);
router.put('/:id', institutionController.update);
router.delete('/:id', institutionController.destroy);

module.exports = router;
