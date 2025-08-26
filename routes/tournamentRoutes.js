const express = require('express');
const router = express.Router();
const { Tournament, TournamentPlayer, TournamentMatch, User } = require('../models');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { Op } = require('sequelize');

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
    
    const tournaments = await Tournament.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset,
      order: [['startAt', 'ASC']],
      include: [
        {
          model: TournamentPlayer,
          attributes: ['id', 'userId', 'status'],
          include: [{ model: User, attributes: ['id', 'username'] }]
        }
      ],
      attributes: [
        'id', 'name', 'description', 'type', 'status', 'maxPlayers',
        'entryFee', 'prizePool', 'registrationStartAt', 'registrationEndAt',
        'startAt', 'endAt', 'rules', 'createdAt'
      ]
    });
    
    res.json({
      success: true,
      data: tournaments.rows.map(tournament => ({
        ...tournament.toJSON(),
        registeredPlayers: tournament.TournamentPlayers.length,
        canRegister: tournament.status === 'registration_open' && 
                    tournament.TournamentPlayers.length < tournament.maxPlayers
      })),
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
 * @route GET /api/tournaments/:id
 * @desc Get tournament details
 * @access Public
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const tournament = await Tournament.findByPk(id, {
      include: [
        {
          model: TournamentPlayer,
          include: [{ model: User, attributes: ['id', 'username', 'totalScore'] }],
          order: [['seedNumber', 'ASC']]
        },
        {
          model: TournamentMatch,
          include: [
            { model: User, as: 'Player1', attributes: ['id', 'username'] },
            { model: User, as: 'Player2', attributes: ['id', 'username'] },
            { model: User, as: 'Winner', attributes: ['id', 'username'] }
          ],
          order: [['roundNumber', 'ASC'], ['matchNumber', 'ASC']]
        }
      ]
    });
    
    if (!tournament || !tournament.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    const userRegistration = req.user ? 
      tournament.TournamentPlayers.find(p => p.userId === req.user.id) : null;
    
    res.json({
      success: true,
      data: {
        ...tournament.toJSON(),
        userRegistration,
        canRegister: tournament.status === 'registration_open' && 
                    tournament.TournamentPlayers.length < tournament.maxPlayers &&
                    !userRegistration
      }
    });
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament'
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
    
    const tournament = await Tournament.findByPk(id);
    
    if (!tournament || !tournament.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found'
      });
    }
    
    if (tournament.status !== 'registration_open') {
      return res.status(400).json({
        success: false,
        message: 'Registration is not open for this tournament'
      });
    }
    
    // Check if already registered
    const existingRegistration = await TournamentPlayer.findOne({
      where: { tournamentId: id, userId }
    });
    
    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: 'Already registered for this tournament'
      });
    }
    
    // Check if tournament is full
    const currentPlayers = await TournamentPlayer.count({
      where: { tournamentId: id, status: { [Op.ne]: 'withdrawn' } }
    });
    
    if (currentPlayers >= tournament.maxPlayers) {
      return res.status(400).json({
        success: false,
        message: 'Tournament is full'
      });
    }
    
    const registration = await TournamentPlayer.create({
      tournamentId: id,
      userId,
      seedNumber: currentPlayers + 1,
      status: 'registered'
    });
    
    res.status(201).json({
      success: true,
      message: 'Successfully registered for tournament',
      data: registration
    });
  } catch (error) {
    console.error('Tournament registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to register for tournament'
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
    
    const registration = await TournamentPlayer.findOne({
      where: { tournamentId: id, userId }
    });
    
    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Not registered for this tournament'
      });
    }
    
    const tournament = await Tournament.findByPk(id);
    
    if (tournament.status === 'in_progress' || tournament.status === 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot withdraw from tournament that has started'
      });
    }
    
    await registration.update({ status: 'withdrawn' });
    
    res.json({
      success: true,
      message: 'Successfully withdrawn from tournament'
    });
  } catch (error) {
    console.error('Tournament withdrawal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to withdraw from tournament'
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
    
    const matches = await TournamentMatch.findAll({
      where: { tournamentId: id },
      include: [
        { model: User, as: 'Player1', attributes: ['id', 'username'] },
        { model: User, as: 'Player2', attributes: ['id', 'username'] },
        { model: User, as: 'Winner', attributes: ['id', 'username'] }
      ],
      order: [['roundNumber', 'ASC'], ['matchNumber', 'ASC']]
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
      data: { bracket, matches }
    });
  } catch (error) {
    console.error('Get bracket error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament bracket'
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
    
    const players = await TournamentPlayer.findAll({
      where: { tournamentId: id },
      include: [{ model: User, attributes: ['id', 'username'] }],
      order: [
        ['ranking', 'ASC'],
        ['wins', 'DESC'],
        ['totalScore', 'DESC']
      ]
    });
    
    res.json({
      success: true,
      data: players
    });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tournament leaderboard'
    });
  }
});

module.exports = router;
