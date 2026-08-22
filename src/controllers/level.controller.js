const levelService = require('../services/level.service');
const response = require('../helpers/response.helper');

/** GET /v1/master/level */
exports.index = async (req, res, next) => {
  try {
    const result = await levelService.resolveAll(req.query);
    return response.paginated(res, result);
  } catch (err) { next(err); }
};

/** GET /v1/master/level/all */
exports.all = async (req, res, next) => {
  try {
    const data = await levelService.getAll();
    return response.success(res, data);
  } catch (err) { next(err); }
};

/** GET /v1/master/level/:id */
exports.show = async (req, res, next) => {
  try {
    const data = await levelService.resolveById(req.params.id);
    return response.success(res, data);
  } catch (err) {
    if (err.status) return response.error(res, err.message, err.status);
    next(err);
  }
};
