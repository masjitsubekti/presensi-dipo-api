const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const departmentController = require('../controllers/department.controller');

router.use(authenticate);

router.get('/all', departmentController.all);
router.get('/', departmentController.index);
router.post('/', departmentController.store);
router.get('/:id', departmentController.show);
router.put('/:id', departmentController.update);
router.delete('/:id', departmentController.destroy);

module.exports = router;
