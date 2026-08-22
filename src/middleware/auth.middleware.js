require('dotenv').config();
const jwt = require('jsonwebtoken');
const response = require('../helpers/response.helper');

/**
 * JWT Authentication Middleware
 * Verifies Bearer token from Authorization header
 * Attaches decoded payload to req.user
 */
const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
      return response.error(res, 'Authorization header tidak ditemukan', 401);
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
      return response.error(res, 'Format token tidak valid. Gunakan: Bearer <token>', 401);
    }

    const token = parts[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return response.error(res, 'Token sudah kedaluwarsa, silakan login ulang', 401);
    }
    if (err.name === 'JsonWebTokenError') {
      return response.error(res, 'Token tidak valid', 401);
    }
    next(err);
  }
};

module.exports = { authenticate };
