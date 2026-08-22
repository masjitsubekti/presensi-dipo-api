/**
 * Global Error Handler Middleware
 * Must have 4 parameters (err, req, res, next) for Express to recognize as error handler
 */
const errorHandler = (err, req, res, next) => {
  // Log error in development
  if (process.env.NODE_ENV === 'development') {
    console.error('[ERROR]', err);
  } else {
    console.error('[ERROR]', err.message);
  }

  // Prisma known request errors
  if (err.code) {
    switch (err.code) {
      case 'P2002':
        // Unique constraint violation
        return res.status(409).json({
          success: false,
          error: 'Data sudah ada, duplikat tidak diizinkan',
          field: err.meta?.target ?? null,
        });

      case 'P2025':
        // Record not found
        return res.status(404).json({
          success: false,
          error: 'Data tidak ditemukan',
        });

      case 'P2003':
        // Foreign key constraint failed
        return res.status(400).json({
          success: false,
          error: 'Referensi data tidak valid (foreign key)',
        });

      default:
        break;
    }
  }

  // HTTP errors (from http-errors package)
  if (err.status) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
    });
  }

  // Validation errors (express-validator bubbled up)
  if (err.type === 'validation') {
    return res.status(422).json({
      success: false,
      error: 'Validasi gagal',
      errors: err.errors,
    });
  }

  // CORS errors
  if (err.message && err.message.includes('not allowed by CORS')) {
    return res.status(403).json({
      success: false,
      error: err.message,
    });
  }

  // Generic server error
  return res.status(500).json({
    success: false,
    // error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    error: err.message,
  });
};

module.exports = errorHandler;
