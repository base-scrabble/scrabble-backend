//controllers/tournamentController.cjs
const { prisma } = require('../lib/prisma.cjs');
const { authenticate } = require('../middleware/auth.cjs');

/**
 * Create a new tournament
 * POST /api/tournaments
 */
async function createTournament(req, res) {
  try {
    const { name, description, type, maxPlayers, entryFee, prizePool, registrationStartAt, registrationEndAt, startAt } = req.body;

    if (!name || !type || !maxPlayers || !registrationStartAt || !registrationEndAt || !startAt) {
      return res.status(400).json({ success: false, message: 'Required fields: name, type, maxPlayers, registrationStartAt, registrationEndAt, startAt' });
    }

    const tournament = await prisma.tournaments.create({
      data: {
        name,
        description,
        type,
        maxPlayers: parseInt(maxPlayers),
        entryFee: entryFee ? parseFloat(entryFee) : null,
        prizePool: prizePool ? parseFloat(prizePool) : null,
        registrationStartAt: new Date(registrationStartAt),
        registrationEndAt: new Date(registrationEndAt),
        startAt: new Date(startAt),
        created_by: req.user.userId,
        created_at: new Date(),
        updated_at: new Date(),
        isActive: true,
      },
    });

    return res.json({ success: true, data: tournament });
  } catch (err) {
    console.error('Create tournament error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Register a player for a tournament
 * POST /api/tournaments/:tournamentId/register
 */
async function registerPlayer(req, res) {
  try {
    const { tournamentId } = req.params;
    const userId = req.user.userId;

    const tournament = await prisma.tournaments.findUnique({
      where: { id: parseInt(tournamentId) },
    });
    if (!tournament || tournament.status !== 'registration_open') {
      return res.status(400).json({ success: false, message: 'Tournament not found or registration closed' });
    }

    const existingPlayer = await prisma.tournament_players.findFirst({
      where: { tournamentId: parseInt(tournamentId), userId },
    });
    if (existingPlayer) {
      return res.status(400).json({ success: false, message: 'Already registered' });
    }

    const playerCount = await prisma.tournament_players.count({
      where: { tournamentId: parseInt(tournamentId) },
    });
    if (playerCount >= tournament.maxPlayers) {
      return res.status(400).json({ success: false, message: 'Tournament full' });
    }

    const player = await prisma.tournament_players.create({
      data: {
        tournamentId: parseInt(tournamentId),
        userId,
        status: 'registered',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return res.json({ success: true, data: player });
  } catch (err) {
    console.error('Register player error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Update tournament match result
 * PUT /api/tournaments/matches/:matchId
 */
async function updateMatchResult(req, res) {
  try {
    const { matchId } = req.params;
    const { winnerId, scorePlayer1, scorePlayer2 } = req.body;

    const match = await prisma.tournament_matches.findUnique({
      where: { id: parseInt(matchId) },
    });
    if (!match || match.status !== 'in_progress') {
      return res.status(400).json({ success: false, message: 'Match not found or not in progress' });
    }

    if (!winnerId || scorePlayer1 == null || scorePlayer2 == null) {
      return res.status(400).json({ success: false, message: 'Required: winnerId, scorePlayer1, scorePlayer2' });
    }

    const loserId = winnerId === match.player1_id ? match.player2_id : match.player1_id;
    const updatedMatch = await prisma.tournament_matches.update({
      where: { id: parseInt(matchId) },
      data: {
        winner_id: parseInt(winnerId),
        loser_id: loserId ? parseInt(loserId) : null,
        scorePlayer1: parseInt(scorePlayer1),
        scorePlayer2: parseInt(scorePlayer2),
        status: 'completed',
        endAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return res.json({ success: true, data: updatedMatch });
  } catch (err) {
    console.error('Update match result error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

module.exports = {
  createTournament: [authenticate, createTournament],
  registerPlayer: [authenticate, registerPlayer],
  updateMatchResult: [authenticate, updateMatchResult],
};