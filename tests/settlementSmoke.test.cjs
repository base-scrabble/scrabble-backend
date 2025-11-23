/* eslint-disable no-console */
const assert = require('assert');

process.env.TREASURY_TESTNET_ADDRESS =
  process.env.TREASURY_TESTNET_ADDRESS || '0x282b64c7c10c06c45f1ff3b62368940ace5b5958';

const gameController = require('../controllers/gameController.cjs');
const {
  settleGameOffchain,
  setWalletService,
  setPrismaClient,
  setSettlementIo,
} = gameController.__testing;

async function runSmokeTest() {
  const addWinningsCalls = [];
  setWalletService({
    async addWinnings(address, token, amount) {
      addWinningsCalls.push({ address, token, amount });
      return `mock-tx-${addWinningsCalls.length}`;
    },
  });

  setPrismaClient({
    games: {
      findUnique: async () => ({ totalPot: '1000' }),
      update: async () => ({ id: 42 }),
    },
  });

  setSettlementIo({
    to() {
      return {
        emit() {
          return null;
        },
      };
    },
  });

  const result = await settleGameOffchain({
    gameId: 42,
    totalPot: '1000',
    token: 'ETH',
    winner: '0x1111111111111111111111111111111111111111',
  });

  assert.strictEqual(addWinningsCalls.length, 2, 'Expected two wallet payouts');
  assert.strictEqual(
    addWinningsCalls[0].address,
    '0x1111111111111111111111111111111111111111',
    'Winner should receive first payout',
  );
  assert.strictEqual(addWinningsCalls[0].amount, 900n, 'Winner amount should be 90%');
  assert.strictEqual(
    addWinningsCalls[1].address.toLowerCase(),
    process.env.TREASURY_TESTNET_ADDRESS.toLowerCase(),
    'Treasury should receive fee',
  );
  assert.strictEqual(addWinningsCalls[1].amount, 100n, 'Fee should be 10%');
  assert.deepStrictEqual(result, { winnerAmount: '900', fee: '100' });

  console.log('✅ settlement smoke test passed');
}

runSmokeTest().catch((err) => {
  console.error('❌ settlement smoke test failed', err);
  process.exit(1);
});
