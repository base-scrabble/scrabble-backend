// routes/adminRoutes.cjs
const express = require('express');
const router = express.Router();
const {
  banUser,
  cancelTournament,
  getAdminStats,
  getAllUsers,
  getAllGames,
  promoteUser,
  deleteUser
} = require('../controllers/adminController.cjs');

console.log('Admin routes loaded');

router.put('/users/:userId/ban', ...banUser);
router.put('/tournaments/:tournamentId/cancel', ...cancelTournament);
router.get('/stats', ...getAdminStats);
router.get('/users', ...getAllUsers);
router.get('/games', ...getAllGames);
router.post('/promote', ...promoteUser);
router.delete('/users/:id', ...deleteUser);

module.exports = router;