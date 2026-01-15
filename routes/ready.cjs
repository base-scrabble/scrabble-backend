const express = require('express');
const router = express.Router();
const { prisma } = require('../lib/prisma.cjs');

const DEFAULT_READY_TIMEOUT_MS = 1500;

// Readiness check: verifies the process can reach the DB.
// Keep it cheap and time-bounded so load balancers can gate traffic safely.
router.get('/', async (req, res) => {
  const timeoutMs = Number(process.env.READY_TIMEOUT_MS || DEFAULT_READY_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`readiness timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return res.status(200).json({
      success: true,
      ready: true,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(503).json({
      success: false,
      ready: false,
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      error: error?.message || 'DB not reachable',
    });
  }
});

module.exports = router;
