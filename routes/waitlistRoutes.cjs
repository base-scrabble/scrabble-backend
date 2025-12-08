const express = require('express');
const router = express.Router();
const { joinWaitlist, getReferralStats, getReferralCount } = require('../controllers/waitlistController.cjs');

// POST /waitlist/join
router.post('/join', joinWaitlist);

// GET /waitlist/:code
router.get('/:code', getReferralStats);

// GET /waitlist/:code/referrals
router.get('/:code/referrals', getReferralCount);

module.exports = router;
