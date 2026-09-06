const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const userService = require('../services/user.service');
const response = require('../helpers/response.helper');

/** GET /v1/user */
exports.index = async (req, res, next) => {
  try {
    const result = await userService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** GET /v1/user/all */
exports.all = async (req, res, next) => {
  try {
    const data = await userService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/user/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await userService.getById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/user */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama wajib diisi').isLength({ max: 255 }),
      body('username').notEmpty().withMessage('Username wajib diisi').isLength({ max: 100 }),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
      body('password').notEmpty().withMessage('Password wajib diisi').isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
      body('roleId').notEmpty().withMessage('Role ID wajib diisi'),
    ]);

    const data = await userService.create(req.body, req.user);
    return response.success(res, data, 'User berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/user/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama wajib diisi').isLength({ max: 255 }),
      body('username').notEmpty().withMessage('Username wajib diisi').isLength({ max: 100 }),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
      body('password').optional({ nullable: true }).isLength({ min: 6 }).withMessage('Password minimal 6 karakter'),
      body('roleId').notEmpty().withMessage('Role ID wajib diisi'),
    ]);

    const data = await userService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'User berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/user/:id */
exports.destroy = async (req, res, next) => {
  try {
    await userService.remove(req.params.id);
    return response.success(res, null, 'User berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** PUT /v1/user/active-status/:id */
exports.updateActiveStatus = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('active').isBoolean().withMessage('active harus boolean'),
    ]);

    const { active } = req.body;
    const data = await userService.updateActiveStatus(req.params.id, active);
    return response.success(res, data, 'Status aktif berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/user/fcm-token/:id */
exports.updateFcmToken = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('device').isIn(['MOBILE', 'WEB']).withMessage('device harus MOBILE atau WEB'),
      body('fcmToken').notEmpty().withMessage('fcmToken wajib diisi'),
    ]);

    const { device, fcmToken } = req.body;
    const data = await userService.updateFcmToken(req.params.id, device, fcmToken);
    return response.success(res, data, 'FCM token berhasil diperbarui');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** GET /v1/user/profile/:id */
exports.getProfile = async (req, res, next) => {
  try {
    const userId = req.params.id || req.user?.id;
    const data = await userService.getProfile(userId);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** PUT /v1/user/profile/:id */
exports.updateProfile = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama wajib diisi').isLength({ min: 3 }),
      body('username').notEmpty().withMessage('Username wajib diisi').isLength({ min: 3 }),
      body('email').notEmpty().withMessage('Email wajib diisi').isEmail().withMessage('Format email tidak valid'),
    ]);

    const userId = req.params.id || req.user?.id;
    const data = await userService.updateProfile(userId, req.body, req.user);
    return response.success(res, data, 'Profil berhasil diperbarui');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** POST /v1/user/update-foto */
exports.updatePhoto = async (req, res, next) => {
  try {
    const userId = req.body.id || req.user?.id;
    const data = await userService.updatePhoto(req.file, userId, req.user);
    return response.success(res, data, 'Foto profil berhasil diperbarui');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};
