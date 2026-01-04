// middleware/rateLimiter.cjs
// Rate limiting middleware to prevent brute-force and DDoS attacks

const rateLimit = require('express-rate-limit');

function resolveClientIp(req) {
  if (!req) return 'unknown';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  if (req.ip) return req.ip;
  if (req.connection?.remoteAddress) return req.connection.remoteAddress;
  if (req.socket?.remoteAddress) return req.socket.remoteAddress;
  return 'unknown';
}

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
  // Disable in dev, and also skip waitlist endpoints in production to avoid blocking joins/polling
  skip: (req) => {
    if (process.env.NODE_ENV !== 'production') return true;
    const url = req?.originalUrl || '';
    return (
      url.startsWith('/api/health') ||
      url.startsWith('/api/diag') ||
      url.startsWith('/api/waitlist')
    );
  },
  keyGenerator: resolveClientIp,
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
  keyGenerator: resolveClientIp,
});

/**
 * Moderate rate limiter for game endpoints
 * 30 requests per IP per 15 min
 */
const gameLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Must allow periodic gameplay polling and Socket.IO fallback patterns.
  // 600 / 15 min ~= 40 req/min (~0.67 req/s) per client.
  max: 600,
  message: 'Too many game requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV !== 'production',
  keyGenerator: resolveClientIp,
});

module.exports = {
  apiLimiter,
  authLimiter,
  gameLimiter,
};
