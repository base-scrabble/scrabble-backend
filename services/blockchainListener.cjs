// services/blockchainListener.cjs
// Updated: remove unsupported provider.on('close') for ethers v6
// and use safe websocket close detection. Keeps WebSocket + polling fallback.

const { ethers } = require('ethers');
const { prisma } = require('../lib/prisma.cjs');

const CONTRACT_ADDRESS = process.env.SCRABBLE_GAME_ADDRESS;
// IMPORTANT: do not hardcode RPC endpoints (they often include secrets).
const RPC_URL = process.env.RPC_URL;
const RPC_WSS_URL = process.env.RPC_WSS_URL;

// Provide a static chain id to ethers providers to avoid noisy "failed to detect network" logs.
// Default to Base Sepolia (84532) since that's what this repo targets in dev.
const CHAIN_ID = Number(process.env.CHAIN_ID || process.env.LISTENER_CHAIN_ID || 84532);
const PROVIDER_NETWORK = Number.isFinite(CHAIN_ID) ? CHAIN_ID : undefined;

let preferWebSocket = true;

function wsEnabled() {
  if (process.env.LISTENER_FORCE_HTTP === 'true') return false;
  if (process.env.LISTENER_TRANSPORT === 'http') return false;
  return preferWebSocket;
}

let provider = null;
let contract = null;
let reconnectAttempts = 0;
const MAX_RECONNECTS = Number(process.env.LISTENER_MAX_RECONNECTS || 5);
const RECONNECT_DELAY_MS = Number(process.env.LISTENER_RECONNECT_DELAY_MS || 30000);
let reconnectTimer = null;

const ABI = [
  'event GameFinished(uint256 indexed gameId, uint256 winnerId, address winnerAddress, uint256 finalScore)',
  'event TournamentConcluded(uint256 indexed tournamentId, uint256 winnerId, address winnerAddress, uint256 prizeAmount)',
];

function buildProvider() {
  if (wsEnabled() && RPC_WSS_URL && RPC_WSS_URL.startsWith('wss')) {
    console.log('🔌 BlockchainListener using WebSocket provider (RPC_WSS_URL)');
    return PROVIDER_NETWORK
      ? new ethers.WebSocketProvider(RPC_WSS_URL, PROVIDER_NETWORK)
      : new ethers.WebSocketProvider(RPC_WSS_URL);
  }
  if (!RPC_URL) {
    throw new Error('RPC_URL not configured (set RPC_URL in backend env)');
  }
  console.log('🔌 BlockchainListener using HTTP provider (RPC_URL)');
  return PROVIDER_NETWORK
    ? new ethers.JsonRpcProvider(RPC_URL, PROVIDER_NETWORK)
    : new ethers.JsonRpcProvider(RPC_URL);
}

function getProviderWebSocket(p) {
  return p?.websocket || p?._websocket || p?._ws || null;
}

function attachWebSocketHandlers(p) {
  const ws = getProviderWebSocket(p);
  if (!ws || typeof ws.on !== 'function') return;

  // If the underlying socket errors and nobody is listening, Node can surface it as an uncaughtException.
  ws.on('error', (err) => {
    console.warn('⚠️ WebSocket error:', err?.message || err);
    // If the WS provider is flakey or blocked locally (TLS/proxy/provider issue),
    // fall back to HTTP polling for the rest of this process.
    preferWebSocket = false;
    try {
      ws.terminate?.();
    } catch (_) {}
    scheduleReconnect();
  });

  ws.on('close', (code, reason) => {
    console.warn('⚠️ WebSocket closed:', code, reason);
    preferWebSocket = false;
    scheduleReconnect();
  });
}

async function initContract() {
  try {
    provider = buildProvider();

    // Attach WS handlers immediately after provider creation to prevent early TLS/WebSocket errors
    // from taking down the whole Node process.
    if (provider instanceof ethers.WebSocketProvider) {
      attachWebSocketHandlers(provider);
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
      let pollingBackoffMs = 15_000;
      let consecutivePollErrors = 0;
      let lastPollErrorLogAt = 0;
      let pollStopped = false;

      const pollOnce = async () => {
        if (pollStopped) return;
        try {
          const latestBlock = await provider.getBlockNumber();
          const fromBlock = Math.max(0, latestBlock - 100);
          const gameEvents = await contract.queryFilter('GameFinished', fromBlock, latestBlock);
          for (const e of gameEvents) await handleGameFinished(...e.args, e);

          const tourEvents = await contract.queryFilter('TournamentConcluded', fromBlock, latestBlock);
          for (const e of tourEvents) await handleTournamentConcluded(...e.args, e);

          // Success: reset backoff.
          consecutivePollErrors = 0;
          pollingBackoffMs = 15_000;
        } catch (err) {
          consecutivePollErrors++;

          // Back off exponentially on transport/TLS issues.
          pollingBackoffMs = Math.min(300_000, pollingBackoffMs * 2);

          const now = Date.now();
          const shouldLog = now - lastPollErrorLogAt > 15_000;
          if (shouldLog) {
            lastPollErrorLogAt = now;
            console.error('Polling error:', err?.message || err);
            if (consecutivePollErrors >= 3) {
              console.warn(
                `Polling degraded (${consecutivePollErrors} consecutive failures). ` +
                `Next retry in ${Math.round(pollingBackoffMs / 1000)}s. ` +
                `Set LISTENER_FORCE_HTTP=true to skip WS, or disable listener for dev.`,
              );
            }
          }
        } finally {
          setTimeout(pollOnce, pollingBackoffMs);
        }
      };

      pollOnce();
      registerShutdownHandler();
    }

    // For WS providers, we already attach close/error handlers in initContract.

    reconnectAttempts = 0;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
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

  // Avoid scheduling multiple overlapping reconnects.
  if (reconnectTimer) return;

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * reconnectAttempts;
  console.log(`Reconnect attempt ${reconnectAttempts} scheduled in ${delay / 1000}s`);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
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