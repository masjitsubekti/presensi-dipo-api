const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const menuController = require('../controllers/menu.controller');

router.use(authenticate);

// Menu routes
router.get('/tree', menuController.tree);
router.get('/all', menuController.all);
router.get('/', menuController.index);
router.get('/:id', menuController.show);
router.post('/', menuController.store);
router.put('/:id', menuController.update);
router.delete('/:id', menuController.destroy);

module.exports = router;
