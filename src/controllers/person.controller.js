const { body } = require('express-validator');
const { validateRequest } = require('../helpers/validator.helper');
const personService = require('../services/person.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/person */
exports.index = async (req, res, next) => {
  try {
    const result = await personService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/person/all */
exports.all = async (req, res, next) => {
  try {
    const data = await personService.getAll(req.query);
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/person/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await personService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** POST /v1/master/person */
exports.store = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama person wajib diisi'),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
    ]);

    const data = await personService.create(req.body, req.user);
    return response.success(res, data, 'Person berhasil dibuat', 201);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** PUT /v1/master/person/:id */
exports.update = async (req, res, next) => {
  try {
    await validateRequest(req, [
      body('name').notEmpty().withMessage('Nama person wajib diisi'),
      body('email').optional({ nullable: true }).isEmail().withMessage('Format email tidak valid'),
    ]);

    const data = await personService.update(req.params.id, req.body, req.user);
    return response.success(res, data, 'Person berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status, err.errors);
    next(err);
  }
};

/** DELETE /v1/master/person/:id */
exports.destroy = async (req, res, next) => {
  try {
    await personService.remove(req.params.id);
    return response.success(res, null, 'Person berhasil dihapus');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
