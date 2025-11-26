// services/wallet.cjs
// Minimal wallet service stub to keep gameplay routes from crashing when the
// real blockchain wallet service is unavailable in a given environment.

const logger = require('../lib/logger.cjs');

async function noop(method, payload = {}) {
  logger.warn('wallet:noop', { method, payload });
  return null;
}

module.exports = {
  async addWinnings(address, token, amount) {
    return noop('addWinnings', { address, token, amount });
  },
  async deductFunds(address, token, amount) {
    return noop('deductFunds', { address, token, amount });
  },
  async depositETH(address, amount) {
    return noop('depositETH', { address, amount });
  },
  async withdraw(address, token, amount) {
    return noop('withdraw', { address, token, amount });
  },
};
