const { sequelize } = require('../config/database');
const { testConnection } = require('../config/database');

const migrate = async () => {
  try {
    console.log('🔄 Starting database migration...');
    
    // Test connection first
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Database connection failed');
    }

    // Import models to ensure they're loaded
    require('../models');
    
    // Sync all models with force: true to recreate tables
    await sequelize.sync({ force: true });
    console.log('✅ Database migration completed successfully!');
    console.log('📋 Tables created: users, games, game_players, moves, tournaments, tournament_players, tournament_matches, tournament_schedules, admins');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
