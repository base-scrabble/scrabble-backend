// server.cjs
require('dotenv').config();
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');
const helmet = require('helmet');
const morgan = require('morgan');
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
const blockchainListener = require('./services/blockchainListener.cjs');
const submitterService = require('./services/submitterService.cjs');
const logger = require('./lib/logger.cjs');
const memoryDiagnostics = require('./lib/memoryDiagnostics.cjs');

const { gameRoom, playerRoom } = require('./lib/rooms.cjs');

const app = express();
const server = http.createServer(app);

// Increase the V8 heap ceiling slightly so Render has enough headroom to
// capture diagnostics before the process restarts. This is temporary until we
// fully resolve the memory regression.
memoryDiagnostics.ensureHeapLimit();

// Render and other proxies set X-Forwarded-* headers; trust first hop so
// express-rate-limit sees the real client IP instead of throwing errors.
app.set('trust proxy', 1);

// --- CLEAN GLOBAL CORS SETUP (REPLACEMENT) ---
const cors = require('cors');

// Full allowed origins list
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

  // Backend endpoint (Koyeb)
  "https://leading-deer-base-scrabble-7f7c59ec.koyeb.app"
];

// Allow LAN ranges automatically
function isAllowedOrigin(origin) {
  if (!origin) return false;

  // Exact matches
  if (allowedOrigins.includes(origin)) return true;

  // LAN ranges
  if (
    origin.startsWith("http://192.168.") ||
    origin.startsWith("http://10.") ||
    /^http:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./.test(origin)
  ) {
    return true;
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

// Apply security and sanitization middleware
app.use(sanitizeBody);

// Apply rate limiting (global, then specific endpoint limits)
app.use(apiLimiter);

// Register health route
app.use('/api/health', require('./routes/health.cjs'));

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
  logger.error('express:unhandled', { message: err?.message, stack: err?.stack });
  res.status(500).json({ success: false, message: 'Server error', error: err.message });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

// === START SERVICES ===
const startServices = async () => {
  try {
    await prisma.$connect();
    logger.info('services:database-connected');
    await tournamentScheduler.initialize();
    
    // Only start blockchain listener if enabled (disable for local dev to avoid QuickNode limits)
    if (process.env.ENABLE_BLOCKCHAIN_LISTENER !== 'false') {
      blockchainListener.startListening();
    } else {
      logger.warn('services:blockchain-listener-disabled');
    }
    
    // Temporarily disable submitter to test stability
    if (process.env.ENABLE_SUBMITTER !== 'false') {
      submitterService.start();
    } else {
      logger.warn('services:submitter-disabled');
    }
    logger.info('services:initialized');
  } catch (err) {
    logger.error('services:init-failed', { message: err.message, stack: err.stack });
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

process.on('exit', (code) => {
  logger.warn('process:exit', { code });
});

process.on('beforeExit', (code) => {
  logger.warn('process:before-exit', { code });
});

process.on('SIGTERM', async () => {
  logger.warn('process:sigterm');
  submitterService.stop();
  tournamentScheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { app, io };