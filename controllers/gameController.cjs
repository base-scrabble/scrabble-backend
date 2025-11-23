// controllers/gameController.cjs

const { prisma } = require('../lib/prisma.cjs');
const logger = require('../lib/logger.cjs');
const { gameRoom, playerRoom } = require('../lib/rooms.cjs');
const {
  hydrateBoardState,
  serializeBoardState,
  fillRack,
  analyzeMove,
  removeLettersFromRack,
  shuffleBag,
} = require('../services/scrabbleEngine.cjs');
const { isValidWord } = require('../services/wordValidator.cjs');

let wallet;
try {
  wallet = require('../services/wallet.cjs');
} catch (err) {
  logger.warn('wallet:service-missing', { message: err.message });
  wallet = {
    async addWinnings(address, token, amount) {
      logger.info('wallet:addWinnings:noop', { address, token, amount });
    },
  };
}

let prismaClient = prisma;

const io = {
  to(room) {
    if (global.__io && typeof global.__io.to === 'function') {
      return global.__io.to(room);
    }
    return {
      emit: () => {},
    };
  },
};

const TREASURY = process.env.TREASURY_TESTNET_ADDRESS;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const BASIS_POINTS = 10000n;
const TREASURY_SPLIT_BPS = 1000n; // 10%
const WINNER_SPLIT_BPS = BASIS_POINTS - TREASURY_SPLIT_BPS; // 90%
let settlementIo = io;

function normalizePotValue(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('totalPot must be a finite number');
    return BigInt(Math.floor(value));
  }
  if (typeof value === 'string' && value.trim()) {
    return BigInt(value.trim());
  }
  throw new Error('totalPot is required');
}

function normalizeTokenAddress(token) {
  if (!token) return ZERO_ADDRESS;
  const trimmed = String(token).trim();
  if (!trimmed) return ZERO_ADDRESS;
  if (trimmed.toLowerCase() === 'eth') return ZERO_ADDRESS;
  return trimmed;
}

function ensureAddress(addressLike, label) {
  const normalized = String(addressLike || '').trim();
  if (!normalized || normalized.toLowerCase() === ZERO_ADDRESS) {
    throw new Error(`${label} address is required for settlement`);
  }
  if (!normalized.startsWith('0x') || normalized.length !== 42) {
    logger.warn('settlement:address-format', { label, address: normalized });
  }
  return normalized;
}

function splitPotNinetyTen(pot) {
  const fee = (pot * TREASURY_SPLIT_BPS) / BASIS_POINTS;
  const winnerAmount = pot - fee;
  if (winnerAmount <= 0n) {
    throw new Error('winner amount must be greater than zero after treasury split');
  }
  if (fee < 0n) {
    throw new Error('treasury fee cannot be negative');
  }
  return { fee, winnerAmount };
}

