const express = require('express');
const router = express.Router();
const blockchainService = require('../services/blockchainService');
const { Tournament, TournamentMatch, User } = require('../models');
const { authenticateAdmin } = require('../middleware/adminAuth');

/**
 * @route POST /api/blockchain/tournament-winner
 * @desc Report tournament winner to smart contract
 * @access Private (Admin)
 */
router.post('/tournament-winner', authenticateAdmin, async (req, res) => {
    try {
        const { tournamentId, winnerId, prizeAmount } = req.body;

        // Validate tournament exists and is completed
        const tournament = await Tournament.findByPk(tournamentId, {
            include: [{ model: User, as: 'Winner' }]
        });

        if (!tournament) {
            return res.status(404).json({
                success: false,
                message: 'Tournament not found'
            });
        }

        if (tournament.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Tournament must be completed before reporting winner'
            });
        }

        // Get winner details
        const winner = await User.findByPk(winnerId);
        if (!winner) {
            return res.status(404).json({
                success: false,
                message: 'Winner not found'
            });
        }

        // Check if blockchain service is configured
        if (!blockchainService.isConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Blockchain service not configured. Please set SMART_CONTRACT_ADDRESS and WALLET_PRIVATE_KEY environment variables.'
            });
        }

        // Report to blockchain
        const result = await blockchainService.reportTournamentWinner({
            tournamentId: tournament.id,
            winnerId: winner.id,
            winnerAddress: winner.walletAddress || '0x0000000000000000000000000000000000000000',
            prizeAmount: prizeAmount || tournament.prizePool || 0
        });

        if (result.success) {
            // Update tournament with blockchain transaction hash
            await tournament.update({
                blockchainTxHash: result.transactionHash,
                blockchainReported: true
            });

            res.json({
                success: true,
                message: 'Tournament winner reported to blockchain successfully',
                data: {
                    tournament: tournament.name,
                    winner: winner.username,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to report to blockchain',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Tournament winner blockchain reporting error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
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
        const game = await TournamentMatch.findByPk(gameId, {
            include: [
                { model: Tournament },
                { model: User, as: 'Winner' }
            ]
        });

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        if (game.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Game must be completed before reporting winner'
            });
        }

        // Get winner details
        const winner = await User.findByPk(winnerId);
        if (!winner) {
            return res.status(404).json({
                success: false,
                message: 'Winner not found'
            });
        }

        // Check if blockchain service is configured
        if (!blockchainService.isConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'Blockchain service not configured'
            });
        }

        // Report to blockchain
        const result = await blockchainService.reportGameWinner({
            tournamentId: game.Tournament.id,
            gameId: game.id,
            winnerId: winner.id,
            winnerAddress: winner.walletAddress || '0x0000000000000000000000000000000000000000',
            finalScore: finalScore || game.finalScore || 0
        });

        if (result.success) {
            // Update game with blockchain transaction hash
            await game.update({
                blockchainTxHash: result.transactionHash,
                blockchainReported: true
            });

            res.json({
                success: true,
                message: 'Game winner reported to blockchain successfully',
                data: {
                    game: `Game ${game.id}`,
                    tournament: game.Tournament.name,
                    winner: winner.username,
                    transactionHash: result.transactionHash,
                    blockNumber: result.blockNumber
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to report to blockchain',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Game winner blockchain reporting error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
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
                message: 'Blockchain service not configured'
            });
        }

        const result = await blockchainService.getTournamentWinner(id);

        if (result.success) {
            res.json({
                success: true,
                data: result.data
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to get winner from blockchain',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Get tournament winner error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
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
            data: status
        });
    } catch (error) {
        console.error('Blockchain status error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
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
                message: 'Blockchain service not configured'
            });
        }

        // Get winner details for address
        const winner = await User.findByPk(winnerId);
        if (!winner) {
            return res.status(404).json({
                success: false,
                message: 'Winner not found'
            });
        }

        const result = await blockchainService.estimateGas({
            tournamentId,
            winnerId,
            winnerAddress: winner.walletAddress || '0x0000000000000000000000000000000000000000',
            prizeAmount: prizeAmount || 0
        });

        if (result.success) {
            res.json({
                success: true,
                data: result
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to estimate gas',
                error: result.error
            });
        }
    } catch (error) {
        console.error('Gas estimation error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

module.exports = router;
