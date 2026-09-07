const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

// Dashboard endpoints
router.get('/executive-summary', authenticate, dashboardController.getExecutiveSummary);
router.get('/top-late-employees', authenticate, dashboardController.getTopLateEmployees);

module.exports = router;
