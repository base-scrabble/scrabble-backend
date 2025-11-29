// routes/authRoutes.cjs
const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.cjs');
const { generateToken, authMiddleware } = require('../middleware/auth.cjs');
const signatureService = require('../services/signatureService.cjs');
const nonceService = require('../services/nonceService.cjs');
const { ensureUser } = require('../controllers/userController.cjs');

/**
 * @route GET /api/auth/check
 * @desc Lightweight auth service health check used by clients
 */
router.get('/check', (req, res) => {
  res.json({ success: true, message: 'Auth service reachable', timestamp: new Date().toISOString() });
});

/**
 * @route POST /api/auth/register
 * @desc Register/ensure user via Privy JWT
 * @access Public
 */
router.post('/register', async (req, res) => {
  try {
    const { wallet_address, email, sub, username } = req.body;

    if (!wallet_address || !email || !sub) {
      return res.status(400).json({
        success: false,
        message: 'wallet_address, email, and sub are required',
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format',
      });
    }

    const user = await ensureUser(req, res, { wallet_address, email, sub, username });
    if (!user) return; // ensureUser already sent error

    const token = generateToken({ userId: user.id, username: user.username });

    res.status(201).json({
      success: true,
      message: 'User registered/ensured successfully',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore || 0,
          gamesPlayed: user.gamesPlayed || 0,
          gamesWon: user.gamesWon || 0,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message,
      });
    }
  }
});

/**
 * @route POST /api/auth/login
 * @desc Login/ensure user via Privy JWT
 * @access Public
 */
router.post('/login', async (req, res) => {
  try {
    const { wallet_address, email, sub, username } = req.body;

    if (!wallet_address || !email || !sub) {
      return res.status(400).json({
        success: false,
        message: 'wallet_address, email, and sub are required',
      });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format',
      });
    }

    const user = await ensureUser(req, res, { wallet_address, email, sub, username });
    if (!user) return;

    const token = generateToken({ userId: user.id, username: user.username });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          totalScore: user.totalScore || 0,
          gamesPlayed: user.gamesPlayed || 0,
          gamesWon: user.gamesWon || 0,
        },
        token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message,
      });
    }
  }
});

/**
 * @route GET /api/auth/profile
 * @desc Get user profile
 * @access Private
 */
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        totalScore: true,
        gamesPlayed: true,
        gamesWon: true,
        createdAt: true,
      },
    });

    res.json({
      success: true,
      data: { user },
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch profile',
      });
    }
  }
});

/**
 * @route PUT /api/auth/profile
 * @desc Update user profile
 * @access Private
 */
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, email } = req.body;
    const userId = req.user.id;

    if (username || email) {
      const existingUser = await prisma.users.findFirst({
        where: {
          OR: [
            username ? { username } : null,
            email ? { email } : null,
          ].filter(Boolean),
          id: { not: userId },
        },
      });

      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'Username or email already taken',
        });
      }
    }

    await prisma.users.update({
      where: { id: userId },
      data: { ...(username && { username }), ...(email && { email }), updatedAt: new Date() },
    });

    const updatedUser = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        totalScore: true,
        gamesPlayed: true,
        gamesWon: true,
      },
    });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user: updatedUser },
    });
  } catch (error) {
    console.error('Profile update error:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
      });
    }
  }
});

/**
 * @route POST /api/auth/change-password
 * @desc Change user password
 * @access Private
 */
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long',
      });
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user?.password) {
      return res.status(400).json({ success: false, message: 'Password not set' });
    }

    // Assuming you have bcrypt imported somewhere or use a helper
    const bcrypt = require('bcrypt');
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await prisma.users.update({
      where: { id: userId },
      data: { password: hashedNewPassword, updatedAt: new Date() },
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to change password' });
    }
  }
});

/**
 * @route POST /api/auth/deposit-signature
 */
router.post('/deposit-signature', authMiddleware, async (req, res) => {
  try {
    const { userAddress, amount } = req.body;

    if (!userAddress || !amount) {
      return res.status(400).json({ success: false, message: 'User address and amount are required' });
    }

    if (!signatureService.isEnabled) {
      return res.status(503).json({ success: false, message: 'Blockchain signature service not available' });
    }

    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user?.isActive) {
      return res.status(403).json({ success: false, message: 'User account not approved for deposits' });
    }

    const nonce = await nonceService.getCurrentNonce(userAddress);
    const signature = await signatureService.generateAuthSignature(userAddress, nonce);

    res.json({
      success: true,
      data: { signature, nonce, backendSigner: signatureService.getBackendSignerAddress() },
    });
  } catch (error) {
    console.error('Deposit signature error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate deposit signature', error: error.message });
    }
  }
});

/**
 * @route POST /api/auth/withdraw-signature
 */
router.post('/withdraw-signature', authMiddleware, async (req, res) => {
  try {
    const { userAddress, amount } = req.body;

    if (!userAddress || !amount) {
      return res.status(400).json({ success: false, message: 'User address and amount are required' });
    }

    if (!signatureService.isEnabled) {
      return res.status(503).json({ success: false, message: 'Blockchain signature service not available' });
    }

    const user = await prisma.users.findUnique({ where: { id: req.user.id } });
    if (!user?.isActive) {
      return res.status(403).json({ success: false, message: 'User account not approved for withdrawals' });
    }

    const nonce = await nonceService.getCurrentNonce(userAddress);
    const signature = await signatureService.generateAuthSignature(userAddress, nonce);

    res.json({
      success: true,
      data: { signature, nonce, backendSigner: signatureService.getBackendSignerAddress() },
    });
  } catch (error) {
    console.error('Withdraw signature error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate withdrawal signature', error: error.message });
    }
  }
});

module.exports = router;