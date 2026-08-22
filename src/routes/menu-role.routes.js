const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const menuController = require('../controllers/menu.controller');

router.use(authenticate);

// GET /api/menu-role?roleId=...
router.get('/', menuController.getByRole);

// GET /api/menu-role/trx?roleId=...
router.get('/trx', menuController.getByRoleTrx);

// POST /api/menu-role/bulk
router.post('/bulk', menuController.bulkAssignRole);

// PUT /api/menu-role/update-permission
router.put('/update-permission', menuController.bulkAssignRole);

module.exports = router;
