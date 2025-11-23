// middleware/rateLimiter.cjs
// Rate limiting middleware to prevent brute-force and DDoS attacks

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter (15 min window)
 * 100 requests per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: (req) => process.env.NODE_ENV !== 'production', // Disable in dev
});

/**
 * Strict rate limiter for auth endpoints
 * 5 requests per IP per 15 min
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // very strict for auth
  message: 'Too many auth attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
});

/**
 * Moderate rate limiter for game endpoints
 * 30 requests per IP per 15 min
 */
const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many game requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
});

module.exports = {
  apiLimiter,
  authLimiter,
  gameLimiter,
};
