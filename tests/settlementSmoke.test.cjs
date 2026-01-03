/* eslint-disable no-console */
// Vitest runs this as a CommonJS test using globals (see vitest.config.js).

process.env.TREASURY_TESTNET_ADDRESS =
  process.env.TREASURY_TESTNET_ADDRESS || '0x282b64c7c10c06c45f1ff3b62368940ace5b5958';

const gameController = require('../controllers/gameController.cjs');
const {
  settleGameOffchain,
  setWalletService,
  setPrismaClient,
  setSettlementIo,
} = gameController.__testing;

describe('settleGameOffchain (smoke)', () => {
  it('pays winner + treasury and returns split amounts', async () => {
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

    expect(addWinningsCalls).toHaveLength(2);
    expect(addWinningsCalls[0].address).toBe('0x1111111111111111111111111111111111111111');
    expect(addWinningsCalls[0].amount).toBe(900n);

    expect(addWinningsCalls[1].address.toLowerCase()).toBe(
      process.env.TREASURY_TESTNET_ADDRESS.toLowerCase(),
    );
    expect(addWinningsCalls[1].amount).toBe(100n);

    expect(result).toEqual({ winnerAmount: '900', fee: '100' });
  });
});
