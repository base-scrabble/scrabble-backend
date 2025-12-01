// controllers/adminController.cjs
const { prisma } = require('../lib/prisma.cjs');
const { authenticateAdmin } = require('../middleware/adminAuth.cjs');

/**
 * Ban a user
 * PUT /api/admin/users/:userId/ban
 */
async function banUser(req, res) {
  try {
    const { userId } = req.params;
    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({ success: false, message: 'Valid user ID required' });
    }

    const user = await prisma.users.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { updateUser } = require('../lib/users.cjs');
    await updateUser({
      id: parseInt(userId),
      isActive: false,
      updatedAt: new Date(),
    });

    return res.json({ success: true, message: 'User banned' });
  } catch (err) {
    console.error('Ban user error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Cancel a tournament
 * PUT /api/admin/tournaments/:tournamentId/cancel
 */
async function cancelTournament(req, res) {
  try {
    const { tournamentId } = req.params;
    if (!tournamentId || isNaN(parseInt(tournamentId))) {
      return res.status(400).json({ success: false, message: 'Valid tournament ID required' });
    }

    const tournament = await prisma.tournaments.findUnique({ where: { id: parseInt(tournamentId) } });
    if (!tournament) {
      return res.status(404).json({ success: false, message: 'Tournament not found' });
    }

    await prisma.tournaments.update({
      where: { cinta: parseInt(tournamentId) },
      data: { status: 'cancelled', isActive: false, updated_at: new Date() },
    });

    return res.json({ success: true, message: 'Tournament cancelled' });
  } catch (err) {
    console.error('Cancel tournament error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Get admin dashboard stats
 * GET /api/admin/stats
 */
async function getAdminStats(req, res) {
  try {
    const [userCount, tournamentCount, activeGames, completedMatches] = await Promise.all([
      prisma.users.count(),
      prisma.tournaments.count({ where: { isActive: true } }),
      prisma.games.count({ where: { status: 'active' } }),
      prisma.tournament_matches.count({ where: { status: 'completed' } }),
    ]);

    return res.json({
      success: true,
      data: { userCount, tournamentCount, activeGames, completedMatches },
    });
  } catch (err) {
    console.error('Admin stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Get all users (admin view)
 * GET /api/admin/users
 */
async function getAllUsers(req, res) {
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
        role: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: users });
  } catch (err) {
    console.error('Admin fetch users error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch users', error: err.message });
  }
}

/**
 * Get all games (admin view)
 * GET /api/admin/games
 */
async function getAllGames(req, res) {
  try {
    const games = await prisma.games.findMany({
      select: {
        id: true,
        gameCode: true,
        status: true,
        winner: true,
        blockchainSubmitted: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: games });
  } catch (err) {
    console.error('Admin fetch games error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch games', error: err.message });
  }
}

/**
 * Promote user to admin
 * POST /api/admin/promote
 */
async function promoteUser(req, res) {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required' });
    }

    const { updateUser } = require('../lib/users.cjs');
    const updatedUser = await updateUser({
      id: Number(userId),
      role: 'admin',
    });

    res.json({ success: true, message: 'User promoted to admin', data: updatedUser });
  } catch (err) {
    console.error('Admin promote error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to promote user', error: err.message });
  }
}

/**
 * Delete a user
 * DELETE /api/admin/users/:id
 */
async function deleteUser(req, res) {
  try {
    const userId = Number(req.params.id);
    if (userId === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete yourself' });
    }

    await prisma.users.delete({ where: { id: userId } });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Admin delete user error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete user', error: err.message });
  }
}

module.exports = {
  banUser: [authenticateAdmin, banUser],
  cancelTournament: [authenticateAdmin, cancelTournament],
  getAdminStats: [authenticateAdmin, getAdminStats],
  getAllUsers: [authenticateAdmin, getAllUsers],
  getAllGames: [authenticateAdmin, getAllGames],
  promoteUser: [authenticateAdmin, promoteUser],
  deleteUser: [authenticateAdmin, deleteUser],
};