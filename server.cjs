// server.cjs
require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');
const { prisma } = require('./lib/prisma.cjs');
const { sanitizeBody } = require('./middleware/validation.cjs');
const { apiLimiter, authLimiter, gameLimiter } = require('./middleware/rateLimiter.cjs');

// === ROUTES ===

const authRoutes = require('./routes/authRoutes.cjs');
const userRoutes = require('./routes/userRoutes.cjs');
const wordRoutes = require('./routes/wordRoutes.cjs');
const gameRoutes = require('./routes/gameRoutes.cjs');
const gameplayRoutes = require('./routes/gameplayRoutes.cjs');
const tournamentRoutes = require('./routes/tournamentRoutes.cjs');
const adminRoutes = require('./routes/adminRoutes.cjs');
const blockchainRoutes = require('./routes/blockchainRoutes.cjs');
const waitlistRoutes = require('./routes/waitlistRoutes.cjs');
const { listGames } = require('./controllers/gameController.cjs');

// === SERVICES ===
const tournamentScheduler = require('./services/tournamentScheduler.cjs');
const logger = require('./lib/logger.cjs');
const memoryDiagnostics = require('./lib/memoryDiagnostics.cjs');

const { gameRoom, playerRoom } = require('./lib/rooms.cjs');

// Capture fatal and async errors for production forensics.
let lastFatalError = null;
process.on('uncaughtException', (err) => {
  try {
    lastFatalError = {
      type: 'uncaughtException',
      at: new Date().toISOString(),
      message: err?.message || String(err),
      stack: err?.stack || null,
      name: err?.name || null,
    };
    logger.error('process:uncaught-exception', {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
    });
  } catch (_) {
    // no-op
  }
});

process.on('unhandledRejection', (reason) => {
  try {
    const message = typeof reason === 'object' && reason && 'message' in reason
      ? reason.message
      : String(reason);
    const stack = typeof reason === 'object' && reason && 'stack' in reason
      ? reason.stack
      : null;
    lastFatalError = {
      type: 'unhandledRejection',
      at: new Date().toISOString(),
      message,
      stack,
    };
    logger.error('process:unhandled-rejection', { message, stack });
  } catch (_) {
    // no-op
  }
});

const app = express();
const server = http.createServer(app);

// Surface listen / network errors explicitly (otherwise they can look like a silent exit).
server.on('error', (err) => {
  logger.error('server:error', {
    message: err?.message,
    code: err?.code,
    errno: err?.errno,
    syscall: err?.syscall,
    address: err?.address,
    port: err?.port,
    stack: err?.stack,
  });
});

// Proxy-friendly server timeouts.
// Some edge proxies expect keep-alive connections to remain open > 5s; mismatches can
// show up client-side as ERR_EMPTY_RESPONSE and upstream 5xx.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Increase the V8 heap ceiling slightly so Render has enough headroom to
// capture diagnostics before the process restarts. This is temporary until we
// fully resolve the memory regression.
memoryDiagnostics.ensureHeapLimit();

// Render and other proxies set X-Forwarded-* headers; trust first hop so
// express-rate-limit sees the real client IP instead of throwing errors.
app.set('trust proxy', 1);

// Request id + minimal diagnostics headers (helps debug intermittent 503s / CORS reports).
app.use((req, res, next) => {
  const requestId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Backend-Time', new Date().toISOString());
  next();
});

// --- CLEAN GLOBAL CORS SETUP (REPLACEMENT) ---
const cors = require('cors');

