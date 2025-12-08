// lib/prisma.cjs

const { PrismaClient } = require('../generated/prisma');
const { PrismaPg } = require('@prisma/adapter-pg');

let prisma;


if (!global.__prisma) {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  prisma = new PrismaClient({ adapter, log: ['query', 'info', 'warn', 'error'] });
  global.__prisma = prisma;
} else {
  prisma = global.__prisma;
}

module.exports = { prisma };