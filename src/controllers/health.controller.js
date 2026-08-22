const response = require('../helpers/response.helper');

/**
 * Health Controller
 */
exports.check = (req, res) => {
  return res.status(200).json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: process.env.APP_NAME || 'School Management API',
    env: process.env.NODE_ENV || 'development',
  });
};
