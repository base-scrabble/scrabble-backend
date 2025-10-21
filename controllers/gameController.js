// controllers/gameController.js
// Full, production-grade game controller for Based Scrabble
// Exports: createGame, joinGame, listGames, startGame, getGameState,
// makeMove, skipTurn, endGame

const bcrypt = require('bcryptjs');
const { Game, GamePlayer, Move, User } = require('../models');

// --- Optional validators (fallback to permissive if missing) ---
let validateWord = () => true;
let validateBoardPlacement = () => true;
try {
  const dict = require('../services/dictionaryService');
  if (dict.validateWord) validateWord = dict.validateWord;
  if (dict.validateBoardPlacement) validateBoardPlacement = dict.validateBoardPlacement;
} catch (e) {
  console.warn('Dictionary service not loaded, using permissive validators');
}

// --- Helpers ---

function generateGameCode(length = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0, I/1
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function calculateScrabbleScore(word) {
  const map = {
    A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,
    O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10
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
  return (players || []).map(p =>
    typeof p === 'string'
      ? { name: p, score: 0 }
      : { name: p.name, score: p.score || 0, playerNumber: p.playerNumber || null }
  );
}

async function ensureUser(username) {
  const uname = username.toLowerCase();
  let user = await User.findOne({ where: { username: uname } });
  if (user) return user;

  const plain = Math.random().toString(36).slice(-8);
  const hashed = bcrypt.hashSync(plain, 10);

  try {
    user = await User.create({
      username: uname,
      email: `${uname}@example.com`,
      password: hashed
    });
    return user;
  } catch (err) {
    if (err?.name?.includes('UniqueConstraint')) {
      return await User.findOne({ where: { username: uname } });
    }
    throw err;
  }
}

// --- Controllers ---

exports.createGame = async (req, res) => {
  try {
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ error: 'Player name is required' });

    const user = await ensureUser(playerName);

    let gameCode;
    for (let i = 0; i < 6; i++) {
      gameCode = generateGameCode(6);
      const exist = await Game.findOne({ where: { gameCode } });
      if (!exist) break;
      if (i === 5) throw new Error('Could not generate unique game code');
    }

    const initialBoard = JSON.stringify(Array.from({ length: 15 }, () => Array(15).fill(null)));

    const game = await Game.create({
      status: 'waiting',
      gameCode,
      boardState: initialBoard,
      createdBy: user.id
    });

    await GamePlayer.create({
      gameId: game.id,
      userId: user.id,
      playerNumber: 1,
      name: playerName,
      score: 0
    });

    return res.json({
      success: true,
      gameId: game.id,
      gameCode,
      state: game.status,
      players: [{ name: playerName, score: 0, playerNumber: 1 }],
      playerId: user.id
    });
  } catch (err) {
    console.error('❌ Error creating game:', err);
    return res.status(500).json({ error: 'Failed to create game', details: err.message });
  }
};

exports.joinGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const game = await Game.findByPk(gameId);
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.status !== 'waiting') return res.status(400).json({ success: false, message: 'Game already started' });

    const existing = await GamePlayer.findOne({ where: { gameId, name: playerName } });
    if (existing) return res.status(400).json({ success: false, message: 'Player already joined' });

    const currentPlayers = await GamePlayer.count({ where: { gameId } });
    if (currentPlayers >= (game.maxPlayers || 4)) {
      return res.status(400).json({ success: false, message: 'Game is full' });
    }

    const user = await ensureUser(playerName);
    const nextPlayerNumber = currentPlayers + 1;

    await GamePlayer.create({
      gameId,
      userId: user.id,
      playerNumber: nextPlayerNumber,
      name: playerName,
      score: 0
    });

    const players = await GamePlayer.findAll({ where: { gameId } });
    return res.json({
      success: true,
      message: 'Joined game',
      gameId,
      gameCode: game.gameCode,
      players: normalizePlayers(players),
      playerId: user.id
    });
  } catch (err) {
    console.error('❌ Join game error:', err);
    return res.status(500).json({ success: false, message: 'Server error joining game', error: err.message });
  }
};

exports.listGames = async (req, res) => {
  try {
    const games = await Game.findAll({
      where: { status: 'waiting' },
      include: [{ model: GamePlayer, attributes: ['name', 'score', 'playerNumber'] }]
    });

    const out = games.map(g => ({
      id: g.id,
      gameCode: g.gameCode,
      status: g.status,
      players: normalizePlayers(g.GamePlayers)
    }));

    return res.json({ success: true, games: out });
  } catch (err) {
    console.error('❌ Error listing games:', err);
    return res.status(500).json({ error: 'Failed to list games', details: err.message });
  }
};

