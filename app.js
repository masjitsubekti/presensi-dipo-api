require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const createError = require('http-errors');
const path = require('path');

const corsOptions = require('./src/config/cors');
const apiRoutes = require('./src/routes/index');
const errorHandler = require('./src/middleware/error.middleware');

const app = express();

// ==================== CORS ====================
// Configured via CORS_ORIGINS in .env
app.use(cors(corsOptions));

// Handle OPTIONS preflight for all routes
app.options('*', cors(corsOptions));

// ==================== Request Parsing ====================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==================== Logging ====================
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ==================== Static Files ====================
app.use(express.static(path.join(__dirname, 'public')));

// ==================== API Routes ====================
app.use('/v1', apiRoutes);

// ==================== Root ====================
app.get('/', (req, res) => {
  res.json({
    success: true,
    app: process.env.APP_NAME || 'School Management API',
    version: '1.0.0',
    docs: '/v1/health',
  });
});

// ==================== 404 Handler ====================
app.use((req, res, next) => {
  next(createError(404, `Route tidak ditemukan: ${req.method} ${req.originalUrl}`));
});

// ==================== Global Error Handler ====================
app.use(errorHandler);

module.exports = app;
