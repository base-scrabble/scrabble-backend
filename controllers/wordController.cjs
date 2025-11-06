const { prisma } = require('../lib/prisma.cjs');
const wordValidator = require('../services/wordValidator.cjs');
const { authenticate } = require('../middleware/auth.cjs');

/**
 * Get all valid words with pagination
 * GET /api/words
 */
async function getWords(req, res) {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const where = search ? { word: { contains: search, mode: 'insensitive' } } : {};

    const [words, count] = await Promise.all([
      prisma.words.findMany({
        where,
        skip: offset,
        take: parseInt(limit),
        orderBy: { word: 'asc' },
      }),
      prisma.words.count({ where }),
    ]);

    return res.json({
      success: true,
      data: words,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / limit) },
    });
  } catch (err) {
    console.error('Get words error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch words', error: err.message });
  }
}

/**
 * Validate a single word
 * GET /api/words/validate/:word
 */
async function validateWord(req, res) {
  try {
    const { word } = req.params;

    if (!word) {
      return res.status(400).json({ success: false, message: 'Word required' });
    }

    const isValid = await wordValidator.isValidWord(word);
    const wordRecord = await prisma.words.findFirst({
      where: { word: word.toLowerCase() },
    });

    return res.json({
      success: true,
      word: word.toUpperCase(),
      isValid: isValid && !!wordRecord,
      message: isValid && wordRecord ? 'Valid word' : 'Invalid word',
    });
  } catch (err) {
    console.error('Word validation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Validate multiple words
 * POST /api/words/validate
 */
async function validateWords(req, res) {
  try {
    const { words } = req.body;

    if (!words || !Array.isArray(words)) {
      return res.status(400).json({ success: false, message: 'Words array required' });
    }

    const validation = await wordValidator.validateWords(words);
    const dbWords = await prisma.words.findMany({
      where: { word: { in: words.map(w => w.toLowerCase()) } },
    });
    const validDbWords = dbWords.map(w => w.word.toLowerCase());

    return res.json({
      success: true,
      validWords: validation.valid.filter(w => validDbWords.includes(w.toLowerCase())),
      invalidWords: validation.invalid.concat(validation.valid.filter(w => !validDbWords.includes(w.toLowerCase()))),
      validCount: validation.valid.filter(w => validDbWords.includes(w.toLowerCase())).length,
      invalidCount: validation.invalid.length + validation.valid.filter(w => !validDbWords.includes(w.toLowerCase())).length,
    });
  } catch (err) {
    console.error('Batch word validation error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Search words by pattern
 * GET /api/words/search
 */
async function searchWords(req, res) {
  try {
    const { pattern, limit = 10 } = req.query;

    if (!pattern) {
      return res.status(400).json({ success: false, message: 'Pattern required' });
    }

    const matches = await wordValidator.searchWords(pattern, parseInt(limit));
    const dbMatches = await prisma.words.findMany({
      where: { word: { in: matches.map(w => w.toLowerCase()) } },
      take: parseInt(limit),
    });

    return res.json({
      success: true,
      pattern,
      matches: dbMatches.map(w => w.word),
      count: dbMatches.length,
    });
  } catch (err) {
    console.error('Word search error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

/**
 * Get dictionary statistics
 * GET /api/words/stats
 */
async function getStats(req, res) {
  try {
    const stats = await wordValidator.getStats();
    const totalWords = await prisma.words.count();

    return res.json({
      success: true,
      dictionary: { ...stats, totalWords },
    });
  } catch (err) {
    console.error('Dictionary stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

module.exports = {
  getWords,
  validateWord,
  validateWords: [authenticate, validateWords],
  searchWords,
  getStats,
};