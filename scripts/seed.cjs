const { prisma } = require('../lib/prisma.cjs');
const { hashPassword } = require('../config/auth.cjs');

async function seed() {
  console.log('🌱 Starting database seeding...');

  // --- Seed Users ---
  const usersData = [
    {
      username: 'player1',
      email: 'player1@scrabble.com',
      password: await hashPassword('password123'),
      address: '0x1234567890abcdef1234567890abcdef12345678',
      totalScore: 1250,
      gamesPlayed: 15,
      gamesWon: 8,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      username: 'player2',
      email: 'player2@scrabble.com',
      password: await hashPassword('password123'),
      address: '0xabcdef1234567890abcdef1234567890abcdef12',
      totalScore: 980,
      gamesPlayed: 12,
      gamesWon: 5,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      username: 'player3',
      email: 'player3@scrabble.com',
      password: await hashPassword('password123'),
      address: '0x7890abcdef1234567890abcdef1234567890abcd',
      totalScore: 1450,
      gamesPlayed: 20,
      gamesWon: 12,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const user of usersData) {
    await prisma.users.upsert({
      where: { email: user.email },
      update: user,
      create: user,
    });
  }

  // --- Seed Games ---
  const gamesData = [
    {
      gameCode: 'GAME001',
      status: 'completed',
      currentTurn: 1,
      maxPlayers: 2,
      createdBy: 1,
      player1Address: '0x1234567890abcdef1234567890abcdef12345678',
      player1Score: 300,
      winner: 'player1',
      blockchainSubmitted: false,
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 82800000),
    },
    {
      gameCode: 'GAME002',
      status: 'active',
      currentTurn: 2,
      maxPlayers: 4,
      createdBy: 2,
      player1Address: '0xabcdef1234567890abcdef1234567890abcdef12',
      blockchainSubmitted: false,
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(),
    },
    {
      gameCode: 'GAME003',
      status: 'waiting',
      currentTurn: 1,
      maxPlayers: 3,
      createdBy: 3,
      player1Address: '0x7890abcdef1234567890abcdef1234567890abcd',
      blockchainSubmitted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  for (const game of gamesData) {
    await prisma.games.upsert({
      where: { gameCode: game.gameCode },
      update: game,
      create: game,
    });
  }

  console.log('✅ Database seeded successfully!');
}

seed()
  .catch((e) => {
    console.error('❌ Seeding failed:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });