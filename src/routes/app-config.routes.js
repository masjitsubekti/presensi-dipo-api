const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const appConfigController = require('../controllers/app-config.controller');

// Public: GET /api/app-config/public/:id
router.get('/public/:id', appConfigController.show);

// Protected
router.get('/:id', authenticate, appConfigController.show);
router.put('/:id', authenticate, appConfigController.update);

module.exports = router;
