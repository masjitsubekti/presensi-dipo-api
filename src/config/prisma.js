require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

/**
 * Fix JSON.stringify for BigInt values returned by MySQL driver / Prisma Raw queries
 */
BigInt.prototype.toJSON = function () {
  return Number(this);
};

/**
 * Prisma Client Singleton
 * Prevents multiple instances in development (hot-reload)
 */
const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
