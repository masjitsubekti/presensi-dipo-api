const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const authService = require('../services/auth.service');
const response = require('../helpers/response.helper');

/** POST /v1/auth/login */
exports.login = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('username').notEmpty().withMessage('Username wajib diisi'),
      body('password').notEmpty().withMessage('Password wajib diisi'),
    ]);

    const { username, password } = req.body;
    const result = await authService.login(username, password);
    return response.success(res, result, 'Login berhasil');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** POST /v1/auth/logout */
exports.logout = (req, res) => {
  return response.success(res, null, 'Logout berhasil');
};

/** GET /v1/auth/me */
exports.me = async (req, res, next) => {
  try {
    const data = await authService.me(req.user.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** PUT /v1/auth/change-password */
exports.changePassword = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('oldPassword').notEmpty().withMessage('Password lama wajib diisi'),
      body('newPassword')
        .notEmpty().withMessage('Password baru wajib diisi')
        .isLength({ min: 6 }).withMessage('Password baru minimal 6 karakter'),
    ]);

    const targetUserId = req.params.id || req.user?.id;
    const { oldPassword, newPassword } = req.body;
    await authService.changePassword(targetUserId, oldPassword, newPassword);
    return response.success(res, null, 'Password berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** POST /v1/auth/forgot-password */
exports.forgotPassword = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('email').isEmail().withMessage('Format email tidak valid'),
    ]);

    const { email } = req.body;
    const token = await authService.forgotPassword(email);
    return response.success(res, { token }, 'Token reset password berhasil dibuat');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** POST /v1/auth/reset-password */
exports.resetPassword = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('token').notEmpty().withMessage('Token wajib diisi'),
      body('newPassword')
        .notEmpty().withMessage('Password baru wajib diisi')
        .isLength({ min: 6 }).withMessage('Password baru minimal 6 karakter'),
    ]);

    const { token, newPassword } = req.body;
    await authService.resetPassword(token, newPassword);
    return response.success(res, null, 'Password berhasil direset');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};
