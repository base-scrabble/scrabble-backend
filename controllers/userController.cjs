// controllers/userController.cjs
const { prisma } = require('../lib/prisma.cjs');
const { authenticate } = require('../middleware/auth.cjs');
const { handleUpload, deleteFile } = require('../middleware/uploads.cjs');

/**
 * Get all users
 * GET /api/users
 * @access Public
 */
async function getUsers(req, res) {
  try {
    const users = await prisma.users.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        address: true,
        totalScore: true,
        gamesPlayed: true,
        gamesWon: true,
        avatar: true,
        createdAt: true
      }
    });
    return res.json({ success: true, data: users, count: users.length });
  } catch (err) {
    console.error('Fetch users error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch users', error: err.message });
  }
}

/**
 * Get user by ID
 * GET /api/users/:id
 * @access Private
 */
async function getUser(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required',
      });
    }

    const user = await prisma.users.findUnique({
      where: { id: parseInt(id) },
      select: {
        id: true,
        username: true,
        email: true,
        address: true,
        totalScore: true,
        gamesPlayed: true,
        gamesWon: true,
        avatar: true
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.json({
      success: true,
      data: user,
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
}

/**
 * Ensure user existence or create/update
 * Called from auth routes — NOT a direct endpoint
 * @access Internal
 */
const ensureUser = async (req, res, { wallet_address, email, sub, username }) => {
  try {
    if (!wallet_address || !sub) {
      if (!res.headersSent) {
        res.status(400).json({ success: false, message: 'wallet_address and sub are required' });
      }
      return null;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      if (!res.headersSent) {
        res.status(400).json({ success: false, message: 'Invalid wallet address format' });
      }
      return null;
    }

    const finalUsername = username || `user_${sub.slice(-6)}`;

    const { ensureUser } = require('../lib/users.cjs');
    const user = await ensureUser({
      address: wallet_address,
      email,
      username: finalUsername,
      password: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      totalScore: 0,
      gamesPlayed: 0,
      gamesWon: 0,
    });
    return user;
  } catch (err) {
    console.error('Ensure user error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to ensure user', error: err.message });
    }
    return null;
  }
};

/**
 * Update user details
 * PUT /api/users/:id
 * @access Private
 */
async function updateUser(req, res) {
  try {
    const { id } = req.params;
    const { username, email, address } = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        success: false,
        message: 'Valid user ID is required',
      });
    }

    if (!username && !email && !address) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (username, email, address) is required',
      });
    }

    if (address && !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format',
      });
    }

    const user = await prisma.users.findUnique({ where: { id: parseInt(id) } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    const { updateUser } = require('../lib/users.cjs');
    const updatedUser = await updateUser({
      id: parseInt(id),
      username: username || user.username,
      email: email || user.email,
      address: address || user.address,
      updatedAt: new Date(),
    });
    return res.json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser,
    });
  } catch (err) {
    console.error('Update user error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
}

/**
 * Get top 10 users by score
 * GET /api/users/leaderboard
 * @access Public
 */
async function getLeaderboard(req, res) {
  try {
    const { limit = 10 } = req.query;

    if (isNaN(parseInt(limit)) || parseInt(limit) < 1) {
      return res.status(400).json({
        success: false,
        message: 'Valid limit parameter is required',
      });
    }

    const leaderboard = await prisma.users.findMany({
      orderBy: { totalScore: 'desc' },
      take: parseInt(limit),
      select: {
        id: true,
        username: true,
        address: true,
        totalScore: true,
        gamesPlayed: true,
        gamesWon: true,
        avatar: true
      },
    });

    return res.json({
      success: true,
      data: leaderboard,
    });
  } catch (err) {
    console.error('Get leaderboard error:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message,
    });
  }
}

/**
 * Upload user avatar
 * POST /api/users/avatar
 * @access Private
 */
async function uploadAvatar(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user) {
      deleteFile(req.file.filename);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.avatar) {
      deleteFile(user.avatar);
    }

    const updatedUser = await prisma.users.update({
      where: { id: req.user.id },
      data: { avatar: req.file.filename, updatedAt: new Date() },
      select: { id: true, username: true, email: true, address: true, avatar: true }
    });

    return res.json({ success: true, message: 'Avatar uploaded', data: updatedUser });
  } catch (err) {
    console.error('Upload avatar error:', err.message);
    if (req.file) deleteFile(req.file.filename);
    return res.status(500).json({ success: false, message: 'Failed to upload avatar', error: err.message });
  }
}

/**
 * Delete user avatar
 * DELETE /api/users/avatar
 * @access Private
 */
async function deleteAvatar(req, res) {
  try {
    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (!user.avatar) {
      return res.status(400).json({ success: false, message: 'No avatar to delete' });
    }

    if (deleteFile(user.avatar)) {
      await prisma.users.update({
        where: { id: req.user.id },
        data: { avatar: null, updatedAt: new Date() },
        select: { id: true, username: true, email: true, address: true, avatar: true }
      });
      return res.json({ success: true, message: 'Avatar deleted' });
    }

    return res.status(500).json({ success: false, message: 'Failed to delete avatar' });
  } catch (err) {
    console.error('Delete avatar error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete avatar', error: err.message });
  }
}

module.exports = {
  getUsers,
  getUser: [authenticate, getUser],
  ensureUser,
  updateUser: [authenticate, updateUser],
  getLeaderboard,
  uploadAvatar: [authenticate, handleUpload, uploadAvatar],
  deleteAvatar: [authenticate, deleteAvatar]
};