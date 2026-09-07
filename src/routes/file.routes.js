const router = require('express').Router();
const fileController = require('../controllers/file.controller');

// GET /api/v1/files?path={filePath}
router.get('/', fileController.getFile);

module.exports = router;
