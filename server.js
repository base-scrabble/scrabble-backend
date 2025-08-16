const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { testConnection } = require('./config/database');
const { User, Game, GamePlayer, Move } = require('./models');

const app = express();
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

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    dbConnected = await testConnection();
    
    if (dbConnected) {
      // Import models to ensure associations are set up
      require('./models');
      console.log('📊 Database models loaded successfully');
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
    app.listen(PORT, () => {
      console.log(`🎮 Scrabble Backend running on port ${PORT}`);
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🌐 API root: http://localhost:${PORT}/`);
      console.log(`🎯 Frontend Dashboard: http://localhost:${PORT}/`);
      console.log(`💾 Database: ${dbConnected ? '✅ Connected' : '❌ Disconnected'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
