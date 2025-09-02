const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { hashPassword, comparePassword, generateToken, authenticate } = require('../middleware/auth');
const signatureService = require('../services/signatureService');
const nonceService = require('../services/nonceService');

/**
 * @route POST /api/auth/register
 * @desc Register a new user
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and password are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({
      where: {
        $or: [{ email }, { username }]
      }
    });
    
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }
    
    // Hash password and create user
    const hashedPassword = await hashPassword(password);
    const user = await User.create({
      username,
      email,
      password: hashedPassword
    });
    
    // Generate token
    const token = generateToken({ userId: user.id, username: user.username });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon
        },
        token
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login user
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }
    
    // Find user
    const user = await User.findOne({ where: { email } });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check password
    const isValidPassword = await comparePassword(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }
    
    // Generate token
    const token = generateToken({ userId: user.id, username: user.username });
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore,
          gamesPlayed: user.gamesPlayed,
          gamesWon: user.gamesWon
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
});

/**
 * @route GET /api/auth/profile
 * @desc Get user profile
 * @access Private
 */
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: ['id', 'username', 'email', 'totalScore', 'gamesPlayed', 'gamesWon', 'createdAt']
    });
    
    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch profile'
    });
  }
});

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { username, email } = req.body;
    const userId = req.user.id;
    
    // Check if username/email is already taken by another user
    if (username || email) {
      const existingUser = await User.findOne({
        where: {
          $or: [
            username ? { username } : null,
            email ? { email } : null
          ].filter(Boolean),
          id: { $ne: userId }
        }
      });
      
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username or email already taken'
        });
      }
    }
    
    // Update user
    await User.update(
      { ...(username && { username }), ...(email && { email }) },
      { where: { id: userId } }
    );
    
    // Fetch updated user
    const updatedUser = await User.findByPk(userId, {
      attributes: ['id', 'username', 'email', 'totalScore', 'gamesPlayed', 'gamesWon']
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;
    
    // Validation
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }
    
    // Get user with password
    const user = await User.findByPk(userId);
    
    // Verify current password
    const isValidPassword = await comparePassword(currentPassword, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Hash new password and update
    const hashedNewPassword = await hashPassword(newPassword);
    await User.update(
      { password: hashedNewPassword },
      { where: { id: userId } }
    );
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
});

/**
 * @route POST /api/auth/deposit-signature
 * @desc Generate backend signature for ETH deposit
 * @access Private
 */
router.post('/deposit-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, amount } = req.body;
    
    if (!userAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User address and amount are required'
      });
    }

    // Check if signature service is enabled
    if (!signatureService.isEnabled) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain signature service not available - check environment configuration'
      });
    }

    // Validate user is KYC approved (implement your KYC logic)
    const user = await User.findByPk(req.user.id);
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for deposits'
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
    console.error('Deposit signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate deposit signature',
      error: error.message
    });
  }
});

/**
 * @route POST /api/auth/withdraw-signature
 * @desc Generate backend signature for ETH withdrawal
 * @access Private
 */
router.post('/withdraw-signature', authenticate, async (req, res) => {
  try {
    const { userAddress, amount } = req.body;
    
    if (!userAddress || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User address and amount are required'
      });
    }

    // Check if signature service is enabled
    if (!signatureService.isEnabled) {
      return res.status(503).json({
        success: false,
        message: 'Blockchain signature service not available - check environment configuration'
      });
    }

    // Validate user is KYC approved
    const user = await User.findByPk(req.user.id);
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'User account not approved for withdrawals'
      });
    }

    // TODO: Check user's on-chain balance before signing
    // const balance = await walletContract.getBalance(userAddress, tokenAddress);
    // if (balance < amount) {
    //   return res.status(400).json({
    //     success: false,
    //     message: 'Insufficient balance'
    //   });
    // }

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
    console.error('Withdraw signature error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate withdrawal signature',
      error: error.message
    });
  }
});

module.exports = router;
