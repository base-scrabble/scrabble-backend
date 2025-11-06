// routes/gameplayRoutes.cjs
const express = require('express');
const router = express.Router();
const {
  createGame,
  joinGame,
  leaveGame,
  listGames,
  startGame,
  getGameState,
  makeMove,
  skipTurn,
  endGame
} = require('../controllers/gameController.cjs');

console.log('Gameplay routes loaded');

router.post('/create', createGame);
router.post('/:gameId/join', joinGame);
router.post('/:gameId/leave', leaveGame);
router.get('/list', listGames);
router.post('/:gameId/start', startGame);
router.get('/:gameId', getGameState);
router.post('/:gameId/move', makeMove);
router.post('/:gameId/skip', skipTurn);
router.post('/:gameId/end', endGame);

module.exports = router;