const express = require('express');
const router = express.Router();
const { joinWaitlist, getReferralStats, getReferralCount, getRecentReferralEvents } = require('../controllers/waitlistController.cjs');

// POST /waitlist/join
router.post('/join', joinWaitlist);

// GET /waitlist/:code
router.get('/:code', getReferralStats);

// GET /waitlist/:code/referrals
router.get('/:code/referrals', getReferralCount);

// GET /waitlist/_diagnostics/recent
router.get('/_diagnostics/recent', getRecentReferralEvents);

module.exports = router;
