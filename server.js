const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const { sequelize } = require('./config/database');
const models = require('./models');
const { User, Game, GamePlayer, Move, Tournament, TournamentPlayer, TournamentMatch, Admin } = require('./models');

// Import routes
const exampleRoutes = require('./routes/exampleRoutes');
const wordRoutes = require('./routes/wordRoutes');
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');
const tournamentRoutes = require('./routes/tournamentRoutes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ["http://localhost:3000", "http://localhost:3001"],
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Database connection test
let dbConnected = false;

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Scrabble Backend API',
    status: 'running',
    database: dbConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    database: dbConnected ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Database live test route
app.get('/api/test', async (req, res) => {
  try {
    const [results] = await sequelize.query("SELECT NOW()");
    res.json({
      success: true,
      time: results[0].now,
      message: "Database connection OK"
    });
  } catch (error) {
    console.error("DB test error:", error);
    res.status(500).json({
      success: false,
      error: "Database query failed",
      message: error.message
    });
  }
});

// Users routes
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['id', 'username', 'email', 'totalScore', 'gamesPlayed', 'gamesWon', 'createdAt']
    });
    res.json({
      success: true,
      data: users,
      count: users.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users',
      message: error.message
    });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = await User.create({ username, email, password });
    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        totalScore: user.totalScore,
        gamesPlayed: user.gamesPlayed,
        gamesWon: user.gamesWon
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Failed to create user',
      message: error.message
    });
  }
});

// Games routes
app.get('/api/games', async (req, res) => {
  try {
    const games = await Game.findAll({
      include: [{
        model: GamePlayer,
        include: [{ model: User, attributes: ['id', 'username'] }]
      }],
      order: [['createdAt', 'DESC']]
    });
    res.json({
      success: true,
      data: games,
      count: games.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games',
      message: error.message
    });
  }
});

app.post('/api/games', async (req, res) => {
  try {
    const { maxPlayers = 4 } = req.body;
    const gameCode = Math.random().toString(36).substr(2, 8).toUpperCase();
    
    const game = await Game.create({
      gameCode,
      maxPlayers,
      status: 'waiting'
    });
    
    res.status(201).json({
      success: true,
      data: game
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Failed to create game',
      message: error.message
    });
  }
});

app.get('/api/games/:id', async (req, res) => {
  try {
    const game = await Game.findByPk(req.params.id, {
      include: [{
        model: GamePlayer,
        include: [{ model: User, attributes: ['id', 'username'] }]
      }, {
        model: Move,
        include: [{ model: User, attributes: ['id', 'username'] }],
        order: [['moveNumber', 'ASC']]
      }]
    });
    
    if (!game) {
      return res.status(404).json({
        success: false,
        error: 'Game not found'
      });
    }
    
    res.json({
      success: true,
      data: game
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game',
      message: error.message
    });
  }
});

// Game stats route
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.count();
    const totalGames = await Game.count();
    const activeGames = await Game.count({ where: { status: 'active' } });
    const completedGames = await Game.count({ where: { status: 'completed' } });
    
    res.json({
      success: true,
      data: {
        totalUsers,
        totalGames,
        activeGames,
        completedGames
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

// Routes
app.use('/api/words', wordRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/blockchain', require('./routes/blockchainRoutes'));

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  
  // Join game room
  socket.on('join-game', (gameId) => {
    socket.join(`game-${gameId}`);
    console.log(`👤 User ${socket.id} joined game ${gameId}`);
  });
  
  // Leave game room
  socket.on('leave-game', (gameId) => {
    socket.leave(`game-${gameId}`);
    console.log(`👋 User ${socket.id} left game ${gameId}`);
  });
  
  // Handle game moves
  socket.on('game-move', (data) => {
    const { gameId, move } = data;
    // Broadcast move to all players in the game
    socket.to(`game-${gameId}`).emit('move-made', move);
  });
  
  // Handle chat messages
  socket.on('chat-message', (data) => {
    const { gameId, message, username } = data;
    // Broadcast message to all players in the game
    io.to(`game-${gameId}`).emit('chat-message', {
      username,
      message,
      timestamp: new Date().toISOString()
    });
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Test database connection function
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error.message);
    return false;
  }
};

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    dbConnected = await testConnection();
    
    if (dbConnected) {
      // Import models to ensure associations are set up
      require('./models');
      console.log('📊 Database models loaded successfully');
      
      // Initialize tournament scheduler
      const tournamentScheduler = require('./services/tournamentScheduler');
      await tournamentScheduler.initialize();
      
      // Initialize blockchain services
      const blockchainListener = require('./services/blockchainListener');
      const submitterService = require('./services/submitterService');
      
      // Start blockchain event listener
      blockchainListener.startListening();
      
      // Start submitter service
      submitterService.start();
      
      console.log('🔗 Blockchain services initialized');
    } else {
      console.log('⚠️  Database not connected - running in limited mode');
      console.log('💡 To enable full functionality, see SETUP.md for your platform:');
      console.log('   • Windows: Use MySQL installer or Chocolatey');
      console.log('   • macOS: Use Homebrew or MySQL installer');
      console.log('   • Linux: Use apt/dnf/yum package managers');
      console.log('   • Docker: Run MySQL container (cross-platform)');
      console.log('   Then run: npm run migrate && npm run seed');
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`🎮 Scrabble Backend running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌐 API root: http://localhost:${PORT}/`);
      console.log(`🎯 Frontend Dashboard: http://localhost:${PORT}/`);
      console.log(`💾 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`🔌 Socket.IO enabled for real-time gameplay`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
