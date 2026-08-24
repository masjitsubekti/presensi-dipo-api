require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

/**
 * Fix JSON.stringify for BigInt values returned by MySQL driver / Prisma Raw queries
 */
BigInt.prototype.toJSON = function () {
  return Number(this);
};

/**
 * Prisma Client Singleton & Connection Resiliency for Serverless (Vercel + Aiven)
 */
const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

// Always store singleton on global object to prevent multiple pool allocations in serverless (Vercel)
globalForPrisma.prisma = prisma;

/**
 * Auto-retry wrapper for Prisma Raw Queries when idle serverless connections are closed by Aiven/MySQL
 */
const isConnectionError = (error) => {
  const msg = error?.message || '';
  return (
    msg.includes('Server has closed the connection') ||
    msg.includes("Can't reach database server") ||
    msg.includes('Kind: Closed') ||
    msg.includes('Connection lost') ||
    msg.includes('PROTOCOL_CONNECTION_LOST')
  );
};

if (!prisma._hasRawQueryRetryWrapper) {
  prisma._hasRawQueryRetryWrapper = true;

  const originalQueryRawUnsafe = prisma.$queryRawUnsafe.bind(prisma);
  prisma.$queryRawUnsafe = async function (...args) {
    try {
      return await originalQueryRawUnsafe(...args);
    } catch (error) {
      if (isConnectionError(error)) {
        console.warn('⚠️ Stale DB connection detected in serverless function. Retrying query...');
        try {
          await prisma.$disconnect();
          await prisma.$connect();
        } catch (e) {
          // ignore reconnection error, proceed to retry
        }
        return await originalQueryRawUnsafe(...args);
      }
      throw error;
    }
  };

  const originalQueryRaw = prisma.$queryRaw.bind(prisma);
  prisma.$queryRaw = async function (...args) {
    try {
      return await originalQueryRaw(...args);
    } catch (error) {
      if (isConnectionError(error)) {
        console.warn('⚠️ Stale DB connection detected in serverless function. Retrying query...');
        try {
          await prisma.$disconnect();
          await prisma.$connect();
        } catch (e) {
          // ignore reconnection error, proceed to retry
        }
        return await originalQueryRaw(...args);
      }
      throw error;
    }
  };
}

module.exports = prisma;
