// routes/tournamentRoutes.cjs
const express = require('express');
const router = express.Router();
const {
  createTournament,
  registerPlayer,
  updateMatchResult
} = require('../controllers/tournamentController.cjs');
const { prisma } = require('../lib/prisma.cjs');
const { authenticate, optionalAuth } = require('../middleware/auth.cjs');

console.log('Tournament routes loaded');

// === CONTROLLER-BASED (DRY + AUTHENTICATED) ===
router.post('/', ...createTournament);
router.post('/:id/register', ...registerPlayer);
router.put('/matches/:matchId', ...updateMatchResult);

/**
 * @route GET /api/tournaments
 * @desc Get all public tournaments
 * @access Public
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const where = { isActive: true };
    if (status) where.status = status;
    if (type) where.type = type;

    const tournaments = await prisma.tournaments.findMany({
      where,
      skip: offset,
      take: parseInt(limit),
      orderBy: { startAt: 'asc' },
      include: {
        tournament_players: {
          select: { id: true, userId: true, status: true },
          include: { user: { select: { id: true, username: true } } },
        },
      },
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        status: true,
        maxPlayers: true,
        entryFee: true,
        prizePool: true,
        registrationStartAt: true,
        registrationEndAt: true,
        startAt: true,
        endAt: true,
        rules: true,
        createdAt: true,
      },
    });

    const count = await prisma.tournaments.count({ where });

    res.json({
      success: true,
      data: tournaments.map(tournament => ({
        ...tournament,
        registeredPlayers: tournament.tournament_players.length,
        canRegister: tournament.status === 'registration_open' && 
                    tournament.tournament_players.length < tournament.maxPlayers,
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournaments',
    });
  }
});

/**
 * @route GET /api/tournaments/:id
 * @desc Get tournament details
 * @access Public
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const tournament = await prisma.tournaments.findUnique({
      where: { id: parseInt(id) },
      include: {
        tournament_players: {
          include: { user: { select: { id: true, username: true, totalScore: true } } },
          orderBy: { seedNumber: 'asc' },
        },
        tournament_matches: {
          include: {
            player1: { select: { id: true, username: true } },
            player2: { select: { id: true, username: true } },
            winner: { select: { id: true, username: true } },
          },
          orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
        },
      },
    });

    if (!tournament || !tournament.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found',
      });
    }

    const userRegistration = req.user ? 
      tournament.tournament_players.find(p => p.userId === req.user.id) : null;

    res.json({
      success: true,
      data: {
        ...tournament,
        userRegistration,
        canRegister: tournament.status === 'registration_open' && 
                    tournament.tournament_players.length < tournament.maxPlayers &&
                    !userRegistration,
      },
    });
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament',
    });
  }
});

/**
 * @route POST /api/tournaments/:id/register
 * @desc Register for tournament
 * @access Private
 */
router.post('/:id/register', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const tournament = await prisma.tournaments.findUnique({ where: { id: parseInt(id) } });

    if (!tournament || !tournament.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found',
      });
    }

    if (tournament.status !== 'registration_open') {
      return res.status(400).json({
        success: false,
        message: 'Registration is not open for this tournament',
      });
    }

    // Check if already registered
    const existingRegistration = await prisma.tournament_players.findFirst({
      where: { tournamentId: parseInt(id), userId },
    });

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: 'Already registered for this tournament',
      });
    }

    // Check if tournament is full
    const currentPlayers = await prisma.tournament_players.count({
      where: { tournamentId: parseInt(id), status: { not: 'withdrawn' } },
    });

    if (currentPlayers >= tournament.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full',
      });
    }

    const registration = await prisma.tournament_players.create({
      data: {
        tournamentId: parseInt(id),
        userId,
        seedNumber: currentPlayers + 1,
        status: 'registered',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Successfully registered for tournament',
      data: registration,
    });
  } catch (error) {
    console.error('Tournament registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register for tournament',
    });
  }
});

/**
 * @route DELETE /api/tournaments/:id/register
 * @desc Withdraw from tournament
 * @access Private
 */
router.delete('/:id/register', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const registration = await prisma.tournament_players.findFirst({
      where: { tournamentId: parseInt(id), userId },
    });

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Not registered for this tournament',
      });
    }

    const tournament = await prisma.tournaments.findUnique({ where: { id: parseInt(id) } });

    if (tournament.status === 'in_progress' || tournament.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw from tournament that has started',
      });
    }

    await prisma.tournament_players.update({
      where: { id: registration.id },
      data: { status: 'withdrawn' },
    });

    res.json({
      success: true,
      message: 'Successfully withdrawn from tournament',
    });
  } catch (error) {
    console.error('Tournament withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to withdraw from tournament',
    });
  }
});

/**
 * @route GET /api/tournaments/:id/bracket
 * @desc Get tournament bracket
 * @access Public
 */
router.get('/:id/bracket', async (req, res) => {
  try {
    const { id } = req.params;

    const matches = await prisma.tournament_matches.findMany({
      where: { tournamentId: parseInt(id) },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
        winner: { select: { id: true, username: true } },
      },
      orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
    });

    // Group matches by round
    const bracket = matches.reduce((acc, match) => {
      const round = match.roundNumber;
      if (!acc[round]) acc[round] = [];
      acc[round].push(match);
      return acc;
    }, {});

    res.json({
      success: true,
      data: { bracket, matches },
    });
  } catch (error) {
    console.error('Get bracket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament bracket',
    });
  }
});

/**
 * @route GET /api/tournaments/:id/leaderboard
 * @desc Get tournament leaderboard
 * @access Public
 */
router.get('/:id/leaderboard', async (req, res) => {
  try {
    const { id } = req.params;

    const players = await prisma.tournament_players.findMany({
      where: { tournamentId: parseInt(id) },
      include: { user: { select: { id: true, username: true } } },
      orderBy: [
        { ranking: 'asc' },
        { wins: 'desc' },
        { totalScore: 'desc' },
      ],
    });

    res.json({
      success: true,
      data: players,
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament leaderboard',
    });
  }
});

module.exports = router;