/**
 * Response Helper
 * Standardized API response format
 */

/**
 * Success response
 * @param {Object} res        - Express response object
 * @param {*}      data       - Response data
 * @param {string} message    - Success message
 * @param {number} statusCode - HTTP status code (default 200)
 */
const success = (res, data = null, message = 'success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

/**
 * Error response
 * @param {Object} res        - Express response object
 * @param {string} message    - Error message
 * @param {number} statusCode - HTTP status code (default 400)
 * @param {*}      errors     - Validation errors or details
 */
const error = (res, message = 'Error', statusCode = 400, errors = null) => {
  const body = {
    success: false,
    error: message,
  };

  if (errors) body.errors = errors;

  return res.status(statusCode).json(body);
};

/**
 * Paginated response
 * @param {Object} res          - Express response object
 * @param {Object} paginatedResult - Result from pagination.paginate()
 */
const paginated = (res, paginatedResult) => {
  return res.status(200).json({
    data: paginatedResult,
  });
};

/**
 * Not found response
 * @param {Object} res     - Express response object
 * @param {string} message - Not found message
 */
const notFound = (res, message = 'Data tidak ditemukan') => {
  return res.status(404).json({
    success: false,
    error: message,
  });
};

module.exports = {
  success,
  error,
  paginated,
  notFound,
};
