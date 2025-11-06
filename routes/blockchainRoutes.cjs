const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.cjs');
const blockchainService = require('../services/blockchainService.cjs');
const { authenticateAdmin } = require('../middleware/adminAuth.cjs');

/**
 * @route POST /api/blockchain/tournament-winner
 * @desc Report tournament winner to smart contract
 * @access Private (Admin)
 */
router.post('/tournament-winner', authenticateAdmin, async (req, res) => {
  try {
    const { tournamentId, winnerId, prizeAmount } = req.body;

    // Validate tournament exists and is completed
    const tournament = await prisma.tournaments.findUnique({
      where: { id: parseInt(tournamentId) },
      include: { winner: true },
    });

    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: 'Tournament not found',
      });
    }

    if (tournament.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Tournament must be completed before reporting winner',
      });
    }

    // Get winner details
    const winner = await prisma.users.findUnique({ where: { id: parseInt(winnerId) } });
    if (!winner) {
      return res.status(404).json({
        success: false,
        message: 'Winner not found',
      });
    }

    // Check if blockchain service is configured
    if (!blockchainService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain service not configured. Please set SMART_CONTRACT_ADDRESS and WALLET_PRIVATE_KEY environment variables.',
      });
    }

    // Report to blockchain
    const result = await blockchainService.reportTournamentWinner({
      tournamentId: tournament.id,
      winnerId: winner.id,
      winnerAddress: winner.address || '0x0000000000000000000000000000000000000000',
      prizeAmount: prizeAmount || tournament.prizePool || 0,
    });

    if (result.success) {
      // Update tournament with blockchain transaction hash
      await prisma.tournaments.update({
        where: { id: parseInt(tournamentId) },
        data: {
          blockchainTx: result.transactionHash,
          blockchainSubmitted: true,
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: 'Tournament winner reported to blockchain successfully',
        data: {
          tournament: tournament.name,
          winner: winner.username,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to report to blockchain',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Tournament winner blockchain reporting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/blockchain/game-winner
 * @desc Report individual game winner to smart contract
 * @access Private (Admin)
 */
router.post('/game-winner', authenticateAdmin, async (req, res) => {
  try {
    const { gameId, winnerId, finalScore } = req.body;

    // Validate game exists and is completed
    const game = await prisma.tournament_matches.findUnique({
      where: { id: parseInt(gameId) },
      include: { tournament: true, winner: true },
    });

    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
      });
    }

    if (game.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Game must be completed before reporting winner',
      });
    }

    // Get winner details
    const winner = await prisma.users.findUnique({ where: { id: parseInt(winnerId) } });
    if (!winner) {
      return res.status(404).json({
        success: false,
        message: 'Winner not found',
      });
    }

    // Check if blockchain service is configured
    if (!blockchainService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain service not configured',
      });
    }

    // Report to blockchain
    const result = await blockchainService.reportGameWinner({
      tournamentId: game.tournamentId,
      gameId: game.id,
      winnerId: winner.id,
      winnerAddress: winner.address || '0x0000000000000000000000000000000000000000',
      finalScore: finalScore || game.finalScore || 0,
    });

    if (result.success) {
      // Update game with blockchain transaction hash
      await prisma.tournament_matches.update({
        where: { id: parseInt(gameId) },
        data: {
          blockchainTx: result.transactionHash,
          blockchainSubmitted: true,
          updatedAt: new Date(),
        },
      });

      res.json({
        success: true,
        message: 'Game winner reported to blockchain successfully',
        data: {
          game: `Game ${game.id}`,
          tournament: game.tournament.name,
          winner: winner.username,
          transactionHash: result.transactionHash,
          blockNumber: result.blockNumber,
        },
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to report to blockchain',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Game winner blockchain reporting error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/blockchain/tournament/:id/winner
 * @desc Get tournament winner from smart contract
 * @access Public
 */
router.get('/tournament/:id/winner', async (req, res) => {
  try {
    const { id } = req.params;

    if (!blockchainService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain service not configured',
      });
    }

    const result = await blockchainService.getTournamentWinner(id);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to get winner from blockchain',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Get tournament winner error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * @route GET /api/blockchain/status
 * @desc Get blockchain service status
 * @access Private (Admin)
 */
router.get('/status', authenticateAdmin, async (req, res) => {
  try {
    const status = blockchainService.getStatus();

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Blockchain status error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/blockchain/estimate-gas
 * @desc Estimate gas cost for tournament winner reporting
 * @access Private (Admin)
 */
router.post('/estimate-gas', authenticateAdmin, async (req, res) => {
  try {
    const { tournamentId, winnerId, prizeAmount } = req.body;

    if (!blockchainService.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain service not configured',
      });
    }

    // Get winner details for address
    const winner = await prisma.users.findUnique({ where: { id: parseInt(winnerId) } });
    if (!winner) {
      return res.status(404).json({
        success: false,
        message: 'Winner not found',
      });
    }

    const result = await blockchainService.estimateGas({
      tournamentId,
      winnerId,
      winnerAddress: winner.address || '0x0000000000000000000000000000000000000000',
      prizeAmount: prizeAmount || 0,
    });

    if (result.success) {
      res.json({
        success: true,
        data: result,
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to estimate gas',
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Gas estimation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});

module.exports = router;
