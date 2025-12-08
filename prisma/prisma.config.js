// prisma.config.js for Prisma 7.x
module.exports = {
  datasource: {
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL,
    },
  },
};
