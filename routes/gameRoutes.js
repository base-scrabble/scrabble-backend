const express = require('express');
const router = express.Router();
const { Game, User, GamePlayer } = require('../models');
const { authenticate } = require('../middleware/auth');
const signatureService = require('../services/signatureService');
const nonceService = require('../services/nonceService');

/**
 * @route POST /api/game/create-signature
 * @desc Generate backend signature for game creation
 * @access Private
 */
router.post('/create-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, stakeAmount, tokenAddress } = req.body;
    
    if (!userAddress || !stakeAmount) {
      return res.status(400).json({
        success: false,
        message: 'User address and stake amount are required'
      });
    }

    // Validate user is approved for game creation
    const user = await User.findByPk(req.user.id);
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for game creation'
      });
    }

    // Validate stake amount is within acceptable range
    const minStake = parseFloat(process.env.MIN_STAKE_AMOUNT) || 0.001;
    const maxStake = parseFloat(process.env.MAX_STAKE_AMOUNT) || 10;
    
    if (stakeAmount < minStake || stakeAmount > maxStake) {
      return res.status(400).json({
        success: false,
        message: `Stake amount must be between ${minStake} and ${maxStake} ETH`
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
        backendSigner: signatureService.getBackendSignerAddress()
      }
    });
  } catch (error) {
    console.error('Create game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate game creation signature',
      error: error.message
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
        message: 'User address and game ID are required'
      });
    }

    // Validate user is approved for joining games
    const user = await User.findByPk(req.user.id);
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for joining games'
      });
    }

    // Check if game exists and is joinable
    const game = await Game.findByPk(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Game is not available for joining'
      });
    }

    // Check if user is already in the game
    const existingPlayer = await GamePlayer.findOne({
      where: { gameId, userId: req.user.id }
    });

    if (existingPlayer) {
      return res.status(400).json({
        success: false,
        message: 'User already joined this game'
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
        backendSigner: signatureService.getBackendSignerAddress()
      }
    });
  } catch (error) {
    console.error('Join game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate join game signature',
      error: error.message
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
        message: 'User address and game ID are required'
      });
    }

    // Check if game exists and user is the creator
    const game = await Game.findByPk(gameId);
    if (!game) {
      return res.status(404).json({
        success: false,
        message: 'Game not found'
      });
    }

    if (game.createdBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only game creator can cancel the game'
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({
        success: false,
        message: 'Game cannot be cancelled in current state'
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
        backendSigner: signatureService.getBackendSignerAddress()
      }
    });
  } catch (error) {
    console.error('Cancel game signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cancel game signature',
      error: error.message
    });
  }
});

module.exports = router;
