const express = require('express');
const router = express.Router();
const { Tournament, TournamentPlayer, TournamentMatch, Admin, User, TournamentSchedule } = require('../models');
const { Op } = require('sequelize');
const { authenticateAdmin, requirePermission, requireSuperAdmin, requireTournamentAdmin } = require('../middleware/adminAuth');

/**
 * Generate tournament bracket based on tournament type
 * @param {Object} tournament - Tournament object
 * @param {Array} players - Array of confirmed players
 * @returns {Array} Array of generated matches
 */
async function generateTournamentBracket(tournament, players) {
  const matches = [];
  const shuffledPlayers = [...players].sort(() => Math.random() - 0.5);
  
  switch (tournament.type) {
    case 'single_elimination':
      return generateSingleEliminationBracket(tournament, shuffledPlayers);
    case 'double_elimination':
      return generateDoubleEliminationBracket(tournament, shuffledPlayers);
    case 'round_robin':
      return generateRoundRobinBracket(tournament, shuffledPlayers);
    case 'swiss':
      return generateSwissBracket(tournament, shuffledPlayers);
    default:
      throw new Error('Unsupported tournament type');
  }
}

/**
 * Generate single elimination bracket
 */
async function generateSingleEliminationBracket(tournament, players) {
  const matches = [];
  let round = 1;
  let currentPlayers = [...players];
  
  // Add byes if needed to make power of 2
  while (currentPlayers.length & (currentPlayers.length - 1)) {
    currentPlayers.push(null); // null represents a bye
  }
  
  while (currentPlayers.length > 1) {
    const roundMatches = [];
    
    for (let i = 0; i < currentPlayers.length; i += 2) {
      const player1 = currentPlayers[i];
      const player2 = currentPlayers[i + 1];
      
      if (player1 && player2) {
        const match = await TournamentMatch.create({
          tournamentId: tournament.id,
          player1Id: player1.playerId,
          player2Id: player2.playerId,
          round: round,
          status: 'scheduled',
          matchType: 'elimination'
        });
        roundMatches.push(match);
      } else if (player1) {
        // Player1 gets a bye, advance automatically
        roundMatches.push({ winner: player1, bye: true });
      }
    }
    
    matches.push(...roundMatches);
    currentPlayers = roundMatches.map(match => match.bye ? match.winner : null).filter(Boolean);
    round++;
  }
  
  return matches;
}

/**
 * Generate round robin bracket
 */
async function generateRoundRobinBracket(tournament, players) {
  const matches = [];
  
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const match = await TournamentMatch.create({
        tournamentId: tournament.id,
        player1Id: players[i].playerId,
        player2Id: players[j].playerId,
        round: 1,
        status: 'scheduled',
        matchType: 'round_robin'
      });
      matches.push(match);
    }
  }
  
  return matches;
}

/**
 * Generate double elimination bracket (simplified)
 */
async function generateDoubleEliminationBracket(tournament, players) {
  // For now, just generate single elimination - can be enhanced later
  return generateSingleEliminationBracket(tournament, players);
}

/**
 * Generate swiss bracket (simplified)
 */
async function generateSwissBracket(tournament, players) {
  // For now, just generate round robin - can be enhanced later
  return generateRoundRobinBracket(tournament, players);
}

/**
 * @route POST /api/admin/login
 * @desc Admin login (uses regular auth but checks admin status)
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { comparePassword, generateToken } = require('../middleware/auth');
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    const user = await User.findOne({ 
      where: { email },
      include: [{ model: Admin, required: true }]
    });
    
    if (!user || !user.Admin || !user.Admin.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Admin access denied'
      });
    }
    
    const isValidPassword = await comparePassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Update last login
    await Admin.update(
      { lastLoginAt: new Date() },
      { where: { userId: user.id } }
    );
    
    const token = generateToken({ userId: user.id, username: user.username });
    
    res.json({
      success: true,
      message: 'Admin login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        admin: {
          role: user.Admin.role,
          permissions: user.Admin.permissions
        },
        token
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});

/**
 * @route GET /api/admin/dashboard
 * @desc Get admin dashboard statistics
 * @access Private (Admin)
 */
