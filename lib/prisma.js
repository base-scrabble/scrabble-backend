// lib/prisma.js
const { PrismaClient } = require('@prisma/client');

let prisma;
if (!global.__prisma) {
  prisma = new PrismaClient();
  global.__prisma = prisma;
} else {
  prisma = global.__prisma;
}

module.exports = prisma;