// routes/wordRoutes.cjs
// ✅ Final replacement by assistant — trimmed to delegate to your real wordController.cjs
// ✅ Purpose: Connect real /api/words endpoints to controller logic
// ✅ Additions commented below
// ---------------------------------------------------------------

const express = require('express');
const router = express.Router();
const wordController = require('../controllers/wordController.cjs');

// Added by assistant: startup confirmation
console.log('Word routes loaded (connected to controllers/wordController.cjs)');

/**
 * @route POST /api/words/validate
 * @desc Validate a submitted word against the built-in dictionary
 * @access Public
 */
router.post('/validate', async (req, res) => {
  try {
    // Added by assistant: ensure word is provided
    const { word } = req.body;
    if (!word) {
      return res.status(400).json({ success: false, message: 'Word is required' });
    }

    // Delegate to controller
    if (typeof wordController.validateWord === 'function') {
      return await wordController.validateWord(req, res);
    }

    // Added by assistant: if controller function missing
    return res.status(501).json({ success: false, message: 'validateWord not implemented in wordController' });
  } catch (err) {
    console.error('Error in POST /api/words/validate:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

/**
 * @route GET /api/words/dictionary
 * @desc Retrieve the list of words or dictionary info
 * @access Public
 */
router.get('/dictionary', async (req, res) => {
  try {
    if (typeof wordController.getDictionary === 'function') {
      return await wordController.getDictionary(req, res);
    }

    // Added by assistant: if function not defined
    return res.status(501).json({ success: false, message: 'getDictionary not implemented in wordController' });
  } catch (err) {
    console.error('Error in GET /api/words/dictionary:', err.message);
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
});

// Optional: small ping route for debugging
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Word routes active and controller linked' });
});

// ---------------------------------------------------------------
module.exports = router;