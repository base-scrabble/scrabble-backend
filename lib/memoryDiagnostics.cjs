const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const logger = require('./logger.cjs');

const SNAPSHOT_DIR = path.resolve(__dirname, '..', 'diagnostics');
const MAX_HISTORY = Number(process.env.GAME_HISTORY_LIMIT || 200);
const history = [];
const latestByGame = new Map();
let heapLimitRaised = false;

function ensureDir() {
  if (!fs.existsSync(SNAPSHOT_DIR)) {
    fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
  }
}

function ensureHeapLimit(targetMb = Number(process.env.MAX_HEAP_MB || 512)) {
  if (heapLimitRaised) return;
  try {
    const flag = `--max_old_space_size=${targetMb}`;
    if (!process.execArgv.some((arg) => arg.includes('max-old-space-size'))) {
      v8.setFlagsFromString(flag);
    }
    heapLimitRaised = true;
    logger.warn('memory:heap-limit-adjusted', { targetMb });
  } catch (err) {
    logger.warn('memory:heap-limit-adjust-failed', { message: err.message });
  }
}

function pruneHistory() {
  while (history.length > MAX_HISTORY) {
    const removed = history.shift();
    const current = latestByGame.get(removed.gameId);
    if (current && current.timestamp === removed.timestamp) {
      latestByGame.delete(removed.gameId);
    }
  }
}

function trackGameSnapshot(gameId, meta = {}) {
  if (!gameId) return;
  const entry = {
    gameId,
    status: meta.status || 'unknown',
    bagCount: meta.bagCount ?? null,
    passesInRow: meta.passesInRow ?? null,
    moveCount: meta.moveCount ?? null,
    boardBytes: meta.boardBytes ?? null,
    heapUsedMb: Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)),
    timestamp: Date.now(),
  };
  history.push(entry);
  latestByGame.set(gameId, entry);
  pruneHistory();
}

function dropGame(gameId) {
  if (!gameId) return;
  latestByGame.delete(gameId);
}

function captureHeapSnapshot(label = 'manual') {
  ensureDir();
  const file = path.join(
    SNAPSHOT_DIR,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.heapsnapshot`,
  );
  const snapshotStream = v8.getHeapSnapshot();
  const writable = fs.createWriteStream(file);
  snapshotStream.pipe(writable);
  return new Promise((resolve, reject) => {
    writable.on('finish', () => {
      logger.info('memory:heap-snapshot', { file });
      resolve(file);
    });
    writable.on('error', (err) => {
      logger.error('memory:heap-snapshot-failed', { message: err.message });
      reject(err);
    });
  });
}

async function maybeCaptureHeapSnapshot(trigger = 'auto') {
  if (process.env.ENABLE_HEAP_SNAPSHOTS !== 'true') return null;
  const threshold = Number(process.env.HEAP_SNAPSHOT_THRESHOLD_MB || 320);
  const heapUsedMb = process.memoryUsage().heapUsed / 1024 / 1024;
  if (heapUsedMb < threshold) return null;
  return captureHeapSnapshot(trigger);
}

function getRecentHistory() {
  return history.slice(-25);
}

module.exports = {
  ensureHeapLimit,
  trackGameSnapshot,
  dropGame,
  captureHeapSnapshot,
  maybeCaptureHeapSnapshot,
  getRecentHistory,
};
