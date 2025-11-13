// routes/userRoutes.cjs
const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { prisma } = require("../lib/prisma.cjs");
const {
  getUsers,
  getUser,
  ensureUser,
  updateUser,
  getLeaderboard,
  uploadAvatar,
  deleteAvatar,
} = require("../controllers/userController.cjs");
const { verifyPrivyToken, optionalAuth } = require("../config/auth.cjs");
const { handleUpload } = require("../middleware/uploads.cjs");

console.log("✅ User routes loaded");

// --------------------------
// 🧩 Waitlist + Referral System
// --------------------------

// POST /api/users/waitlist
router.post("/waitlist", async (req, res) => {
  try {
    const { email, referralCode } = req.body;
    if (!email)
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });

    // Generate invite/referral code
    const code = crypto.randomUUID().slice(0, 8).toUpperCase();

    // Create or update user with referral data
    const existingUser = await prisma.users.findUnique({ where: { email } });

    let user;
    if (existingUser) {
      user = await prisma.users.update({
        where: { email },
        data: { referredBy: referralCode || null, inviteCode: code },
      });
    } else {
      user = await prisma.users.create({
        data: {
          email,
          inviteCode: code,
          referredBy: referralCode || null,
          isActive: true,
          createdAt: new Date(),
        },
      });
    }

    return res.json({
      success: true,
      inviteLink: `https://basescrabble.xyz?ref=${code}`,
      code,
    });
  } catch (err) {
    console.error("❌ Waitlist error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// GET /api/users/referrals/:code
router.get("/referrals/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code)
      return res
        .status(400)
        .json({ success: false, message: "Referral code required" });

    const count = await prisma.users.count({ where: { referredBy: code } });
    return res.json({ success: true, referrals: count });
  } catch (err) {
    console.error("❌ Get referrals error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
});

// --------------------------
// 🧩 Core User Routes
// --------------------------

router.get("/", optionalAuth, getUsers);
router.get("/:id", verifyPrivyToken, getUser);
router.post("/", ensureUser); // Privy-handled, no auth needed
router.put("/:id", verifyPrivyToken, updateUser);
router.get("/leaderboard", getLeaderboard);
router.post("/avatar", verifyPrivyToken, handleUpload, uploadAvatar);
router.delete("/avatar", verifyPrivyToken, deleteAvatar);

module.exports = router;