// Full allowed origins list
function parseCsvEnv(name) {
  const raw = process.env[name];
  if (!raw) return [];
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const extraAllowedOrigins = parseCsvEnv('CORS_ALLOWED_ORIGINS');
const allowedHostSuffixes = parseCsvEnv('CORS_ALLOWED_HOST_SUFFIXES');
const allowedOriginPrefixes = parseCsvEnv('CORS_ALLOWED_ORIGIN_PREFIXES');

// If running on Fly, allow the default app hostname unless explicitly blocked.
// (You can still override/extend via CORS_ALLOWED_ORIGINS.)
const flyAppName = process.env.FLY_APP_NAME;
const flyDefaultOrigin = flyAppName ? `https://${flyAppName}.fly.dev` : null;

const allowedOrigins = [
  "http://localhost:41",
  "http://127.0.0.1:41",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",

  // LAN / WiFi dev
  "http://192.168.",
  "http://10.",
  "http://172.",

  // Local machine discovered IP
  "http://10.225.25.6:41",

  // Production domains
  "https://basescrabble.xyz",
  "https://www.basescrabble.xyz",
  "https://scrabble-frontend.vercel.app",
  "https://scrabble-frontend-lyart.vercel.app",

  // Historical backend host removed; Fly is the active host.

  // Fly default hostname (when applicable)
  ...(flyDefaultOrigin ? [flyDefaultOrigin] : []),

  // Operator-provided origins
  ...extraAllowedOrigins,
];

// Allow LAN ranges automatically
function isAllowedOrigin(origin) {
  if (!origin) return false;

  // Normalize common formatting differences.
  // Browsers send Origin without a trailing slash, but humans often include it.
  const normalizedOrigin = typeof origin === 'string' ? origin.replace(/\/+$/, '') : origin;

  // Exact matches
  if (allowedOrigins.includes(normalizedOrigin)) return true;

  // Configurable origin prefixes (useful for LAN/dev IPs that can change)
  if (allowedOriginPrefixes.length) {
    if (allowedOriginPrefixes.some((prefix) => prefix && normalizedOrigin.startsWith(prefix))) {
      return true;
    }
  }

  // LAN ranges
  if (
    normalizedOrigin.startsWith("http://192.168.") ||
    normalizedOrigin.startsWith("http://10.") ||
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(normalizedOrigin)
  ) {
    return true;
  }

  // Allow operator-defined hostname suffixes (e.g. `.fly.dev`, `.basescrabble.xyz`).
  if (allowedHostSuffixes.length) {
    try {
      const hostname = new URL(origin).hostname;
      if (allowedHostSuffixes.some((suffix) => suffix && hostname.endsWith(suffix))) {
        return true;
      }
    } catch (_) {
      // Ignore parse errors and fall through to block.
    }
  }

  console.log("❌ Blocked CORS origin:", origin);
  return false;
}

const corsOptions = {
  origin: function (origin, cb) {
    // Allow non-browser requests (no Origin header) like health checks.
    if (!origin) return cb(null, true);
    if (isAllowedOrigin(origin)) return cb(null, true);
    // Explicitly block disallowed browser origins.
    return cb(new Error('CORS: Origin Not Allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

// Global CORS (API)
app.use(cors(corsOptions));

// Ensure preflight (OPTIONS) uses the same CORS rules.
app.options('*', cors(corsOptions));
// --- END CORS SETUP ---

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (isAllowedOrigin(origin)) return callback(null, true);
      console.log("❌ Blocked Socket.IO origin:", origin);
      callback("Socket.IO CORS Blocked", false);
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Debounce reconnect attempts to prevent aggressive reconnect spam
const reconnectDebounce = new Map();
function shouldAllowReconnect(socketId) {
  const now = Date.now();
  const last = reconnectDebounce.get(socketId) || 0;
  if (now - last < 5000) return false; // 5s debounce
  reconnectDebounce.set(socketId, now);
  return true;
}
io.on('connection', (socket) => {
  socket.on('reconnect_attempt', () => {
    if (!shouldAllowReconnect(socket.id)) {
      socket.disconnect(true);
    }
  });
});
// Make io available to controllers at runtime to avoid circular require issues
app.set('io', io);
global.__io = io;

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Focused request/response logging for gameplay endpoints.
app.use('/api/gameplay', (req, res, next) => {
  const start = Date.now();
  const origin = req.headers.origin;
  const ua = req.headers['user-agent'];
  const requestId = res.locals.requestId;
  res.on('finish', () => {
    logger.info('http:gameplay', {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      origin,
      ua,
    });
  });
  next();
});

// Apply security and sanitization middleware
app.use(sanitizeBody);

// Rate limiting is applied per-route below.
// NOTE: Do not apply `apiLimiter` globally, otherwise gameplay endpoints can be
// throttled under normal reconnect/resync patterns, making moves appear flaky.

// Register health route
app.use('/api/health', require('./routes/health.cjs'));

// Readiness route (DB reachability)
app.use('/api/ready', require('./routes/ready.cjs'));

// Lightweight diagnostics endpoint (no auth, safe fields only)
app.get('/api/diag', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    requestId: res.locals.requestId,
    now: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    node: process.version,
    pid: process.pid,
    memory: {
      rssMb: Math.round((mem.rss / 1024 / 1024) * 100) / 100,
      heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 100) / 100,
      externalMb: Math.round((mem.external / 1024 / 1024) * 100) / 100,
      arrayBuffersMb: Math.round(((mem.arrayBuffers || 0) / 1024 / 1024) * 100) / 100,
    },
    lastFatalError,
    env: {
      nodeEnv: process.env.NODE_ENV || null,
      enableBlockchainListener: process.env.ENABLE_BLOCKCHAIN_LISTENER || null,
      enableSubmitter: process.env.ENABLE_SUBMITTER || null,
    },
  });
});

// === ROUTE MOUNTING ===

app.use('/api/auth', authLimiter, authRoutes);          // Strict rate limit on auth
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/words', apiLimiter, wordRoutes);
app.use('/api/game', gameLimiter, gameRoutes);           // ← SIGNATURES (moderate limit)
app.use('/api/gameplay', gameLimiter, gameplayRoutes);   // ← GAMEPLAY (moderate limit)
app.use('/api/tournaments', apiLimiter, tournamentRoutes);
app.use('/api/admin', authLimiter, adminRoutes);
app.use('/api/blockchain', apiLimiter, blockchainRoutes);
app.use('/api/waitlist', waitlistRoutes);
console.log('Waitlist routes loaded');

// Legacy lobby endpoint kept for backwards compatibility with older clients
app.get('/api/lobby/list', gameLimiter, (req, res) => listGames(req, res));

// === SOCKET.IO ===
io.on('connection', (socket) => {
  logger.info('socket:connected', { socketId: socket.id });

  socket.on('join-game', ({ gameId, playerName }) => {
    const room = gameRoom(gameId);
    socket.join(room);
    if (playerName) {
      socket.join(playerRoom(gameId, playerName));
    }
    logger.info('socket:join-game', { socketId: socket.id, gameId, playerName });
    io.to(room).emit('game:join', { gameId, playerName, socketId: socket.id });
  });

  socket.on('game:join', ({ gameId, playerName }) => {
    const room = gameRoom(gameId);
    socket.join(room);
    if (playerName) {
      socket.join(playerRoom(gameId, playerName));
    }
    logger.info('socket:game:join', { socketId: socket.id, gameId, playerName });
    // Broadcast to ALL clients in room (including sender)
    io.to(room).emit('game:join', { gameId, playerName, socketId: socket.id });
    io.to(room).emit('player:joined', { gameId, playerName, socketId: socket.id });
  });

  socket.on('game:start', ({ gameId }) => {
    const room = gameRoom(gameId);
    logger.info('socket:game:start', { socketId: socket.id, gameId });
    io.to(room).emit('game:start', { gameId });
  });

  socket.on('game:move', ({ gameId, move }) => {
    const room = gameRoom(gameId);
    logger.info('socket:game:move', { socketId: socket.id, gameId, moveType: move?.action });
    io.to(room).emit('game:move', { gameId, move });
    io.to(room).emit('game:update', { gameId, move });
  });

  socket.on('game:leave', ({ gameId, playerName }) => {
    const room = gameRoom(gameId);
    logger.info('socket:game:leave', { socketId: socket.id, gameId, playerName });
    socket.leave(room);
    if (playerName) {
      socket.leave(playerRoom(gameId, playerName));
    }
    // Broadcast to ALL remaining clients in room
    io.to(room).emit('game:leave', { gameId, playerName });
    io.to(room).emit('player:left', { gameId, playerName });
  });

  socket.on('chat-message', ({ gameId, message, username }) => {
    const room = gameRoom(gameId);
    logger.info('socket:chat-message', { socketId: socket.id, gameId, username });
    io.to(room).emit('chat-message', {
      username,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    logger.info('socket:disconnected', { socketId: socket.id });
  });
});

// === ERROR HANDLING ===
app.use((err, req, res, next) => {
  const requestId = res?.locals?.requestId;
  logger.error('express:unhandled', {
    requestId,
    method: req?.method,
    path: req?.originalUrl,
    origin: req?.headers?.origin,
    message: err?.message,
    stack: err?.stack,
  });
  if (res.headersSent) return next(err);
  res.status(500).json({
    success: false,
    message: 'Server error',
    requestId,
    error: err?.message || 'unknown',
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

// === START SERVICES ===
let submitterService = null;
let blockchainListener = null;

const startServices = async () => {
  const failFastOnDb = process.env.FAIL_FAST_ON_DB === 'true';
  const connectTimeoutMs = Number(process.env.DB_CONNECT_TIMEOUT_MS || 8000);

  logger.info('services:starting', { failFastOnDb, connectTimeoutMs });

  // Prisma can hang on initial connection in some network failure modes.
  // If FAIL_FAST_ON_DB=true, force-exit after the timeout window regardless.
  let hardFailFastTimer = null;
  if (failFastOnDb) {
    hardFailFastTimer = setTimeout(() => {
      try {
        logger.error('services:fail-fast-timeout-exit', { connectTimeoutMs });
      } catch (_) {
        // no-op
      }
      process.exit(1);
    }, connectTimeoutMs + 250);
  }

  try {
    await Promise.race([
      prisma.$connect(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`database connect timeout after ${connectTimeoutMs}ms`)),
          connectTimeoutMs
        )
      ),
    ]);
    logger.info('services:database-connected');
  } catch (err) {
    logger.error('services:database-connect-failed', { message: err?.message, stack: err?.stack });
    if (failFastOnDb) {
      logger.error('services:fail-fast-exit', { reason: 'database-connect-failed' });
      process.exit(1);
    }
    return;
  } finally {
    if (hardFailFastTimer) {
      clearTimeout(hardFailFastTimer);
      hardFailFastTimer = null;
    }
  }

  try {
    await tournamentScheduler.initialize();

    // Only start blockchain listener if enabled.
    if (process.env.ENABLE_BLOCKCHAIN_LISTENER !== 'false') {
      blockchainListener = require('./services/blockchainListener.cjs');
      blockchainListener.startListening();
    } else {
      logger.warn('services:blockchain-listener-disabled');
    }

    // Only start submitter if enabled.
    if (process.env.ENABLE_SUBMITTER !== 'false') {
      submitterService = require('./services/submitterService.cjs');
      submitterService.start();
    } else {
      logger.warn('services:submitter-disabled');
    }

    logger.info('services:initialized');
  } catch (err) {
    logger.error('services:init-failed', { message: err?.message, stack: err?.stack });
  }
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  logger.info('server:started', { port: PORT, host: '0.0.0.0' });
  logger.info('server:lan-hint', { url: `http://<your-ip>:${PORT}` });
  logger.info('server:health-endpoint', { url: `http://<your-ip>:${PORT}/api/health` });
  logger.info('server:api-root', { url: `http://<your-ip>:${PORT}/` });
  logger.info('server:socket-enabled');
  // Re-enable services now that we know they're not the problem
  startServices();
  
  // Keepalive to prevent Node from exiting
  setInterval(() => {
    // Keep process alive
  }, 5000); // Every 5 seconds
  
  logger.info('server:ready');
});

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
  logger.error('process:unhandled-rejection', { reason, promise });
  // Don't exit - log and continue
});

process.on('uncaughtException', (error) => {
  logger.error('process:uncaught-exception', { message: error?.message, stack: error?.stack });
  // Don't exit - log and continue
});

// IMPORTANT: avoid using the async file logger in exit/beforeExit.
// `beforeExit` can fire repeatedly if the handler schedules async work.
process.once('exit', (code) => {
  try {
    console.warn(`${new Date().toISOString()} [WARN] process:exit ${JSON.stringify({ code })}`);
  } catch (_) {
    // no-op
  }
});

process.once('beforeExit', (code) => {
  try {
    console.warn(`${new Date().toISOString()} [WARN] process:before-exit ${JSON.stringify({ code })}`);
  } catch (_) {
    // no-op
  }
});

process.on('SIGTERM', async () => {
  logger.warn('process:sigterm');
  try {
    submitterService?.stop?.();
  } catch (_) {
    try {
      require('./services/submitterService.cjs')?.stop?.();
    } catch (_) {}
  }
  tournamentScheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { app, io };