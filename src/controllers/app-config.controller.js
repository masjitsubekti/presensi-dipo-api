const appConfigService = require('../services/app-config.service');
const response = require('../helpers/response.helper');

/** GET /v1/app-config/public/:id & GET /api/app-config/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await appConfigService.getById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};

/** PUT /v1/app-config/:id */
exports.update = async (req, res, next) => {
  try {
    const data = await appConfigService.update(req.params.id, req.body);
    return response.success(res, data, 'App config berhasil diubah');
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
