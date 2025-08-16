const { User, Game, GamePlayer } = require('../models');
const { testConnection } = require('../config/database');

const seedData = async () => {
  try {
    console.log('🌱 Starting database seeding...');
    
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Create sample users
    const users = await User.bulkCreate([
      {
        username: 'player1',
        email: 'player1@scrabble.com',
        password: 'password123',
        totalScore: 1250,
        gamesPlayed: 15,
        gamesWon: 8
      },
      {
        username: 'player2',
        email: 'player2@scrabble.com',
        password: 'password123',
        totalScore: 980,
        gamesPlayed: 12,
        gamesWon: 5
      },
      {
        username: 'player3',
        email: 'player3@scrabble.com',
        password: 'password123',
        totalScore: 1450,
        gamesPlayed: 20,
        gamesWon: 12
      }
    ], { ignoreDuplicates: true });

    // Create sample games
    const games = await Game.bulkCreate([
      {
        gameCode: 'GAME001',
        status: 'completed',
        currentTurn: 1,
        maxPlayers: 2,
        winnerId: 1,
        startedAt: new Date(Date.now() - 86400000), // 1 day ago
        completedAt: new Date(Date.now() - 82800000) // 23 hours ago
      },
      {
        gameCode: 'GAME002',
        status: 'active',
        currentTurn: 2,
        maxPlayers: 4,
        startedAt: new Date(Date.now() - 3600000) // 1 hour ago
      },
      {
        gameCode: 'GAME003',
        status: 'waiting',
        currentTurn: 1,
        maxPlayers: 3
      }
    ], { ignoreDuplicates: true });

    console.log('✅ Database seeded successfully!');
    console.log(`📊 Created ${users.length} users and ${games.length} games`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    process.exit(1);
  }
};

seedData();
