require('dotenv').config();
const { sequelize } = require('../config/database');
const { User, Admin } = require('../models');
const { hashPassword } = require('../middleware/auth');

const seedAdmin = async () => {
  try {
    console.log('🌱 Starting admin seeding...');
    
    // Test database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');

    // Create super admin user
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@scrabble.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    
    const adminUser = await User.create({
      username: 'admin',
      email: adminEmail,
      password: await hashPassword(adminPassword),
      totalScore: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      isActive: true
    });

    // Create admin record with full permissions
    const adminRecord = await Admin.create({
      userId: adminUser.id,
      role: 'super_admin',
      permissions: {
        tournaments: {
          create: true,
          read: true,
          update: true,
          delete: true,
          manage_players: true
        },
        users: {
          create: true,
          read: true,
          update: true,
          delete: true,
          ban: true
        },
        games: {
          create: true,
          read: true,
          update: true,
          delete: true,
          moderate: true
        },
        system: {
          settings: true,
          logs: true,
          backup: true,
          analytics: true
        }
      },
      isActive: true
    });

    // Create tournament admin user
    const tournamentAdminUser = await User.create({
      username: 'tournament_admin',
      email: 'tournaments@scrabble.com',
      password: await hashPassword('tournament123'),
      totalScore: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      isActive: true
    });

    await Admin.create({
      userId: tournamentAdminUser.id,
      role: 'tournament_admin',
      permissions: {
        tournaments: {
          create: true,
          read: true,
          update: true,
          delete: true,
          manage_players: true
        },
        users: {
          create: false,
          read: true,
          update: false,
          delete: false,
          ban: false
        },
        games: {
          create: false,
          read: true,
          update: true,
          delete: false,
          moderate: true
        },
        system: {
          settings: false,
          logs: true,
          backup: false,
          analytics: true
        }
      },
      isActive: true,
      createdBy: adminUser.id
    });

    console.log('✅ Admin seeding completed successfully!');
    console.log(`👤 Super Admin: ${adminEmail} / ${adminPassword}`);
    console.log('🏆 Tournament Admin: tournaments@scrabble.com / tournament123');

  } catch (error) {
    console.error('❌ Admin seeding failed:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

seedAdmin();