/** 🚫 Fix: require at least 2 players */
exports.startGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findByPk(gameId, {
      include: [{ model: GamePlayer }]
    });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.status !== 'waiting') return res.status(400).json({ success: false, message: 'Game already started' });

    if ((game.GamePlayers || []).length < 2) {
      return res.status(400).json({ success: false, message: 'Need at least 2 players to start the game' });
    }

    game.status = 'active';
    game.startedAt = new Date();
    await game.save();

    return res.json({
      success: true,
      state: game.status,
      id: game.id,
      gameCode: game.gameCode,
      players: normalizePlayers(game.GamePlayers)
    });
  } catch (err) {
    console.error('❌ Start game error:', err);
    return res.status(500).json({ success: false, message: 'Server error starting game', error: err.message });
  }
};

exports.getGameState = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findByPk(gameId, {
      include: [{ model: GamePlayer, attributes: ['name', 'score', 'playerNumber'] }]
    });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });

    const board = parseBoardState(game.boardState);
    return res.json({
      success: true,
      id: game.id,
      gameCode: game.gameCode,
      state: game.status,
      players: normalizePlayers(game.GamePlayers),
      boardState: board
    });
  } catch (err) {
    console.error('❌ Get game state error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching state', error: err.message });
  }
};

exports.makeMove = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { playerName, word, positions } = req.body;
    if (!word || !Array.isArray(positions) || positions.length === 0) {
      return res.status(400).json({ success: false, message: 'Word and positions required' });
    }

    const game = await Game.findByPk(gameId, { include: [{ model: GamePlayer }] });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ success: false, message: 'Game not active' });

    const player = await GamePlayer.findOne({ where: { gameId, name: playerName } });
    if (!player) return res.status(403).json({ success: false, message: 'Player not in game' });

    if (!validateWord(word)) return res.status(400).json({ success: false, message: `Invalid word: ${word}` });

    const board = parseBoardState(game.boardState);
    if (!validateBoardPlacement(board, positions, word)) {
      return res.status(400).json({ success: false, message: 'Invalid board placement' });
    }

    const points = calculateScrabbleScore(word);
    const moveNumber = (await Move.count({ where: { gameId } })) + 1;

    await Move.create({
      gameId,
      userId: player.userId,
      word,
      positions: JSON.stringify(positions),
      points,
      moveNumber
    });

    player.score = (player.score || 0) + points;
    await player.save();

    positions.forEach(p => {
      if (Array.isArray(board)) {
        if (!board[p.row]) board[p.row] = Array(15).fill(null);
        board[p.row][p.col] = p.letter;
      } else {
        board[`${p.row},${p.col}`] = p.letter;
      }
    });

    game.boardState = JSON.stringify(board);
    await game.save();

    return res.json({
      success: true,
      message: 'Move accepted',
      word,
      points,
      totalScore: player.score,
      moveNumber,
      players: normalizePlayers(game.GamePlayers)
    });
  } catch (err) {
    console.error('❌ Make move error:', err);
    return res.status(500).json({ success: false, message: 'Server error making move', error: err.message });
  }
};

exports.skipTurn = async (req, res) => {
  try {
    const { gameId } = req.params;
    const { playerName } = req.body;
    if (!playerName) return res.status(400).json({ success: false, message: 'Player name required' });

    const game = await Game.findByPk(gameId);
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ success: false, message: 'Game not active' });

    const player = await GamePlayer.findOne({ where: { gameId, name: playerName } });
    if (!player) return res.status(403).json({ success: false, message: 'Player not in game' });

    const moveNumber = (await Move.count({ where: { gameId } })) + 1;

    await Move.create({
      gameId,
      userId: player.userId,
      word: null,
      positions: null,
      points: 0,
      moveNumber
    });

    return res.json({ success: true, message: `${playerName} skipped their turn`, moveNumber });
  } catch (err) {
    console.error('❌ Skip turn error:', err);
    return res.status(500).json({ success: false, message: 'Server error skipping turn', error: err.message });
  }
};

/** 🚀 End game: force finish + show results to everyone */
exports.endGame = async (req, res) => {
  try {
    const { gameId } = req.params;
    const game = await Game.findByPk(gameId, { include: [{ model: GamePlayer }] });
    if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
    if (game.status !== 'active') return res.status(400).json({ success: false, message: 'Game not active' });

    const players = game.GamePlayers || [];
    if (players.length === 0) return res.status(400).json({ success: false, message: 'No players in game' });

    let winner = players[0];
    players.forEach(p => { if ((p.score || 0) > (winner.score || 0)) winner = p; });

    game.status = 'completed';
    game.completedAt = new Date();
    game.winnerId = winner.userId;
    await game.save();

    return res.json({
      success: true,
      message: 'Game ended',
      winner: winner.name,
      scores: players.map(p => ({ name: p.name, score: p.score || 0 }))
    });
  } catch (err) {
    console.error('❌ End game error:', err);
    return res.status(500).json({ success: false, message: 'Server error ending game', error: err.message });
  }
};
