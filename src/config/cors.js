require('dotenv').config();

/**
 * CORS Configuration
 *
 * CORS_ORIGINS in .env can be:
 *  - "*"           → allow all origins
 *  - comma-separated list → allow specific origins
 *    e.g. "http://localhost:3000,http://localhost:5173"
 */

const rawOrigins = process.env.CORS_ORIGINS || '*';

let allowedOrigins;
let allowAll = false;

if (rawOrigins.trim() === '*') {
  allowAll = true;
} else {
  allowedOrigins = rawOrigins
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

const corsOptions = {
  origin: allowAll
    ? '*'
    : function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, Postman, server-to-server)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        return callback(
          new Error(
            `Origin "${origin}" not allowed by CORS policy. ` +
              `Allowed origins: ${allowedOrigins.join(', ')}`
          ),
          false
        );
      },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  credentials: true,
  optionsSuccessStatus: 200, // Some browsers (IE11) choke on 204
};

module.exports = corsOptions;
