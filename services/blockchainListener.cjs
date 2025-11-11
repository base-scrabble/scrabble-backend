// services/blockchainListener.cjs
// Updated: remove unsupported provider.on('close') for ethers v6
// and use safe websocket close detection. Keeps WebSocket + polling fallback.

const { ethers } = require('ethers');
const prisma = require('../generated/prisma');

const CONTRACT_ADDRESS = process.env.SCRABBLE_GAME_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const RPC_WSS_URL = process.env.RPC_WSS_URL; // [added]

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
    // Prefer WSS provider if available
    if (RPC_WSS_URL) {
      provider = new ethers.WebSocketProvider(RPC_WSS_URL); // [updated]
      console.log('🔌 Using WebSocket provider (RPC_WSS_URL)');
    } else {
      provider = new ethers.JsonRpcProvider(RPC_URL);
      console.log('🔌 Using HTTP provider (RPC_URL)');
    }

    contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    console.log(`✅ Connected to contract at ${CONTRACT_ADDRESS}`);
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
        winner: 'player1',
        player1Score: Number(finalScore),
        blockchainSubmitted: true,
        submissionTxHash: event.transactionHash,
        submissionBlockNumber: BigInt(event.blockNumber),
        updatedAt: new Date(),
      },
    });
    console.log(`✅ Game ${gameId} synced to DB`);
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

    console.log(`🏆 Tournament ${tournamentId} updated`);
  } catch (err) {
    console.error(`Failed to update tournament ${tournamentId}:`, err.message);
  }
}

async function startListening() {
  try {
    console.log('🚀 Initializing blockchain listener...');

    if (!CONTRACT_ADDRESS) {
      console.warn('SCRABBLE_GAME_ADDRESS not configured — skipping listener start');
      return;
    }

    const ok = await initContract();
    if (!ok) throw new Error('Contract initialization failed');

    contract.removeAllListeners();

    if (provider instanceof ethers.WebSocketProvider) {
      console.log('🔐 Using live WebSocket event subscription');
      contract.on('GameFinished', handleGameFinished);
      contract.on('TournamentConcluded', handleTournamentConcluded);
    } else {
      console.log('🔁 Starting HTTP polling for events...');
      setInterval(async () => {
        try {
          const latestBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, latestBlock - 100);
          const gameEvents = await contract.queryFilter('GameFinished', fromBlock, latestBlock);
          for (const e of gameEvents) await handleGameFinished(...e.args, e);

          const tourEvents = await contract.queryFilter('TournamentConcluded', fromBlock, latestBlock);
          for (const e of tourEvents) await handleTournamentConcluded(...e.args, e);
        } catch (err) {
          console.error('Polling error:', err.message);
        }
      }, 15000);
    }

    // [REMOVED] provider.on('close', ...) — invalid in ethers v6
    // ✅ WebSocket close detection (safe)
    if (provider.websocket && typeof provider.websocket.on === 'function') { // [added]
      provider.websocket.on('close', (code, reason) => {
        console.warn('⚠️ WebSocket closed:', code, reason);
        scheduleReconnect();
      });
    }

    reconnectAttempts = 0;
    console.log('✅ Blockchain listener active and watching events');
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
  } catch (err) {}
  process.exit(0);
});

module.exports = { startListening };