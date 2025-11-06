// services/blockchainListener.cjs
const { ethers } = require('ethers');
const prisma = require('../generated/prisma');

/**
 * Blockchain event listener (V1-style)
 * - Listens to GameFinished & TournamentConcluded
 * - Uses SCRABBLE_GAME_ADDRESS (from env)
 * - Attaches provider error handling in an ethers-v6-compatible way
 */

const CONTRACT_ADDRESS = process.env.SCRABBLE_GAME_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';

let provider = null;
let contract = null;
let reconnectAttempts = 0;
const MAX_RECONNECTS = Number(process.env.LISTENER_MAX_RECONNECTS || 5);
const RECONNECT_DELAY_MS = Number(process.env.LISTENER_RECONNECT_DELAY_MS || 30000);

const ABI = [
  'event GameFinished(uint256 indexed gameId, uint256 winnerId, address winnerAddress, uint256 finalScore)',
  'event TournamentConcluded(uint256 indexed tournamentId, uint256 winnerId, address winnerAddress, uint256 prizeAmount)',
];

async function initContract() {
  try {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    console.log(`Connected to contract at ${CONTRACT_ADDRESS}`);
    return true;
  } catch (err) {
    console.error('Failed to initialize contract:', err.message || err);
    return false;
  }
}

async function handleGameFinished(gameId, winnerId, winnerAddress, finalScore, event) {
  try {
    await prisma.games.update({
      where: { id: Number(gameId) },
      data: {
        winner: 'player1', // keep your placeholder mapping for now
        player1Score: Number(finalScore),
        blockchainSubmitted: true,
        submissionTxHash: event.transactionHash,
        submissionBlockNumber: BigInt(event.blockNumber),
        updatedAt: new Date(),
      },
    });
    console.log(`Game ${gameId} synced to DB`);
  } catch (err) {
    console.error(`DB update failed for game ${gameId}:`, err.message);
  }
}

async function handleTournamentConcluded(tournamentId, winnerId, winnerAddress, prizeAmount, event) {
  try {
    await prisma.tournaments.update({
      where: { id: Number(tournamentId) },
      data: { winnerId: Number(winnerId), status: 'completed', updatedAt: new Date() },
    });

    await prisma.users.update({
      where: { id: Number(winnerId) },
      data: { gamesWon: { increment: 1 }, totalScore: { increment: Number(prizeAmount || 0) }, updatedAt: new Date() },
    });

    console.log(`Tournament ${tournamentId} updated`);
  } catch (err) {
    console.error(`Failed to update tournament ${tournamentId}:`, err.message);
  }
}

async function startListening() {
  try {
    console.log('Initializing blockchain listener...');

    if (!CONTRACT_ADDRESS) {
      console.warn('SCRABBLE_GAME_ADDRESS not configured — skipping listener start');
      return;
    }

    const ok = await initContract();
    if (!ok) throw new Error('Contract initialization failed');

    // avoid duplicate listeners
    contract.removeAllListeners();

    // HTTP-friendly event polling (no filters)
    console.log("Starting HTTP polling for events...");

    setInterval(async () => {
      try {
        const latestBlock = await provider.getBlockNumber();

        const gameEvents = await contract.queryFilter('GameFinished', latestBlock - 100, latestBlock);
        for (const e of gameEvents) await handleGameFinished(...e.args, e);

        const tourEvents = await contract.queryFilter('TournamentConcluded', latestBlock - 100, latestBlock);
        for (const e of tourEvents) await handleTournamentConcluded(...e.args, e);

      } catch (err) {
        console.error('Polling error:', err.message);
      }
    }, 15000);

    // provider error handling — ethers v6: 'close' is not a valid Provider event name on provider
    provider.on('error', (err) => {
      console.error('Provider error:', err && err.message ? err.message : err);
      scheduleReconnect();
    });

    // if underlying websocket exists (some providers expose it), listen for close
    if (provider._websocket && typeof provider._websocket.on === 'function') {
      provider._websocket.on('close', (code, reason) => {
        console.warn('Provider websocket closed:', code, reason);
        scheduleReconnect();
      });
    }

    reconnectAttempts = 0;
    console.log('Blockchain listener active and watching contract events');
  } catch (err) {
    console.error('Listener startup failed:', err.message || err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECTS) {
    console.error('Max reconnect attempts reached. Listener stopped.');
    return;
  }
  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * reconnectAttempts;
  console.log(`Reconnect attempt ${reconnectAttempts} scheduled in ${delay / 1000}s`);
  setTimeout(async () => {
    await startListening();
  }, delay);
}

// graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down blockchain listener...');
  try {
    if (contract) contract.removeAllListeners();
    if (provider && provider.removeAllListeners) provider.removeAllListeners();
  } catch (err) {
    // ignore
  }
  process.exit(0);
});

module.exports = { startListening };