// scripts/seedAdmin.cjs
require('dotenv').config();
const { prisma } = require('../lib/prisma.cjs');
const { hashPassword } = require('../config/auth.cjs');

async function seedAdmin() {
  console.log('🟢 Starting admin seeding...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@basescrabble.xyz';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  // Upsert main admin user
  const adminUser = await prisma.users.upsert({
    where: { email: adminEmail },
    update: {
      username: 'admin',
      updatedAt: new Date(),
    },
    create: {
      username: 'admin',
      email: adminEmail,
      password: await hashPassword(adminPassword),
      address: '0x1111111111111111111111111111111111111111',
      totalScore: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // upsert admins table entry for super_admin
  await prisma.admins.upsert({
    where: { user_id: adminUser.id },
    update: {
      role: 'super_admin',
      permissions: prisma.dmm // (prisma JSON weirdness avoidance) -- we'll set raw object via update below
    },
    create: {
      user_id: adminUser.id,
      role: 'super_admin',
      permissions: {
        tournaments: { create: true, read: true, update: true, delete: true, manage_players: true },
        users: { create: true, read: true, update: true, delete: true, ban: true },
        games: { create: true, read: true, update: true, delete: true, moderate: true },
        system: { settings: true, logs: true, backup: true, analytics: true },
      },
      is_active: true,
      created_by: adminUser.id,
      created_at: new Date(),
      updated_at: new Date(),
    },
  }).catch(async (e) => {
    // prisma.upsert with JSON fields sometimes needs special handling; fallback to create if upsert conflicts
    if (e.code === 'P2002') {
      // exists — try update
      await prisma.admins.update({
        where: { user_id: adminUser.id },
        data: {
          role: 'super_admin',
          permissions: {
            tournaments: { create: true, read: true, update: true, delete: true, manage_players: true },
            users: { create: true, read: true, update: true, delete: true, ban: true },
            games: { create: true, read: true, update: true, delete: true, moderate: true },
            system: { settings: true, logs: true, backup: true, analytics: true },
          },
          is_active: true,
          updated_at: new Date(),
        },
      });
    } else {
      throw e;
    }
  });

  // Tournament admin
  const tournamentEmail = 'tournaments@basescrabble.xyz';
  const tournamentUser = await prisma.users.upsert({
    where: { email: tournamentEmail },
    update: {
      username: 'tournament_admin',
      updatedAt: new Date(),
    },
    create: {
      username: 'tournament_admin',
      email: tournamentEmail,
      password: await hashPassword('tournament123'),
      address: '0x2222222222222222222222222222222222222222',
      totalScore: 0,
      gamesPlayed: 0,
      gamesWon: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

  // create or update tournament admin role
  await prisma.admins.upsert({
    where: { user_id: tournamentUser.id },
    update: {
      role: 'tournament_admin',
      is_active: true,
      updated_at: new Date(),
    },
    create: {
      user_id: tournamentUser.id,
      role: 'tournament_admin',
      permissions: {
        tournaments: { create: true, read: true, update: true, delete: true, manage_players: true },
        users: { create: false, read: true, update: false, delete: false, ban: false },
        games: { create: false, read: true, update: true, delete: false, moderate: true },
        system: { settings: false, logs: true, backup: false, analytics: true },
      },
      is_active: true,
      created_by: adminUser.id,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  console.log('✅ Admin seeding completed successfully!');
  console.log(`👤 Super Admin: ${adminEmail} / ${adminPassword}`);
  console.log('🎯 Tournament Admin: tournaments@basescrabble.xyz / tournament123');
}

seedAdmin()
  .catch((e) => {
    console.error('❌ Admin seeding failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });