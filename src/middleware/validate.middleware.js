const { validationResult } = require('express-validator');

/**
 * Validate Middleware
 * Run after express-validator chains to check for validation errors
 * Returns 422 if validation fails
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      error: 'Validasi gagal',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports = { validate };
