// server.cjs
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
const helmet = require('helmet');
const morgan = require('morgan');
const { prisma } = require('./lib/prisma.cjs');

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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://scrabble-frontend.vercel.app',
      'https://basescrabble.xyz',
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://scrabble-frontend.vercel.app',
    'https://basescrabble.xyz',
  ],
  credentials: true,
}));
app.use(helmet());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    console.error('DB test error:', err.message);
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
    console.error('Stats error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: err.message });
  }
});

// === ROUTE MOUNTING ===
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/words', wordRoutes);
app.use('/api/game', gameRoutes);           // ← SIGNATURES
app.use('/api/gameplay', gameplayRoutes);   // ← GAMEPLAY
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/blockchain', blockchainRoutes);

// === SOCKET.IO ===
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join-game', ({ gameId, playerName }) => {
    socket.join(`game:${gameId}`);
    console.log(`User ${socket.id} joined game ${gameId}`);
    io.to(`game:${gameId}`).emit('game:join', { gameId, playerName });
  });

  socket.on('game:join', ({ gameId, playerName }) => {
    socket.join(`game:${gameId}`);
    io.to(`game:${gameId}`).emit('game:join', { gameId, playerName });
  });

  socket.on('game:start', ({ gameId }) => {
    io.to(`game:${gameId}`).emit('game:start', { gameId });
  });

  socket.on('game:move', ({ gameId, move }) => {
    io.to(`game:${gameId}`).emit('game:move', { gameId, move });
  });

  socket.on('game:leave', ({ gameId, playerName }) => {
    socket.leave(`game:${gameId}`);
    io.to(`game:${gameId}`).emit('game:leave', { gameId, playerName });
  });

  socket.on('chat-message', ({ gameId, message, username }) => {
    io.to(`game:${gameId}`).emit('chat-message', {
      username,
      message,
      timestamp: new Date().toISOString(),
    });
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});

// === ERROR HANDLING ===
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ success: false, message: 'Server error', error: err.message });
});

app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

// === START SERVICES ===
const startServices = async () => {
  try {
    await prisma.$connect();
    console.log('Database connection established');
    await tournamentScheduler.initialize();
    blockchainListener.startListening();
    submitterService.start();
    console.log('All services initialized');
  } catch (err) {
    console.error('Failed to initialize services:', err.message);
  }
};

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Scrabble Backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`API root: http://localhost:${PORT}/`);
  console.log(`Socket.IO enabled for real-time gameplay`);
  startServices();
});

process.on('SIGTERM', async () => {
  console.log('Shutting down server...');
  submitterService.stop();
  tournamentScheduler.stop();
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = { app, io };