// services/blockchainListener.cjs
// Updated: remove unsupported provider.on('close') for ethers v6
// and use safe websocket close detection. Keeps WebSocket + polling fallback.

const { ethers } = require('ethers');
const prisma = require('../generated/prisma');

const CONTRACT_ADDRESS = process.env.SCRABBLE_GAME_ADDRESS;
const DEFAULT_HTTP_RPC = 'https://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/';
const DEFAULT_WSS_RPC = 'wss://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/';
const RPC_URL = process.env.RPC_URL || DEFAULT_HTTP_RPC;
const RPC_WSS_URL = process.env.RPC_WSS_URL || DEFAULT_WSS_RPC;

let provider = null;
let contract = null;
let reconnectAttempts = 0;
const MAX_RECONNECTS = Number(process.env.LISTENER_MAX_RECONNECTS || 5);
const RECONNECT_DELAY_MS = Number(process.env.LISTENER_RECONNECT_DELAY_MS || 30000);

const ABI = [
  'event GameFinished(uint256 indexed gameId, uint256 winnerId, address winnerAddress, uint256 finalScore)',
  'event TournamentConcluded(uint256 indexed tournamentId, uint256 winnerId, address winnerAddress, uint256 prizeAmount)',
];

function buildProvider() {
  if (RPC_WSS_URL && RPC_WSS_URL.startsWith('wss')) {
    console.log('🔌 BlockchainListener using WebSocket provider (RPC_WSS_URL)');
    return new ethers.WebSocketProvider(RPC_WSS_URL);
  }
  console.log('🔌 BlockchainListener using HTTP provider (RPC_URL)');
  return new ethers.JsonRpcProvider(RPC_URL);
}

async function initContract() {
  try {
    provider = buildProvider();

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

    const { updateUser } = require('../lib/users.cjs');
    await updateUser({
      id: Number(winnerId),
      gamesWon: { increment: 1 },
      totalScore: { increment: Number(prizeAmount || 0) },
      updatedAt: new Date(),
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
      registerShutdownHandler();
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
      registerShutdownHandler();
    }

    // [REMOVED] provider.on('close', ...) — invalid in ethers v6
    // ✅ WebSocket close detection (safe)
    const ws = provider?.websocket || provider?._websocket || provider?._ws;
    if (ws && typeof ws.on === 'function') {
      ws.on('close', (code, reason) => {
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

// graceful shutdown - only register if listener is actually running
function registerShutdownHandler() {
  process.on('SIGINT', async () => {
    console.log('\nShutting down blockchain listener...');
    try {
      if (contract) contract.removeAllListeners();
      if (provider && provider.removeAllListeners) provider.removeAllListeners();
      const ws = provider?.websocket || provider?._websocket || provider?._ws;
      ws?.terminate?.();
    } catch (err) {}
    process.exit(0);
  });
}

module.exports = { startListening };