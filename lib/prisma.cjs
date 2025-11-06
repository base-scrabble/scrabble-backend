// lib/prisma.cjs
const { PrismaClient } = require('../generated/prisma');

let prisma;

if (!global.__prisma) {
  prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
  global.__prisma = prisma;
} else {
  prisma = global.__prisma;
}

module.exports = { prisma };