async function creditWithRetry({
  label,
  address,
  token,
  amount,
  maxAttempts = 3,
  baseDelayMs = 500,
}) {
  let attempt = 0;
  let lastError;
  while (attempt < maxAttempts) {
    try {
      const result = await wallet.addWinnings(address, token, amount);
      let serializedResult;
      try {
        serializedResult = typeof result === 'bigint' ? result.toString() : JSON.stringify(result);
      } catch (serializationError) {
        serializedResult = String(result ?? '');
      }
      console.info(
        `[SETTLE:${label}] attempt=${attempt + 1} address=${address} token=${token} amount=${amount.toString()} result=${serializedResult}`,
      );
      return result;
    } catch (err) {
      lastError = err;
      attempt += 1;
      console.error(
        `[SETTLE:${label}] attempt=${attempt} failed for address=${address}: ${err.message}`,
      );
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

async function settleGameOffchain({ gameId, totalPot, token, winner }) {
  const treasuryAddress = ensureAddress(TREASURY, 'treasury');
  const winnerAddress = ensureAddress(winner, 'winner');

  const pot = normalizePotValue(totalPot);
  if (pot <= 0n) {
    throw new Error('totalPot must be greater than zero');
  }

  const tokenAddress = normalizeTokenAddress(token);

  const dbGame = await prismaClient.games?.findUnique?.({
    where: { id: Number(gameId) },
    select: { totalPot: true },
  });

  if (dbGame?.totalPot) {
    const storedPot = normalizePotValue(dbGame.totalPot);
    if (storedPot !== pot) {
      throw new Error(
        `totalPot mismatch for game ${gameId}: expected ${storedPot.toString()} received ${pot.toString()}`,
      );
    }
  }

  const { fee, winnerAmount } = splitPotNinetyTen(pot);

  console.info(
    `[SETTLE] game=${gameId} token=${tokenAddress} pot=${pot.toString()} winner=${winnerAddress} split=${WINNER_SPLIT_BPS}/${TREASURY_SPLIT_BPS} fee=${fee.toString()} winnerAmount=${winnerAmount.toString()}`,
  );

  await creditWithRetry({
    label: 'winner',
    address: winnerAddress,
    token: tokenAddress,
    amount: winnerAmount,
  });

  await creditWithRetry({
    label: 'treasury',
    address: treasuryAddress,
    token: tokenAddress,
    amount: fee,
  });

  await prismaClient.games?.update?.({
    where: { id: Number(gameId) },
    data: {
      settled: true,
      totalPot: pot.toString(),
      winner: winnerAddress,
      treasuryFee: fee.toString(),
      winnerPayout: winnerAmount.toString(),
      settledAt: new Date(),
    },
  });

  settlementIo.to(`game_${gameId}`).emit('game:settled', {
    gameId,
    winner: winnerAddress,
    totalPot: pot.toString(),
    winnerAmount: winnerAmount.toString(),
    fee: fee.toString(),
  });

  return { winnerAmount: winnerAmount.toString(), fee: fee.toString() };
}

const DEFAULT_MAX_PLAYERS = 4;
const PASS_LIMIT = 6;

const baseGameInclude = {
  game_players: { orderBy: { playerNumber: 'asc' } },
  moves: { orderBy: { turnNumber: 'asc' } },
};

const lightweightGameInclude = {
  game_players: { orderBy: { playerNumber: 'asc' } },
};

function generateGameCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function normalizeName(name = '') {
  return (name || '').trim();
}

function getIo(req) {
  return req?.app?.get?.('io') || global.__io;
}

function formatPlayer(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    score: player.score || 0,
    playerNumber: player.playerNumber,
    isActive: player.isActive !== false,
  };
}

function determineWinner(players = []) {
  if (!players.length) return null;
  return players.reduce((prev, curr) => {
    if (!curr) return prev;
    if (!prev) return curr;
    return (curr.score || 0) > (prev.score || 0) ? curr : prev;
  }, null);
}

function winnerEnumFromPlayer(playerNumber) {
  if (playerNumber === 1) return 'player1';
  if (playerNumber === 2) return 'player2';
  return 'draw';
}

function readRack(player) {
  try {
    if (!player || !player.tiles) return [];
    const parsed = JSON.parse(player.tiles);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    logger.warn('game:rack-parse-failed', { playerId: player?.id, error: err.message });
    return [];
  }
}

function formatGameState(game, options = {}) {
  if (!game) return null;
  const boardState = hydrateBoardState(game.boardState);
  const includeRack = Boolean(options.includeRack);
  const payload = {
    id: game.id,
    gameId: game.id,
    gameCode: game.gameCode,
    status: game.status,
    currentTurn: game.currentTurn,
    maxPlayers: game.maxPlayers,
    boardState: boardState.grid,
    players: (game.game_players || []).map(formatPlayer),
    bagCount: boardState.bag.length,
    passesInRow: boardState.passesInRow || 0,
    lastMove: boardState.lastMove || null,
    winner: options.winner || null,
  };

  if (includeRack) {
    payload.rack = Array.isArray(options.rack) ? options.rack : null;
  } else {
    payload.rack = null;
  }

  if (options.includeMoves && Array.isArray(game.moves)) {
    payload.moves = game.moves;
  }

  if (options.finalScores) {
    payload.finalScores = options.finalScores;
  }

  return payload;
}

function emitGameState(io, game, event = 'game:state', extra = {}) {
  if (!io || !game) return;
  const payload = formatGameState(game, extra);
  if (!payload) return;
  payload.rack = null; // never broadcast racks
  const room = gameRoom(game.id);
  io.to(room).emit(event, payload);
  logger.debug('game:socket-broadcast', { event, gameId: game.id });
}

function emitPlayerEvent(io, gameId, playerName, event) {
  if (!io) return;
  const room = gameRoom(gameId);
  io.to(room).emit(event, { gameId, playerName });
  logger.debug('game:socket-player-event', { event, gameId, playerName });
}

function __setWalletService(mock) {
  wallet = mock;
}

function __setPrismaClient(mock) {
  prismaClient = mock;
}

function __setSettlementIo(mock) {
  settlementIo = mock || io;
}

async function ensureUser(username, address) {
  const existing = await prisma.users.findFirst({ where: { username } });
  if (existing) return existing;

  const now = new Date();
  return prisma.users.create({
    data: {
      username,
      email: `${username.toLowerCase()}@example.com`,
      password: 'changeme',
      address: address || null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  });
}

function nextPlayerNumber(players = []) {
  const taken = players
    .map((p) => p.playerNumber)
    .filter((num) => Number.isInteger(num))
    .sort((a, b) => a - b);
  let candidate = 1;
  for (const num of taken) {
    if (num !== candidate) break;
    candidate += 1;
  }
  return candidate;
}

function findPlayerByName(game, playerName) {
  if (!playerName) return null;
  const target = playerName.trim().toLowerCase();
  return (game.game_players || []).find((p) => p.name.toLowerCase() === target);
}

function nextTurnNumber(players, currentPlayerNumber) {
  const activeNumbers = (players || [])
    .filter((p) => p.isActive !== false)
    .map((p) => p.playerNumber)
    .filter((num) => Number.isInteger(num))
    .sort((a, b) => a - b);

  if (!activeNumbers.length) return currentPlayerNumber || 1;
  const idx = activeNumbers.indexOf(currentPlayerNumber);
  if (idx === -1) return activeNumbers[0];
  return activeNumbers[(idx + 1) % activeNumbers.length];
}

function shouldAutoComplete(boardState, players) {
  const activePlayers = (players || []).filter((p) => p.isActive !== false);
  if (activePlayers.length <= 1) return 'only-one-player';
  if ((boardState.passesInRow || 0) >= PASS_LIMIT) return 'pass-limit';
  if (!boardState.bag?.length) return 'bag-empty';
  const emptyRack = activePlayers.some((p) => {
    const rack = readRack(p);
    return rack.length === 0;
  });
  if (emptyRack) return 'tiles-depleted';
  return null;
}

function resolveWinnerAddress(game) {
  if (!game) return null;
  if (game.winner === 'player1') return game.player1Address || null;
  if (game.winner === 'player2') return game.player2Address || null;
  return null;
}

function resolveToken(game) {
  return game?.token || game?.stakeToken || process.env.SETTLEMENT_TOKEN || 'ETH';
}

function resolveTotalPot(game) {
  if (!game) return null;
  const candidates = [game.totalPot, game.pot, game.stakeAmount, game.entryFee];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (typeof candidate === 'bigint') {
      return candidate.toString();
    }
    const value = String(candidate).trim();
    if (value && /^\d+$/.test(value)) {
      return value;
    }
  }
  return null;
}

async function triggerSettlementIfEligible(game) {
  if (!game || game.status !== 'completed') return null;

  const winnerAddress = resolveWinnerAddress(game);
  const totalPot = resolveTotalPot(game);

  if (!winnerAddress || !totalPot) {
    logger.warn('settlement:skipped', {
      gameId: game.id,
      reason: 'missing-data',
      winnerAddress,
      totalPot,
    });
    return null;
  }

  const token = resolveToken(game);

  try {
    return await settleGameOffchain({
      gameId: game.id,
      totalPot,
      token,
      winner: winnerAddress,
    });
  } catch (err) {
    logger.error('settlement:error', { gameId: game.id, error: err.message });
    return null;
  }
}

async function finalizeGame(tx, gameId, boardState, reason) {
  boardState.lastMove = {
    type: 'end',
    reason,
    timestamp: new Date().toISOString(),
  };
  const serialized = serializeBoardState(boardState);
  const game = await tx.games.update({
    where: { id: gameId },
    data: {
      status: 'completed',
      boardState: serialized,
      updatedAt: new Date(),
    },
    include: baseGameInclude,
  });

  const winner = determineWinner(game.game_players);
  const winnerEnum = winner ? winnerEnumFromPlayer(winner.playerNumber) : 'draw';

  await tx.games.update({
    where: { id: gameId },
    data: {
      winner: winnerEnum,
    },
  });
  game.winner = winnerEnum;

  return { game, winnerPayload: winner ? { name: winner.name, score: winner.score } : null };
}

function respondWithGame(res, game, rack = null, options = {}) {
  const payload = formatGameState(game, {
    includeRack: true,
    rack,
    includeMoves: options.includeMoves,
    winner: options.winner,
    finalScores: options.finalScores,
  });
  return res.status(options.status || 200).json({
    success: true,
    data: {
      gameState: payload,
      rack: payload?.rack || rack,
    },
  });
}

async function createGame(req, res) {
  try {
    const { playerName, playerAddress } = req.body || {};
    const cleanName = normalizeName(playerName);
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Player name required' });
    }

    logger.info('game:create:start', { playerName: cleanName });
    const user = await ensureUser(cleanName, playerAddress);
    const boardState = hydrateBoardState();
    const filled = fillRack(boardState);
    boardState.bag = filled.bag;
    const rack = filled.rack;
    const gameCode = generateGameCode();
    const now = new Date();

    const game = await prisma.games.create({
      data: {
        gameCode,
        status: 'waiting',
        boardState: serializeBoardState(boardState),
        currentTurn: 1,
        maxPlayers: DEFAULT_MAX_PLAYERS,
        createdBy: user.id,
        player1Address: playerAddress || user.address,
        blockchainSubmitted: false,
        createdAt: now,
        updatedAt: now,
        game_players: {
          create: {
            userId: user.id,
            name: cleanName,
            playerNumber: 1,
            score: 0,
            tiles: JSON.stringify(rack),
            isActive: true,
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
      include: baseGameInclude,
    });

    logger.info('game:create:success', { gameId: game.id, gameCode });
    return respondWithGame(res, game, rack, { status: 201 });
  } catch (err) {
    logger.error('game:create:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function joinGame(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName, playerAddress } = req.body || {};
    const cleanName = normalizeName(playerName);
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Player name required' });
    }
    const numericGameId = parseInt(gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }

    const user = await ensureUser(cleanName, playerAddress);

    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.games.findUnique({
        where: { id: numericGameId },
        include: lightweightGameInclude,
      });
      if (!game) {
        return { status: 404, body: { success: false, message: 'Game not found' } };
      }
      if (game.status !== 'waiting') {
        return { status: 400, body: { success: false, message: 'Game already started' } };
      }
      const maxPlayers = game.maxPlayers || DEFAULT_MAX_PLAYERS;
      const activePlayers = (game.game_players || []).filter((p) => p.isActive !== false);
      if (activePlayers.length >= maxPlayers) {
        return { status: 400, body: { success: false, message: 'Game is full' } };
      }
      const duplicate = findPlayerByName(game, cleanName);
      if (duplicate) {
        return { status: 400, body: { success: false, message: 'Player already joined' } };
      }

      const boardState = hydrateBoardState(game.boardState);
      const filled = fillRack(boardState);
      boardState.bag = filled.bag;
      const rack = filled.rack;

      const now = new Date();
      await tx.game_players.create({
        data: {
          gameId: numericGameId,
          userId: user.id,
          name: cleanName,
          playerNumber: nextPlayerNumber(game.game_players),
          score: 0,
          tiles: JSON.stringify(rack),
          isActive: true,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      await tx.games.update({
        where: { id: numericGameId },
        data: {
          boardState: serializeBoardState(boardState),
          player2Address: game.player2Address || playerAddress || user.address,
          updatedAt: now,
        },
      });

      const updatedGame = await tx.games.findUnique({
        where: { id: numericGameId },
        include: baseGameInclude,
      });

      return { status: 200, body: { game: updatedGame, rack } };
    });

    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }

    const { game, rack } = result.body;
    const io = getIo(req);
    emitPlayerEvent(io, game.id, cleanName, 'game:join');
    emitGameState(io, game);

    logger.info('game:join:success', { gameId: game.id, playerName: cleanName });
    return respondWithGame(res, game, rack);
  } catch (err) {
    logger.error('game:join:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function leaveGame(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body || {};
    const cleanName = normalizeName(playerName);
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Player name required' });
    }
    const numericGameId = parseInt(gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.games.findUnique({
        where: { id: numericGameId },
        include: lightweightGameInclude,
      });
      if (!game) return null;
      const player = findPlayerByName(game, cleanName);
      if (!player) return null;

      const boardState = hydrateBoardState(game.boardState);
      const rack = readRack(player);
      if (rack.length) {
        boardState.bag = shuffleBag([...boardState.bag, ...rack]);
      }

      await tx.game_players.update({
        where: { id: player.id },
        data: {
          isActive: false,
          tiles: '[]',
          updatedAt: new Date(),
        },
      });
      player.isActive = false;
      player.tiles = '[]';

      let updatedGame;
      let winnerPayload = null;
      const reason = shouldAutoComplete(boardState, game.game_players);
      if (reason) {
        const completion = await finalizeGame(tx, numericGameId, boardState, reason);
        updatedGame = completion.game;
        winnerPayload = completion.winnerPayload;
      } else {
        boardState.lastMove = {
          type: 'leave',
          player: cleanName,
          timestamp: new Date().toISOString(),
        };
        updatedGame = await tx.games.update({
          where: { id: numericGameId },
          data: {
            boardState: serializeBoardState(boardState),
            currentTurn: player.playerNumber === game.currentTurn
              ? nextTurnNumber(game.game_players, player.playerNumber)
              : game.currentTurn,
            updatedAt: new Date(),
          },
          include: baseGameInclude,
        });
      }

      return { updatedGame, winnerPayload };
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Player not found' });
    }

    const { updatedGame, winnerPayload } = result;
    const io = getIo(req);
    emitPlayerEvent(io, updatedGame.id, cleanName, 'player:left');
    if (winnerPayload) {
      emitGameState(io, updatedGame, 'game:over', { winner: winnerPayload });
      await triggerSettlementIfEligible(updatedGame);
    } else {
      emitGameState(io, updatedGame);
    }

    return res.json({ success: true, message: `Player ${cleanName} left game ${updatedGame.id}` });
  } catch (err) {
    logger.error('game:leave:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function listGames(req, res) {
  try {
    const games = await prisma.games.findMany({
      where: { status: 'waiting' },
      include: lightweightGameInclude,
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: games.map((game) => formatGameState(game)) });
  } catch (err) {
    logger.error('game:list:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function startGame(req, res) {
  try {
    const numericGameId = parseInt(req.params.gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }

    const game = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: numericGameId },
        include: baseGameInclude,
      });
      if (!existingGame) return null;
      if (existingGame.status !== 'waiting') {
        return { alreadyStarted: true };
      }

      const updatedGame = await tx.games.update({
        where: { id: numericGameId },
        data: { status: 'active', updatedAt: new Date() },
        include: baseGameInclude,
      });
      return updatedGame;
    });

    if (!game) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }
    if (game.alreadyStarted) {
      return res.status(400).json({ success: false, message: 'Game already started' });
    }

    const io = getIo(req);
    emitGameState(io, game, 'game:start');
    return res.json({ success: true, message: `Game ${game.id} started` });
  } catch (err) {
    logger.error('game:start:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function getGameState(req, res) {
  try {
    const numericGameId = parseInt(req.params.gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }
    const requester = normalizeName(req.query.playerName || req.body?.playerName || '');

    const game = await prisma.games.findUnique({
      where: { id: numericGameId },
      include: baseGameInclude,
    });
    if (!game) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    const player = requester ? findPlayerByName(game, requester) : null;
    const rack = player ? readRack(player) : null;
    return respondWithGame(res, game, rack, {
      includeMoves: true,
      winner: game.status === 'completed' ? determineWinner(game.game_players) : null,
    });
  } catch (err) {
    logger.error('game:get-state:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function makeMove(req, res) {
  try {
    const numericGameId = parseInt(req.params.gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }

    const { playerName, placements, exchanged, passed } = req.body || {};
    const cleanName = normalizeName(playerName);
    if (!cleanName) {
      return res.status(400).json({ success: false, message: 'Player name required' });
    }

    const actions = [
      Array.isArray(placements) && placements.length > 0,
      Array.isArray(exchanged) && exchanged.length > 0,
      Boolean(passed),
    ].filter(Boolean);
    if (!actions.length) {
      return res.status(400).json({ success: false, message: 'No move supplied' });
    }
    if (actions.length > 1) {
      return res.status(400).json({ success: false, message: 'Only one move action allowed' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.games.findUnique({
        where: { id: numericGameId },
        include: baseGameInclude,
      });
      if (!game) return { type: 'error', status: 404, message: 'Game not found' };
      if (game.status !== 'active') {
        return { type: 'error', status: 400, message: 'Game not active' };
      }

      const player = findPlayerByName(game, cleanName);
      if (!player) {
        return { type: 'error', status: 404, message: 'Player not found' };
      }
      if (player.isActive === false) {
        return { type: 'error', status: 400, message: 'Player inactive' };
      }
      if (game.currentTurn && game.currentTurn !== player.playerNumber) {
        return { type: 'error', status: 409, message: 'Not your turn' };
      }

      const boardState = hydrateBoardState(game.boardState);
      let rack = readRack(player);
      let winnerPayload = null;
      const now = new Date();

      if (Array.isArray(placements) && placements.length) {
        const moveAnalysis = analyzeMove(boardState, placements);
        if (!moveAnalysis.ok) {
          return { type: 'error', status: 400, message: `Invalid placement: ${moveAnalysis.reason}` };
        }
        for (const wordData of moveAnalysis.words || []) {
          if (isValidWord && !isValidWord(wordData.word)) {
            return { type: 'error', status: 400, message: `Invalid word: ${wordData.word}` };
          }
        }

        const letters = placements.map((p) => p.rackLetter || p.letter);
        const removal = removeLettersFromRack(rack, letters);
        if (!removal.ok) {
          return { type: 'error', status: 400, message: 'Tiles not in rack' };
        }
        rack = removal.remaining;
        boardState.grid = moveAnalysis.updatedGrid;
        boardState.passesInRow = 0;
        boardState.lastMove = {
          type: 'placement',
          player: cleanName,
          score: moveAnalysis.score,
          placements,
          timestamp: now.toISOString(),
        };

        const refill = fillRack(boardState, rack);
        boardState.bag = refill.bag;
        rack = refill.rack;

        await tx.game_players.update({
          where: { id: player.id },
          data: {
            score: (player.score || 0) + moveAnalysis.score,
            tiles: JSON.stringify(rack),
            updatedAt: now,
          },
        });
        player.score = (player.score || 0) + moveAnalysis.score;
        player.tiles = JSON.stringify(rack);

        await tx.moves.create({
          data: {
            gameId: numericGameId,
            userId: player.userId,
            word: moveAnalysis.words?.[0]?.word || 'MOVE',
            position: JSON.stringify(placements),
            score: moveAnalysis.score,
            turnNumber: game.currentTurn || player.playerNumber,
            createdAt: now,
            updatedAt: now,
          },
        });
      } else if (Array.isArray(exchanged) && exchanged.length) {
        if (boardState.bag.length < exchanged.length) {
          return { type: 'error', status: 400, message: 'Not enough tiles in bag to exchange' };
        }
        const removal = removeLettersFromRack(rack, exchanged);
        if (!removal.ok) {
          return { type: 'error', status: 400, message: 'Tiles not in rack' };
        }
        rack = removal.remaining;
        boardState.bag = shuffleBag([...boardState.bag, ...exchanged]);
        const refill = fillRack(boardState, rack);
        boardState.bag = refill.bag;
        rack = refill.rack;
        boardState.passesInRow = (boardState.passesInRow || 0) + 1;
        boardState.lastMove = {
          type: 'exchange',
          player: cleanName,
          count: exchanged.length,
          timestamp: now.toISOString(),
        };

        await tx.game_players.update({
          where: { id: player.id },
          data: {
            tiles: JSON.stringify(rack),
            updatedAt: now,
          },
        });
        player.tiles = JSON.stringify(rack);
      } else if (passed) {
        boardState.passesInRow = (boardState.passesInRow || 0) + 1;
        boardState.lastMove = {
          type: 'pass',
          player: cleanName,
          timestamp: now.toISOString(),
        };
      }

      const reason = shouldAutoComplete(boardState, game.game_players);
      if (reason) {
        const completion = await finalizeGame(tx, numericGameId, boardState, reason);
        winnerPayload = completion.winnerPayload;
        return { type: 'ok', game: completion.game, rack, winnerPayload };
      }

      const nextTurn = nextTurnNumber(game.game_players, player.playerNumber);
      const updatedGame = await tx.games.update({
        where: { id: numericGameId },
        data: {
          boardState: serializeBoardState(boardState),
          currentTurn: nextTurn,
          updatedAt: now,
        },
        include: baseGameInclude,
      });

      return { type: 'ok', game: updatedGame, rack, winnerPayload: null };
    });

    if (result.type === 'error') {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    const io = getIo(req);
    if (result.winnerPayload) {
      emitGameState(io, result.game, 'game:over', { winner: result.winnerPayload });
      await triggerSettlementIfEligible(result.game);
    } else {
      emitGameState(io, result.game, 'game:update');
    }

    return respondWithGame(res, result.game, result.rack, {
      winner: result.winnerPayload,
    });
  } catch (err) {
    logger.error('game:move:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

async function skipTurn(req, res) {
  req.body = { ...(req.body || {}), passed: true };
  return makeMove(req, res);
}

async function endGame(req, res) {
  try {
    const numericGameId = parseInt(req.params.gameId, 10);
    if (Number.isNaN(numericGameId)) {
      return res.status(400).json({ success: false, message: 'Invalid game id' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const game = await tx.games.findUnique({
        where: { id: numericGameId },
        include: baseGameInclude,
      });
      if (!game) return null;
      const boardState = hydrateBoardState(game.boardState);
      const completion = await finalizeGame(tx, numericGameId, boardState, 'manual');
      return completion;
    });

    if (!result) {
      return res.status(404).json({ success: false, message: 'Game not found' });
    }

    const io = getIo(req);
    emitGameState(io, result.game, 'game:over', { winner: result.winnerPayload });
    await triggerSettlementIfEligible(result.game);
    return res.json({ success: true, message: 'Game ended' });
  } catch (err) {
    logger.error('game:end:error', { message: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

module.exports = {
  createGame,
  joinGame,
  leaveGame,
  listGames,
  startGame,
  getGameState,
  makeMove,
  skipTurn,
  endGame,
  __testing: {
    settleGameOffchain,
    normalizePotValue,
    normalizeTokenAddress,
    setWalletService: __setWalletService,
    setPrismaClient: __setPrismaClient,
    setSettlementIo: __setSettlementIo,
  },
};