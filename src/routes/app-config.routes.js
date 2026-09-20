const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { upload } = require('../middleware/upload.middleware');
const appConfigController = require('../controllers/app-config.controller');

// Public: GET /api/app-config/public/:id
router.get('/public/:id', appConfigController.show);

// Protected
router.get('/:id', authenticate, appConfigController.show);
router.put('/:id', authenticate, appConfigController.update);
router.post('/upload', authenticate, upload.single('file'), appConfigController.uploadLogo);

module.exports = router;
