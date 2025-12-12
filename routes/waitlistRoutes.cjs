const express = require('express');
const router = express.Router();
const { joinWaitlist, getReferralStats, getReferralCount, getRecentReferralEvents } = require('../controllers/waitlistController.cjs');

// POST /waitlist/join
router.post('/join', joinWaitlist);

// GET /waitlist/_diagnostics/recent (place before parameterized routes)
router.get('/_diagnostics/recent', getRecentReferralEvents);

// GET /waitlist/:code/referrals
router.get('/:code/referrals', getReferralCount);

// GET /waitlist/:code
router.get('/:code', getReferralStats);

module.exports = router;
