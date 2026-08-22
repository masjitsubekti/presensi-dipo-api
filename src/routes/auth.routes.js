const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const authController = require('../controllers/auth.controller');

// ==================== Public Routes ====================
router.post('/login', authController.login);
router.post('/login-web', authController.login);
router.post('/validasi-login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// ==================== Protected Routes ====================
router.use(authenticate);

router.post('/logout', authController.logout);
router.get('/me', authController.me);
router.put('/change-password', authController.changePassword);

module.exports = router;