router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const [
      totalTournaments,
      activeTournaments,
      totalPlayers,
      totalMatches,
      upcomingTournaments
    ] = await Promise.all([
      Tournament.count(),
      Tournament.count({ where: { status: 'in_progress' } }),
      TournamentPlayer.count(),
      TournamentMatch.count(),
      Tournament.findAll({
        where: { status: 'registration_open' },
        limit: 5,
        order: [['startAt', 'ASC']],
        include: [{ model: TournamentPlayer }]
      })
    ]);
    
    res.json({
      success: true,
      data: {
        statistics: {
          totalTournaments,
          activeTournaments,
          totalPlayers,
          totalMatches
        },
        upcomingTournaments: upcomingTournaments.map(t => ({
          id: t.id,
          name: t.name,
          startAt: t.startAt,
          registeredPlayers: t.TournamentPlayers.length,
          maxPlayers: t.maxPlayers
        }))
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load dashboard'
    });
  }
});

/**
 * @route GET /api/admin/tournaments
 * @desc Get all tournaments with admin details
 * @access Private (Admin)
 */
router.get('/tournaments', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, type } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (status) where.status = status;
    if (type) where.type = type;
    
    const tournaments = await Tournament.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'Creator', attributes: ['id', 'username'] },
        { model: TournamentPlayer },
        { model: TournamentMatch }
      ]
    });
    
    res.json({
      success: true,
      data: tournaments.rows,
      pagination: {
        total: tournaments.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(tournaments.count / limit)
      }
    });
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournaments'
    });
  }
});

/**
 * @route POST /api/admin/tournaments
 * @desc Create new tournament
 * @access Private (Tournament Admin)
 */
router.post('/tournaments', authenticateAdmin, async (req, res) => {
  try {
    const tournamentData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const tournament = await Tournament.create(tournamentData);
    
    res.status(201).json({
      success: true,
      message: 'Tournament created successfully',
      data: tournament
    });
  } catch (error) {
    console.error('Create tournament error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tournament'
    });
  }
});

/**
 * @route PUT /api/admin/tournaments/:id
 * @desc Update tournament
 * @access Private (Tournament Admin)
 */
router.put('/tournaments/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tournament = await Tournament.findByPk(id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    await tournament.update(req.body);
    
    res.json({
      success: true,
      message: 'Tournament updated successfully',
      data: tournament
    });
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tournament'
    });
  }
});

/**
 * @route DELETE /api/admin/tournaments/:id
 * @desc Delete tournament
 * @access Private (Tournament Admin)
 */
router.delete('/tournaments/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tournament = await Tournament.findByPk(id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    await tournament.destroy();
    
    res.json({
      success: true,
      message: 'Tournament deleted successfully'
    });
  } catch (error) {
    console.error('Delete tournament error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tournament'
    });
  }
});

/**
 * @route POST /api/admin/tournaments/:id/schedule
 * @desc Create automatic tournament schedule
 * @access Private (Tournament Admin)
 */
router.post('/tournaments/:id/schedule', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tournament = await Tournament.findByPk(id);
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    const scheduleData = {
      ...req.body,
      tournamentId: id
    };
    
    const schedule = await TournamentSchedule.create(scheduleData);
    
    res.status(201).json({
      success: true,
      message: 'Tournament schedule created successfully',
      data: schedule
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tournament schedule'
    });
  }
});

/**
 * @route POST /api/admin/tournaments/:id/generate-bracket
 * @desc Generate tournament bracket
 * @access Private (Tournament Admin)
 */
router.post('/tournaments/:id/generate-bracket', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const tournament = await Tournament.findByPk(id, {
      include: [{ 
        model: TournamentPlayer, 
        where: { status: 'confirmed' },
        required: false 
      }]
    });
    
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    const players = tournament.TournamentPlayers || [];
    
    // For demo purposes, if no players exist, create mock bracket
    if (players.length < 2) {
      // Create a demo bracket with mock players
      const mockMatches = [
        {
          id: 1,
          player1: 'Player 1',
          player2: 'Player 2',
          round: 1,
          status: 'scheduled'
        },
        {
          id: 2,
          player1: 'Player 3',
          player2: 'Player 4',
          round: 1,
          status: 'scheduled'
        }
      ];
      
      return res.json({
        success: true,
        message: 'Demo bracket generated successfully (no registered players)',
        data: { matches: mockMatches, demo: true }
      });
    }
    
    // Generate bracket based on tournament type
    const matches = await generateTournamentBracket(tournament, players);
    
    res.json({
      success: true,
      message: 'Bracket generated successfully',
      data: { matches }
    });
  } catch (error) {
    console.error('Generate bracket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate bracket'
    });
  }
});

