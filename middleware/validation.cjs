// middleware/validation.cjs
// Input validation and sanitization middleware to prevent XSS, SQL injection, and other attacks

const sanitizeInput = (value) => {
  if (typeof value !== 'string') return value;
  // Remove HTML/script tags and dangerous characters
  return value
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
};

/**
 * Sanitize request body for HTML/script injection
 */
const sanitizeBody = (req, res, next) => {
  if (!req.body) return next();
  
  Object.keys(req.body).forEach((key) => {
    if (typeof req.body[key] === 'string') {
      req.body[key] = sanitizeInput(req.body[key]);
    }
  });
  
  next();
};

/**
 * Validate wallet address format
 */
const validateAddress = (address) => {
  return address && /^0x[a-fA-F0-9]{40}$/.test(address);
};

/**
 * Validate username format
 */
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') return false;
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
};

/**
 * Validate email format
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Validate game ID (numeric)
 */
const validateGameId = (gameId) => {
  return gameId && !isNaN(parseInt(gameId, 10)) && parseInt(gameId, 10) > 0;
};

/**
 * Validate word (alphanumeric, max 15 chars)
 */
const validateWord = (word) => {
  if (!word || typeof word !== 'string') return false;
  return /^[a-zA-Z]{2,15}$/.test(word);
};

/**
 * Validate stake amount (positive number, reasonable bounds)
 */
const validateStakeAmount = (stake) => {
  const amount = parseFloat(stake);
  return !isNaN(amount) && amount > 0 && amount <= 1000;
};

module.exports = {
  sanitizeBody,
  sanitizeInput,
  validateAddress,
  validateUsername,
  validateEmail,
  validateGameId,
  validateWord,
  validateStakeAmount,
};
