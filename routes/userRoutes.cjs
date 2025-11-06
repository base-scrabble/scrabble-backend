const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUser,
  ensureUser,
  updateUser,
  getLeaderboard,
  uploadAvatar,
  deleteAvatar
} = require('../controllers/userController.cjs');
const { verifyPrivyToken, optionalAuth } = require('../config/auth.cjs');
const { handleUpload } = require('../middleware/uploads.cjs');

console.log('User routes loaded'); // ← ADDED

router.get('/', optionalAuth, getUsers);
router.get('/:id', verifyPrivyToken, getUser);
router.post('/', ensureUser); // Privy-handled, no auth needed
router.put('/:id', verifyPrivyToken, updateUser);
router.get('/leaderboard', getLeaderboard);
router.post('/avatar', verifyPrivyToken, handleUpload, uploadAvatar);
router.delete('/avatar', verifyPrivyToken, deleteAvatar);

module.exports = router;