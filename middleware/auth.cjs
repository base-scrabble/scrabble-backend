// middleware/auth.cjs
const jwt = require('jsonwebtoken');
const { prisma } = require('../lib/prisma.cjs');
const { verifyPrivyToken } = require('./verifyPrivyToken.cjs');
const bcrypt = require('bcrypt');

/**
 * Hash password using bcrypt
 * @param {string} password - Plain text password
 * @returns {string} - Hashed password
 */
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {boolean} - True if passwords match
 */
const comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generate JWT token
 * @param {Object} payload - { userId, username }
 * @returns {string} - JWT token
 */
const generateToken = (payload) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET not configured');
  }
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

/**
 * Authentication middleware
 * Verifies Privy token and adds user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    verifyPrivyToken(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  } catch (error) {
    console.error('Authentication error:', error.message);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: error.message
      });
    }
  }
};

/**
 * Optional authentication middleware
 * Adds user if token valid, continues if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      verifyPrivyToken(req, res, (err) => {
        if (err) return next(); // ignore error, continue
        next();
      });
    } else {
      req.user = null;
      next();
    }
  } catch (error) {
    req.user = null;
    next();
  }
};

/**
 * Combined auth middleware
 */
const authMiddleware = [verifyPrivyToken, authenticate];

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,     // ← NOW EXPORTED
  authenticate,
  optionalAuth,
  authMiddleware
};