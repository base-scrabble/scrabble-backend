// routes/gameRoutes.cjs
const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.cjs');
const { authenticate } = require('../middleware/auth.cjs');
const signatureService = require('../services/signatureService.cjs');
const nonceService = require('../services/nonceService.cjs');
const { listGames } = require('../controllers/gameController.cjs');

console.log('Game signature routes loaded'); // ← ADDED

/**
 * @route POST /api/game/create-signature
 * @desc Generate backend signature for game creation
 * @access Private
 */
router.post('/create-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, stakeAmount } = req.body;

    if (!userAddress || !stakeAmount) {
      return res.status(400).json({
        success: false,
        message: 'User address and stake amount are required',
      });
    }

    // Validate user is approved for game creation
    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user?.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for game creation',
      });
    }

    // Validate stake amount is within acceptable range
    const minStake = parseFloat(process.env.MIN_STAKE_AMOUNT) || 0.001;
    const maxStake = parseFloat(process.env.MAX_STAKE_AMOUNT) || 10;

    if (stakeAmount < minStake || stakeAmount > maxStake) {
      return res.status(400).json({
        success: false,
        message: `Stake amount must be between ${minStake} and ${maxStake} ETH`,
      });
    }

    // Get current nonce for the user
    const nonce = await nonceService.getCurrentNonce(userAddress);

    // Generate EIP-712 signature
    const signature = await signatureService.generateAuthSignature(userAddress, nonce);

    res.json({
      success: true,
      data: {
        signature,
        nonce,
        backendSigner: signatureService.getBackendSignerAddress(),
      },
    });
  } catch (error) {
    console.error('Create game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate game creation signature',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/game/join-signature
 * @desc Generate backend signature for joining a game
 * @access Private
 */
router.post('/join-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, gameId } = req.body;

    if (!userAddress || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'User address and game ID are required',
      });
    }

    // Validate user is approved for joining games
    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user?.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for joining games',
      });
    }

    // Check if game exists and is joinable
    const game = await prisma.games.findUnique({ where: { id: parseInt(gameId) } });
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Game is not available for joining',
      });
    }

    // Check if user is already in the game
    const existingPlayer = await prisma.game_players.findFirst({
      where: { gameId: parseInt(gameId), userId: req.user.id },
    });

    if (existingPlayer) {
      return res.status(400).json({
        success: false,
        message: 'User already joined this game',
      });
    }

    // Get current nonce for the user
    const nonce = await nonceService.getCurrentNonce(userAddress);

    // Generate EIP-712 signature
    const signature = await signatureService.generateAuthSignature(userAddress, nonce);

    res.json({
      success: true,
      data: {
        signature,
        nonce,
        backendSigner: signatureService.getBackendSignerAddress(),
      },
    });
  } catch (error) {
    console.error('Join game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate join game signature',
      error: error.message,
    });
  }
});

/**
 * @route POST /api/game/cancel-signature
 * @desc Generate backend signature for game cancellation
 * @access Private
 */
router.post('/cancel-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, gameId } = req.body;

    if (!userAddress || !gameId) {
      return res.status(400).json({
        success: false,
        message: 'User address and game ID are required',
      });
    }

    // Check if game exists and user is the creator
    const game = await prisma.games.findUnique({ where: { id: parseInt(gameId) } });
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found',
      });
    }

    if (game.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only game creator can cancel the game',
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Game cannot be cancelled in current state',
      });
    }

    // Get current nonce for the user
    const nonce = await nonceService.getCurrentNonce(userAddress);

    // Generate EIP-712 signature
    const signature = await signatureService.generateAuthSignature(userAddress, nonce);

    res.json({
      success: true,
      data: {
        signature,
        nonce,
        backendSigner: signatureService.getBackendSignerAddress(),
      },
    });
  } catch (error) {
    console.error('Cancel game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cancel game signature',
      error: error.message,
    });
  }
});

// Legacy compatibility endpoint for clients still calling /api/game/public
router.get('/public', listGames);

module.exports = router;