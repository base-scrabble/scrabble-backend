// controllers/gameController.cjs

const { prisma } = require('../lib/prisma.cjs');
const { hashPassword } = require('../config/auth.cjs');
const { io } = require('../server.cjs');
const { isValidWord } = require('../services/wordValidator.cjs');
const validateBoardPlacement = () => true; // Stub, replace with actual logic

// Helpers
function generateGameCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function calculateScrabbleScore(word) {
  const map = {
    A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3, N: 1,
    O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
  };
  return (word || '').toUpperCase().split('').reduce((s, ch) => s + (map[ch] || 0), 0);
}

function parseBoardState(raw) {
  if (!raw) return Array.from({ length: 15 }, () => Array(15).fill(null));
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    return Array.from({ length: 15 }, () => Array(15).fill(null));
  }
}

function normalizePlayers(players) {
  return (players || []).map(p => ({
    name: p.name,
    score: p.score || 0,
    playerNumber: p.playerNumber || null,
  }));
}

async function ensureUser(username, address) {
  let user = await prisma.users.findFirst({ where: { username } });
  if (!user) {
    user = await prisma.users.create({
      data: {
        username,
        email: `${username.toLowerCase()}@example.com`,
        password: 'changeme', // seeded placeholder; real flows should require signup
        address: address || `0x${'0'.repeat(40)}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
  return user;
}

// Controllers
async function createGame(req, res) {
  try {
    const { playerName, playerAddress } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const user = await ensureUser(playerName, playerAddress);
    const gameCode = generateGameCode();

    const game = await prisma.$transaction(async (tx) => {
      const newGame = await tx.games.create({
        data: {
          gameCode,
          status: 'waiting',
          boardState: JSON.stringify(Array.from({ length: 15 }, () => Array(15).fill(null))),
          currentTurn: 1,
          maxPlayers: 4,
          createdBy: user.id,
          player1Address: playerAddress || user.address,
          blockchainSubmitted: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          game_players: {
            create: {
              userId: user.id,
              name: playerName,
              playerNumber: 1,
              score: 0,
              tiles: '[]',
              isActive: true,
              joinedAt: new Date(),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        },
        include: { game_players: true },
      });
      if (io) io.to(`game:${newGame.id}`).emit('game:join', { gameId: newGame.id, playerName });
      return newGame;
    });

    return res.status(201).json({
      success: true,
      gameId: game.id,
      gameCode,
      message: `Game ${gameCode} created`,
    });
  } catch (err) {
    console.error('❌ Create game error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function joinGame(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName, playerAddress } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const user = await ensureUser(playerName, playerAddress);
    const result = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });
      if (!existingGame) return { status: 404, body: { success: false, message: 'Game not found' } };
      if (existingGame.status !== 'waiting') return { status: 400, body: { success: false, message: 'Game already started' } };
      if (existingGame.game_players.length >= (existingGame.maxPlayers || 4)) return { status: 400, body: { success: false, message: 'Game is full' } };

      const player = await tx.game_players.create({
        data: {
          gameId: parseInt(gameId),
          userId: user.id,
          name: playerName,
          playerNumber: existingGame.game_players.length + 1,
          score: 0,
          tiles: '[]',
          isActive: true,
          joinedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // update next player address field generically (player2Address etc) - simple strategy: fill player2Address if null, else ignore
      const updateData = {};
      if (!existingGame.player2Address) updateData.player2Address = playerAddress || user.address;

      await tx.games.update({
        where: { id: parseInt(gameId) },
        data: { ...updateData, updatedAt: new Date() },
      });

      if (io) io.to(`game:${gameId}`).emit('game:join', { gameId, playerName });
      const updated = await tx.games.findUnique({ where: { id: parseInt(gameId) }, include: { game_players: true } });
      return { status: 200, body: { success: true, gameId, message: `Joined game ${gameId}`, game: updated } };
    });

    if (result.status !== 200) return res.status(result.status).json(result.body);
    return res.json(result.body);
  } catch (err) {
    console.error('❌ Join game error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function leaveGame(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const updatedGame = await prisma.$transaction(async (tx) => {
      const player = await tx.game_players.findFirst({
        where: { gameId: parseInt(gameId), name: playerName },
      });
      if (!player) return null;

      await tx.game_players.update({
        where: { id: player.id },
        data: { isActive: false, updatedAt: new Date() },
      });

      const game = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });

      if (io) io.to(`game:${gameId}`).emit('game:leave', { gameId, playerName });
      return game;
    });

    if (!updatedGame) return res.status(404).json({ success: false, message: 'Player not found' });
    return res.json({ success: true, message: `Player ${playerName} left game ${gameId}` });
  } catch (err) {
    console.error('❌ Leave game error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function listGames(req, res) {
  try {
    const games = await prisma.games.findMany({
      where: { status: 'waiting' },
      include: { game_players: true },
    });
    return res.json({ success: true, data: games });
  } catch (err) {
    console.error('❌ List games error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function startGame(req, res) {
  try {
    const { gameId } = req.params;
    const game = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });
      if (!existingGame) return null;
      if (existingGame.status !== 'waiting') return { alreadyStarted: true };

      await tx.games.update({
        where: { id: parseInt(gameId) },
        data: { status: 'active', updatedAt: new Date() },
      });

      if (io) io.to(`game:${gameId}`).emit('game:start', { gameId });
      return existingGame;
    });

    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.alreadyStarted) return res.status(400).json({ success: false, message: 'Game already started' });
    return res.json({ success: true, message: `Game ${gameId} started` });
  } catch (err) {
    console.error('❌ Start game error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function getGameState(req, res) {
  try {
    const { gameId } = req.params;
    const game = await prisma.games.findUnique({
      where: { id: parseInt(gameId) },
      include: { game_players: true, moves: true },
    });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });

    return res.json({
      success: true,
      data: {
        id: game.id,
        gameCode: game.gameCode,
        status: game.status,
        boardState: parseBoardState(game.boardState),
        players: normalizePlayers(game.game_players),
        currentTurn: game.currentTurn,
        moves: game.moves,
      },
    });
  } catch (err) {
    console.error('❌ Get game state error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function makeMove(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName, word, position } = req.body;
    if (!word || !position) return res.status(400).json({ success: false, message: 'Word and position required' });

    const updatedGame = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });
      if (!existingGame) return null;
      if (existingGame.status !== 'active') return { notActive: true };

      const player = existingGame.game_players.find(p => p.name === playerName);
      if (!player) return { playerMissing: true };

      if (isValidWord && !isValidWord(word)) return { invalidWord: true };
      if (!validateBoardPlacement(position)) return { invalidPlacement: true };

      const score = calculateScrabbleScore(word);
      await tx.game_players.update({
        where: { id: player.id },
        data: { score: (player.score || 0) + score, updatedAt: new Date() },
      });

      await tx.moves.create({
        data: {
          gameId: parseInt(gameId),
          userId: player.userId,
          word,
          position: JSON.stringify(position),
          score,
          turnNumber: existingGame.currentTurn,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await tx.games.update({
        where: { id: parseInt(gameId) },
        data: { currentTurn: (existingGame.currentTurn || 0) + 1, updatedAt: new Date() },
      });

      const updated = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });

      if (io) io.to(`game:${gameId}`).emit('game:state', {
        gameId,
        players: normalizePlayers(updated.game_players),
        boardState: parseBoardState(updated.boardState),
        currentTurn: updated.currentTurn,
      });

      return updated;
    });

    if (!updatedGame) return res.status(404).json({ success: false, message: 'Game not found' });
    if (updatedGame.notActive) return res.status(400).json({ success: false, message: 'Game not active' });
    if (updatedGame.playerMissing) return res.status(404).json({ success: false, message: 'Player not found' });
    if (updatedGame.invalidWord) return res.status(400).json({ success: false, message: 'Invalid word' });
    if (updatedGame.invalidPlacement) return res.status(400).json({ success: false, message: 'Invalid placement' });

    return res.json({ success: true, message: 'Move successful' });
  } catch (err) {
    console.error('❌ Make move error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function skipTurn(req, res) {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const updated = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });
      if (!existingGame) return null;
      if (existingGame.status !== 'active') return { notActive: true };

      await tx.games.update({
        where: { id: parseInt(gameId) },
        data: { currentTurn: (existingGame.currentTurn || 0) + 1, updatedAt: new Date() },
      });

      const g = await tx.games.findUnique({ where: { id: parseInt(gameId) }, include: { game_players: true }});
      if (io) io.to(`game:${gameId}`).emit('game:state', {
        gameId,
        players: normalizePlayers(g.game_players),
        boardState: parseBoardState(g.boardState),
        currentTurn: g.currentTurn,
      });

      return g;
    });

    if (!updated) return res.status(404).json({ success: false, message: 'Game not found' });
    if (updated.notActive) return res.status(400).json({ success: false, message: 'Game not active' });

    return res.json({ success: true, message: 'Turn skipped' });
  } catch (err) {
    console.error('❌ Skip turn error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

async function endGame(req, res) {
  try {
    const { gameId } = req.params;
    const game = await prisma.$transaction(async (tx) => {
      const existingGame = await tx.games.findUnique({
        where: { id: parseInt(gameId) },
        include: { game_players: true },
      });
      if (!existingGame) return null;

      const winner = (existingGame.game_players || []).reduce((prev, curr) =>
        prev.score > curr.score ? prev : curr
      , { score: -1 });

      await tx.games.update({
        where: { id: parseInt(gameId) },
        data: {
          status: 'completed',
          winner: winner && winner.score >= 0 ? `player${winner.playerNumber}` : 'draw',
          blockchainSubmitted: false,
          updatedAt: new Date(),
        },
      });

      const updated = await tx.games.findUnique({ where: { id: parseInt(gameId) }, include: { game_players: true }});
      if (io) io.to(`game:${gameId}`).emit('game:state', {
        gameId,
        status: 'completed',
        players: normalizePlayers(updated.game_players),
        winner: winner && winner.score >= 0 ? { name: winner.name, score: winner.score } : null,
      });

      return updated;
    });

    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    return res.json({ success: true, message: 'Game ended' });
  } catch (err) {
    console.error('❌ End game error:', err);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message || err });
  }
}

module.exports = { createGame, joinGame, leaveGame, listGames, startGame, getGameState, makeMove, skipTurn, endGame };