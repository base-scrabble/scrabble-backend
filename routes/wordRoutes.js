const express = require('express');
const router = express.Router();
const wordValidator = require('../services/wordValidator');

/**
 * @route GET /api/words/validate/:word
 * @desc Validate a single word
 * @access Public
 */
router.get('/validate/:word', (req, res) => {
  try {
    const { word } = req.params;
    
    if (!word) {
      return res.status(400).json({
        success: false,
        message: 'Word parameter is required'
      });
    }

    const isValid = wordValidator.isValidWord(word);
    
    res.json({
      success: true,
      word: word.toUpperCase(),
      isValid,
      message: isValid ? 'Word is valid' : 'Word not found in dictionary'
    });
  } catch (error) {
    console.error('Word validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route POST /api/words/validate
 * @desc Validate multiple words
 * @access Public
 */
router.post('/validate', (req, res) => {
  try {
    const { words } = req.body;
    
    if (!words || !Array.isArray(words)) {
      return res.status(400).json({
        success: false,
        message: 'Words array is required'
      });
    }

    const validation = wordValidator.validateWords(words);
    
    res.json({
      success: true,
      totalWords: words.length,
      validWords: validation.valid,
      invalidWords: validation.invalid,
      validCount: validation.valid.length,
      invalidCount: validation.invalid.length
    });
  } catch (error) {
    console.error('Batch word validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route GET /api/words/search
 * @desc Search for words by pattern
 * @access Public
 */
router.get('/search', (req, res) => {
  try {
    const { pattern, limit = 10 } = req.query;
    
    if (!pattern) {
      return res.status(400).json({
        success: false,
        message: 'Pattern parameter is required'
      });
    }

    const matches = wordValidator.searchWords(pattern, parseInt(limit));
    
    res.json({
      success: true,
      pattern,
      matches,
      count: matches.length
    });
  } catch (error) {
    console.error('Word search error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route GET /api/words/stats
 * @desc Get dictionary statistics
 * @access Public
 */
router.get('/stats', (req, res) => {
  try {
    const stats = wordValidator.getStats();
    
    res.json({
      success: true,
      dictionary: stats
    });
  } catch (error) {
    console.error('Dictionary stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
