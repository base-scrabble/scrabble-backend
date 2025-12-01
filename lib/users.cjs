const { prisma } = require('./prisma.cjs');
const logger = require('./logger.cjs');

function normalizeUserFields({ username, email, address, meta = {} }) {
  return {
    username: username ? String(username).trim() : undefined,
    email: email ? String(email).trim().toLowerCase() : undefined,
    address: address ? String(address).trim() : undefined,
    meta: meta || {},
  };
}

async function ensureUser({ username, email, address, meta = {} } = {}) {
  const fields = normalizeUserFields({ username, email, address, meta });
  try {
    if (fields.address) {
      return await prisma.users.upsert({
        where: { address: fields.address },
        update: { username: fields.username, email: fields.email, meta: fields.meta },
        create: { username: fields.username, email: fields.email, address: fields.address, meta: fields.meta },
      });
    }
    if (fields.username) {
      return await prisma.users.upsert({
        where: { username: fields.username },
        update: { email: fields.email, address: fields.address, meta: fields.meta },
        create: { username: fields.username, email: fields.email, address: fields.address, meta: fields.meta },
      });
    }
    if (fields.email) {
      return await prisma.users.upsert({
        where: { email: fields.email },
        update: { username: fields.username, address: fields.address, meta: fields.meta },
        create: { username: fields.username, email: fields.email, address: fields.address, meta: fields.meta },
      });
    }
    throw new Error('ensureUser: missing identifying field (address|username|email)');
  } catch (err) {
    if (err?.code === 'P2002' || /Unique constraint failed/.test(err?.message || '')) {
      logger.warn('ensureUser: upsert race, falling back to findUnique', { err: err.message, username, email, address });
      if (fields.address) {
        const found = await prisma.users.findUnique({ where: { address: fields.address } });
        if (found) return found;
      }
      if (fields.username) {
        const found = await prisma.users.findUnique({ where: { username: fields.username } });
        if (found) return found;
      }
      if (fields.email) {
        const found = await prisma.users.findUnique({ where: { email: fields.email } });
        if (found) return found;
      }
    }
    throw err;
  }
}

async function updateUser({ id, username, email, address, meta = {}, ...rest } = {}) {
  const fields = normalizeUserFields({ username, email, address, meta });
  if (!id) throw new Error('updateUser: missing user id');
  try {
    return await prisma.users.update({
      where: { id },
      data: { ...fields, ...rest },
    });
  } catch (err) {
    logger.error('updateUser: failed', { err: err.message, id, username, email, address });
    throw err;
  }
}

module.exports = { ensureUser, updateUser, normalizeUserFields };
