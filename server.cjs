// server.cjs
require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

// === SERVICES ===
const tournamentScheduler = require('./services/tournamentScheduler.cjs');
const blockchainListener = require('./services/blockchainListener.cjs');
const submitterService = require('./services/submitterService.cjs');
const logger = require('./lib/logger.cjs');

const { gameRoom, playerRoom } = require('./lib/rooms.cjs');

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    /http:\/\/192\.168\.\d+\.\d+:5173/,
  ],
  methods: 'GET,POST,PUT,DELETE',
  credentials: true,
};

const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      /http:\/\/192\.168\.\d+\.\d+:5173/,
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  // Add explicit transport configuration
  transports: ['polling', 'websocket'],
  allowEIO3: true, // Support older Engine.IO clients if needed
});

// Make io available to controllers at runtime to avoid circular require issues
app.set('io', io);
global.__io = io;

app.use(cors(corsOptions));
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply security and sanitization middleware
app.use(sanitizeBody);

// Apply rate limiting (global, then specific endpoint limits)
app.use(apiLimiter);

// === HEALTH & STATS ===
app.get('/', (req, res) => {
  res.json({
    message: 'Scrabble Backend API',
    status: 'running',
    database: 'connected',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', async (req, res) => {
  try {
    const result = await prisma.$queryRaw`SELECT NOW()`;
    res.json({ success: true, time: result[0].now, message: 'Database connection OK' });
  } catch (err) {
    logger.error('health-check:error', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Database query failed', error: err.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const [totalUsers, totalGames, activeGames, completedGames] = await Promise.all([
      prisma.users.count(),
      prisma.games.count(),
      prisma.games.count({ where: { status: 'active' } }),
      prisma.games.count({ where: { status: 'completed' } }),
    ]);

    res.json({ success: true, data: { totalUsers, totalGames, activeGames, completedGames } });
  } catch (err) {
    logger.error('stats:error', { message: err.message, stack: err.stack });
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: err.message });
  }
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