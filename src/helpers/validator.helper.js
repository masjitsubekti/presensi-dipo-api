const { validationResult } = require('express-validator');

/**
 * Run express-validator rules imperatively inside controller
 */
const validateRequest = async (req, rules = []) => {
  await Promise.all(rules.map((rule) => rule.run(req)));
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    throw {
      status: 422,
      message: errors.array()[0].msg,
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    };
  }
};

module.exports = { validateRequest };
