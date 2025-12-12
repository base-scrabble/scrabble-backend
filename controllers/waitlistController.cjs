const { prisma } = require('../lib/prisma.cjs');
const crypto = require('crypto');
// In-memory diagnostics buffer for referral increment events
const recentReferralEvents = [];

function generateReferralCode(length = 7) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// POST /waitlist/join
async function joinWaitlist(req, res) {
  try {
    let { email, ref } = req.body;
    email = String(email || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email' });
    }
    let referrerId = null;
    if (ref) {
      const referrer = await prisma.Waitlist.findUnique({ where: { code: ref } });
      if (referrer) {
        referrerId = referrer.id;
      }
    }
    let waitlist = await prisma.Waitlist.findUnique({ where: { email } });
    if (!waitlist) {
      let code;
      let exists = true;
      while (exists) {
        code = generateReferralCode();
        exists = await prisma.Waitlist.findUnique({ where: { code } });
      }
      waitlist = await prisma.Waitlist.create({
        data: { email, code, referrerId },
      });
      if (referrerId) {
        try {
          const updated = await prisma.Waitlist.update({
            where: { id: referrerId },
            data: { referralCount: { increment: 1 } },
          });
          console.info('[waitlist] referral increment', {
            ref,
            referrerId,
            newReferralCount: updated.referralCount,
          });
          recentReferralEvents.push({
            ts: new Date().toISOString(),
            event: 'referral_increment_success',
            ref,
            referrerId,
            newReferralCount: updated.referralCount,
            joinerEmail: email,
          });
          if (recentReferralEvents.length > 200) {
            recentReferralEvents.splice(0, recentReferralEvents.length - 200);
          }
        } catch (incErr) {
          console.error('[waitlist] referral increment failed', {
            ref,
            referrerId,
            error: incErr?.message,
          });
          recentReferralEvents.push({
            ts: new Date().toISOString(),
            event: 'referral_increment_failed',
            ref,
            referrerId,
            error: incErr?.message,
            joinerEmail: email,
          });
          if (recentReferralEvents.length > 200) {
            recentReferralEvents.splice(0, recentReferralEvents.length - 200);
          }
        }
      }
    }
    const referralLink = `${req.protocol}://${req.get('host')}/waitlist/join?ref=${waitlist.code}`;
    return res.json({
      success: true,
      email: waitlist.email,
      code: waitlist.code,
      referralLink,
      referralCount: waitlist.referralCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

// GET /waitlist/:code
async function getReferralStats(req, res) {
  try {
    const { code } = req.params;
    const waitlist = await prisma.Waitlist.findUnique({ where: { code } });
    if (!waitlist) {
      return res.status(404).json({ success: false, message: 'Referral code not found' });
    }
    const referralLink = `${req.protocol}://${req.get('host')}/waitlist/join?ref=${waitlist.code}`;
    return res.json({
      success: true,
      email: waitlist.email,
      code: waitlist.code,
      referralLink,
      referralCount: waitlist.referralCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

// GET /waitlist/:code/referrals
async function getReferralCount(req, res) {
  try {
    const { code } = req.params;
    const waitlist = await prisma.Waitlist.findUnique({ where: { code } });
    if (!waitlist) {
      return res.status(404).json({ success: false, message: 'Referral code not found' });
    }
    return res.json({
      success: true,
      referralCount: waitlist.referralCount,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

// GET /waitlist/_diagnostics/recent
function getRecentReferralEvents(req, res) {
  try {
    return res.json({ success: true, events: recentReferralEvents.slice(-100) });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
}

module.exports = { joinWaitlist, getReferralStats, getReferralCount, getRecentReferralEvents };
