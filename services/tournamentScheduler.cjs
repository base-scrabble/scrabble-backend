const cron = require('node-cron');
const { prisma } = require('../lib/prisma.cjs');

class TournamentScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize the tournament scheduler
   */
  async initialize() {
    if (this.isRunning) {
      console.log('Tournament scheduler already running');
      return;
    }

    console.log('🕒 Initializing Tournament Scheduler...');

    try {
      await this.loadSchedules();
      this.startPeriodicCheck();
      this.isRunning = true;
      console.log('✅ Tournament Scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Tournament Scheduler:', error.message);
    }
  }

  /**
   * Load all active tournament schedules
   */
  async loadSchedules() {
    try {
      const schedules = await prisma.tournament_schedules.findMany({
        where: { isActive: true },
        include: { tournaments: true },
      });

      for (const schedule of schedules) {
        await this.scheduleJob(schedule);
      }

      console.log(`📅 Loaded ${schedules.length} tournament schedules`);
    } catch (error) {
      console.error('Error loading schedules:', error.message);
    }
  }

  /**
   * Schedule a tournament job
   */
  async scheduleJob(schedule) {
    try {
      const jobId = `tournament_${schedule.id}`;

      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId).stop();
        this.scheduledJobs.delete(jobId);
      }

      let cronExpression = schedule.cronExpression || this.generateCronExpression(schedule.frequency);

      if (!cron.validate(cronExpression)) {
        console.error(`Invalid cron expression for schedule ${schedule.id}: ${cronExpression}`);
        return;
      }

      const job = cron.schedule(
        cronExpression,
        async () => {
          await this.executeTournamentCreation(schedule);
        },
        { scheduled: true, timezone: 'UTC' }
      );

      this.scheduledJobs.set(jobId, job);

      await prisma.tournament_schedules.update({
        where: { id: parseInt(schedule.id) },
        data: { nextRunAt: this.getNextRunTime(cronExpression) },
      });

      console.log(`⏰ Scheduled tournament "${schedule.name}" with cron: ${cronExpression}`);
    } catch (error) {
      console.error(`Error scheduling job for ${schedule.id}:`, error.message);
    }
  }

  /**
   * Generate cron expression from frequency
   */
  generateCronExpression(frequency) {
    switch (frequency) {
      case 'daily':
        return '0 12 * * *'; // Daily at 12:00 PM
      case 'weekly':
        return '0 12 * * 1'; // Weekly on Monday at 12:00 PM
      case 'monthly':
        return '0 12 1 * *'; // Monthly on 1st at 12:00 PM
      case 'custom':
        return '0 12 * * *'; // Default to daily for custom
      default:
        return '0 12 * * *'; // Fallback to daily
    }
  }

  /**
   * Get next run time from cron expression
   */
  getNextRunTime(cronExpression) {
    try {
      const cronParser = require('cron-parser');
      const interval = cronParser.parseExpression(cronExpression);
      return interval.next().toDate();
    } catch (error) {
      console.error('Error parsing cron expression:', error.message);
      return null;
    }
  }

  /**
   * Execute tournament creation
   */
  async executeTournamentCreation(schedule) {
    try {
      console.log(`🎯 Executing scheduled tournament: ${schedule.name}`);

      const tournament = await prisma.tournaments.findUnique({
        where: { id: parseInt(schedule.tournamentId) },
      });
      if (!tournament) {
        console.error(`Tournament ${schedule.tournamentId} not found`);
        return;
      }

      const registrationDurationMs = schedule.registrationDuration * 1000;
      const newTournament = await prisma.tournaments.create({
        data: {
          name: `${tournament.name} - ${new Date().toLocaleDateString()}`,
          description: tournament.description,
          type: tournament.type,
          status: 'registration_open',
          maxPlayers: tournament.maxPlayers,
          entryFee: tournament.entryFee,
          prizePool: tournament.prizePool,
          registrationStartAt: new Date(),
          registrationEndAt: new Date(Date.now() + registrationDurationMs),
          startAt: new Date(Date.now() + registrationDurationMs + 300000), // 5 minutes after registration ends
          rules: tournament.rules,
          created_by: tournament.created_by,
          isActive: true,
        },
      });

      await prisma.tournament_schedules.update({
        where: { id: parseInt(schedule.id) },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.getNextRunTime(schedule.cronExpression || this.generateCronExpression(schedule.frequency)),
        },
      });

      console.log(`✅ Created automatic tournament: ${newTournament.name} (ID: ${newTournament.id})`);

      if (schedule.autoStart) {
        setTimeout(async () => {
          await this.autoStartTournament(newTournament.id, schedule.minPlayers);
        }, registrationDurationMs);
      }
    } catch (error) {
      console.error(`Error executing tournament creation for schedule ${schedule.id}:`, error.message);
    }
  }

  /**
   * Auto-start tournament if minimum players met
   */
  async autoStartTournament(tournamentId, minPlayers) {
    try {
      const tournament = await prisma.tournaments.findUnique({
        where: { id: parseInt(tournamentId) },
      });
      if (!tournament || tournament.status !== 'registration_open') {
        console.log(`Tournament ${tournamentId} not eligible for auto-start`);
        return;
      }

      const playerCount = await prisma.tournament_players.count({
        where: {
          tournamentId: parseInt(tournamentId),
          status: { in: ['registered', 'confirmed'] },
        },
      });

      if (playerCount >= minPlayers) {
        await prisma.tournaments.update({
          where: { id: parseInt(tournamentId) },
          data: { status: 'registration_closed', updatedAt: new Date() },
        });

        await this.generateAutoBracket(tournament);

        await prisma.tournaments.update({
          where: { id: parseInt(tournamentId) },
          data: { status: 'in_progress', updatedAt: new Date() },
        });

        console.log(`🚀 Auto-started tournament: ${tournament.name} with ${playerCount} players`);
      } else {
        await prisma.tournaments.update({
          where: { id: parseInt(tournamentId) },
          data: { status: 'cancelled', updatedAt: new Date() },
        });
        console.log(`❌ Cancelled tournament: ${tournament.name} - insufficient players (${playerCount}/${minPlayers})`);
      }
    } catch (error) {
      console.error(`Error auto-starting tournament ${tournamentId}:`, error.message);
    }
  }

  /**
   * Generate automatic bracket
   */
  async generateAutoBracket(tournament) {
    try {
      const players = await prisma.tournament_players.findMany({
        where: {
          tournamentId: parseInt(tournament.id),
          status: { in: ['registered', 'confirmed'] },
        },
      });

      if (players.length < 2) {
        console.log(`Not enough players for bracket in tournament ${tournament.id}`);
        return;
      }

      await prisma.tournament_players.updateMany({
        where: { tournamentId: parseInt(tournament.id) },
        data: { status: 'active' },
      });

      switch (tournament.type) {
        case 'single_elimination':
          await this.generateSingleEliminationBracket(tournament.id, players);
          break;
        case 'round_robin':
          await this.generateRoundRobinBracket(tournament.id, players);
          break;
        default:
          console.log(`Auto-bracket generation not implemented for type: ${tournament.type}`);
      }
    } catch (error) {
      console.error('Error generating auto bracket:', error.message);
    }
  }

  /**
   * Generate single elimination bracket
   */
  async generateSingleEliminationBracket(tournamentId, players) {
    try {
      const shuffledPlayers = players.sort(() => Math.random() - 0.5);

      for (let i = 0; i < shuffledPlayers.length; i += 2) {
        const player1 = shuffledPlayers[i];
        const player2 = shuffledPlayers[i + 1] || null;

        await prisma.tournament_matches.create({
          data: {
            tournamentId: parseInt(tournamentId),
            roundNumber: 1,
            matchNumber: Math.floor(i / 2) + 1,
            player1_id: player1.userId,
            player2_id: player2?.userId || null,
            status: player2 ? 'scheduled' : 'completed',
            winner_id: player2 ? null : player1.userId,
            startAt: new Date(Date.now() + 600000), // 10 minutes from now
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.error(`Error generating single elimination bracket for tournament ${tournamentId}:`, error.message);
    }
  }

  /**
   * Generate round robin bracket
   */
  async generateRoundRobinBracket(tournamentId, players) {
    try {
      let matchNumber = 1;

      for (let i = 0; i < players.length; i++) {
        for (let j = i + 1; j < players.length; j++) {
          await prisma.tournament_matches.create({
            data: {
              tournamentId: parseInt(tournamentId),
              roundNumber: 1,
              matchNumber: matchNumber++,
              player1_id: players[i].userId,
              player2_id: players[j].userId,
              status: 'scheduled',
              startAt: new Date(Date.now() + matchNumber * 300000), // Stagger matches by 5 minutes
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
        }
      }
    } catch (error) {
      console.error(`Error generating round robin bracket for tournament ${tournamentId}:`, error.message);
    }
  }

  /**
   * Start periodic check for tournaments
   */
  startPeriodicCheck() {
    cron.schedule('* * * * *', async () => {
      await this.checkTournamentStatuses();
    });
  }

  /**
   * Check and update tournament statuses
   */
  async checkTournamentStatuses() {
    try {
      const now = new Date();

      await prisma.tournaments.updateMany({
        where: {
          status: 'draft',
          registrationStartAt: { lte: now },
        },
        data: { status: 'registration_open', updatedAt: new Date() },
      });

      await prisma.tournaments.updateMany({
        where: {
          status: 'registration_open',
          registrationEndAt: { lte: now },
        },
        data: { status: 'registration_closed', updatedAt: new Date() },
      });

      await prisma.tournaments.updateMany({
        where: {
          status: 'registration_closed',
          startAt: { lte: now },
        },
        data: { status: 'in_progress', updatedAt: new Date() },
      });
    } catch (error) {
      console.error('Error checking tournament statuses:', error.message);
    }
  }

  /**
   * Add new schedule
   */
  async addSchedule(scheduleData) {
    try {
      const schedule = await prisma.tournament_schedules.create({
        data: {
          ...scheduleData,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await this.scheduleJob(schedule);
      return schedule;
    } catch (error) {
      console.error('Error adding schedule:', error.message);
      throw error;
    }
  }

  /**
   * Remove schedule
   */
  async removeSchedule(scheduleId) {
    try {
      const jobId = `tournament_${scheduleId}`;

      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId).stop();
        this.scheduledJobs.delete(jobId);
      }

      await prisma.tournament_schedules.update({
        where: { id: parseInt(scheduleId) },
        data: { isActive: false, updatedAt: new Date() },
      });
    } catch (error) {
      console.error('Error removing schedule:', error.message);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const [jobId, job] of this.scheduledJobs) {
      job.stop();
    }
    this.scheduledJobs.clear();
    this.isRunning = false;
    console.log('🛑 Tournament Scheduler stopped');
  }
}

module.exports = new TournamentScheduler();