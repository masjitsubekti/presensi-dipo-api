const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/employee-recap', authenticate, reportController.getEmployeeRecap);

module.exports = router;