/**
 * @route GET /api/admin/users
 * @desc Get all users with admin view
 * @access Private (Admin)
 */
router.get('/users', authenticateAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    
    const where = {};
    if (search) {
      where[Op.or] = [
        { username: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    const users = await User.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'username', 'email', 'totalScore', 'gamesPlayed', 'gamesWon', 'isActive', 'createdAt'],
      include: [{ model: Admin, required: false }]
    });
    
    res.json({
      success: true,
      data: users.rows,
      pagination: {
        total: users.count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(users.count / limit)
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

/**
 * Helper function to generate tournament bracket
 */
async function generateBracket(tournament, players) {
  const matches = [];
  
  switch (tournament.type) {
    case 'single_elimination':
      // Shuffle players for random seeding if no seed numbers
      const shuffledPlayers = players.sort(() => Math.random() - 0.5);
      
      // Create first round matches
      for (let i = 0; i < shuffledPlayers.length; i += 2) {
        const player1 = shuffledPlayers[i];
        const player2 = shuffledPlayers[i + 1] || null;
        
        const match = await TournamentMatch.create({
          tournamentId: tournament.id,
          roundNumber: 1,
          matchNumber: Math.floor(i / 2) + 1,
          player1Id: player1.userId,
          player2Id: player2?.userId || null,
          status: player2 ? 'scheduled' : 'completed',
          winnerId: player2 ? null : player1.userId
        });
        
        matches.push(match);
      }
      break;
      
    case 'round_robin':
      // Generate all possible pairings
      let matchNumber = 1;
      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          const match = await TournamentMatch.create({
            tournamentId: tournament.id,
            roundNumber: 1,
            matchNumber: matchNumber++,
            player1Id: players[i].userId,
            player2Id: players[j].userId,
            status: 'scheduled'
          });
          
          matches.push(match);
        }
      }
      break;
      
    default:
      throw new Error(`Tournament type ${tournament.type} not implemented`);
  }
  
  return matches;
}

/**
 * @route GET /api/admin/schedules
 * @desc Get all tournament schedules
 * @access Private (Admin)
 */
router.get('/schedules', authenticateAdmin, async (req, res) => {
  try {
    const schedules = await TournamentSchedule.findAll({
      include: [{
        model: Tournament,
        attributes: ['id', 'name', 'type', 'status']
      }],
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      data: schedules
    });
  } catch (error) {
    console.error('Load schedules error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load schedules'
    });
  }
});

/**
 * @route POST /api/admin/schedules
 * @desc Create new tournament schedule
 * @access Private (Admin)
 */
router.post('/schedules', authenticateAdmin, async (req, res) => {
  try {
    const scheduleData = {
      ...req.body,
      createdBy: req.user ? req.user.id : null
    };
    
    // Remove empty tournamentId if not provided
    if (!scheduleData.tournamentId || scheduleData.tournamentId === '') {
      delete scheduleData.tournamentId;
    }
    
    const schedule = await TournamentSchedule.create(scheduleData);
    
    res.status(201).json({
      success: true,
      message: 'Schedule created successfully',
      data: schedule
    });
  } catch (error) {
    console.error('Create schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create schedule: ' + error.message,
      error: error.message
    });
  }
});

/**
 * @route PUT /api/admin/schedules/:id
 * @desc Update tournament schedule
 * @access Private (Admin)
 */
router.put('/schedules/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await TournamentSchedule.findByPk(id);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    await schedule.update(req.body);
    
    res.json({
      success: true,
      message: 'Schedule updated successfully',
      data: schedule
    });
  } catch (error) {
    console.error('Update schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update schedule'
    });
  }
});

/**
 * @route DELETE /api/admin/schedules/:id
 * @desc Delete tournament schedule
 * @access Private (Admin)
 */
router.delete('/schedules/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const schedule = await TournamentSchedule.findByPk(id);
    
    if (!schedule) {
      return res.status(404).json({
        success: false,
        message: 'Schedule not found'
      });
    }
    
    await schedule.destroy();
    
    res.json({
      success: true,
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    console.error('Delete schedule error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete schedule'
    });
  }
});

module.exports = router;
