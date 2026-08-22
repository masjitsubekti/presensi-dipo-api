const router = require('express').Router();
const healthController = require('../controllers/health.controller');

/** GET /health */
router.get('/', healthController.check);

module.exports = router;
