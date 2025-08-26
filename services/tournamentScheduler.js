const cron = require('node-cron');
const { Tournament, TournamentSchedule, TournamentPlayer, TournamentMatch } = require('../models');
const { Op } = require('sequelize');

class TournamentScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.isRunning = false;
  }

  /**
   * Initialize the tournament scheduler
   */
  async initialize() {
    if (this.isRunning) return;
    
    console.log('🕒 Initializing Tournament Scheduler...');
    
    try {
      // Load existing schedules
      await this.loadSchedules();
      
      // Start periodic check for tournaments
      this.startPeriodicCheck();
      
      this.isRunning = true;
      console.log('✅ Tournament Scheduler initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Tournament Scheduler:', error);
    }
  }

  /**
   * Load all active tournament schedules
   */
  async loadSchedules() {
    try {
      const schedules = await TournamentSchedule.findAll({
        where: { isActive: true },
        include: [{ model: Tournament }]
      });

      for (const schedule of schedules) {
        await this.scheduleJob(schedule);
      }

      console.log(`📅 Loaded ${schedules.length} tournament schedules`);
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  }

  /**
   * Schedule a tournament job
   */
  async scheduleJob(schedule) {
    try {
      const jobId = `tournament_${schedule.id}`;
      
      // Remove existing job if any
      if (this.scheduledJobs.has(jobId)) {
        this.scheduledJobs.get(jobId).destroy();
      }

      let cronExpression;
      
      if (schedule.cronExpression) {
        cronExpression = schedule.cronExpression;
      } else {
        // Generate cron expression based on frequency
        cronExpression = this.generateCronExpression(schedule.frequency);
      }

      if (!cron.validate(cronExpression)) {
        console.error(`Invalid cron expression for schedule ${schedule.id}: ${cronExpression}`);
        return;
      }

      const job = cron.schedule(cronExpression, async () => {
        await this.executeTournamentCreation(schedule);
      }, {
        scheduled: true,
        timezone: 'UTC'
      });

      this.scheduledJobs.set(jobId, job);
      
      // Update next run time
      await schedule.update({
        nextRunAt: this.getNextRunTime(cronExpression)
      });

      console.log(`⏰ Scheduled tournament "${schedule.name}" with cron: ${cronExpression}`);
    } catch (error) {
      console.error(`Error scheduling job for ${schedule.id}:`, error);
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
      default:
        return '0 12 * * *'; // Default to daily
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
      console.error('Error parsing cron expression:', error);
      return null;
    }
  }

  /**
   * Execute tournament creation
   */
  async executeTournamentCreation(schedule) {
    try {
      console.log(`🎯 Executing scheduled tournament: ${schedule.name}`);
      
      const tournament = await Tournament.findByPk(schedule.tournamentId);
      if (!tournament) {
        console.error(`Tournament ${schedule.tournamentId} not found`);
        return;
      }

      // Create new tournament instance based on template
      const newTournament = await Tournament.create({
        name: `${tournament.name} - ${new Date().toLocaleDateString()}`,
        description: tournament.description,
        type: tournament.type,
        status: 'registration_open',
        schedulingType: 'automatic',
        maxPlayers: tournament.maxPlayers,
        entryFee: tournament.entryFee,
        prizePool: tournament.prizePool,
        registrationStartAt: new Date(),
        registrationEndAt: new Date(Date.now() + schedule.registrationDuration * 1000),
        startAt: new Date(Date.now() + schedule.registrationDuration * 1000 + 300000), // 5 minutes after registration ends
        rules: tournament.rules,
        settings: tournament.settings,
        createdBy: tournament.createdBy
      });

      // Update schedule last run time
      await schedule.update({
        lastRunAt: new Date(),
        nextRunAt: this.getNextRunTime(schedule.cronExpression || this.generateCronExpression(schedule.frequency))
      });

      console.log(`✅ Created automatic tournament: ${newTournament.name} (ID: ${newTournament.id})`);

      // Schedule tournament start if auto-start is enabled
      if (schedule.autoStart) {
        setTimeout(async () => {
          await this.autoStartTournament(newTournament.id, schedule.minPlayers);
        }, schedule.registrationDuration * 1000);
      }

    } catch (error) {
      console.error(`Error executing tournament creation for schedule ${schedule.id}:`, error);
    }
  }

  /**
   * Auto-start tournament if minimum players met
   */
  async autoStartTournament(tournamentId, minPlayers) {
    try {
      const tournament = await Tournament.findByPk(tournamentId);
      if (!tournament || tournament.status !== 'registration_open') {
        return;
      }

      const playerCount = await TournamentPlayer.count({
        where: { 
          tournamentId,
          status: { [Op.in]: ['registered', 'confirmed'] }
        }
      });

      if (playerCount >= minPlayers) {
        await tournament.update({ status: 'registration_closed' });
        
        // Generate bracket
        await this.generateAutoBracket(tournament);
        
        await tournament.update({ status: 'in_progress' });
        
        console.log(`🚀 Auto-started tournament: ${tournament.name} with ${playerCount} players`);
      } else {
        // Cancel tournament if not enough players
        await tournament.update({ status: 'cancelled' });
        console.log(`❌ Cancelled tournament: ${tournament.name} - insufficient players (${playerCount}/${minPlayers})`);
      }
    } catch (error) {
      console.error(`Error auto-starting tournament ${tournamentId}:`, error);
    }
  }

  /**
   * Generate automatic bracket
   */
  async generateAutoBracket(tournament) {
    try {
      const players = await TournamentPlayer.findAll({
        where: { 
          tournamentId: tournament.id,
          status: { [Op.in]: ['registered', 'confirmed'] }
        }
      });

      if (players.length < 2) return;

      // Update player statuses
      await TournamentPlayer.update(
        { status: 'active' },
        { where: { tournamentId: tournament.id } }
      );

      // Generate matches based on tournament type
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
      console.error('Error generating auto bracket:', error);
    }
  }

  /**
   * Generate single elimination bracket
   */
  async generateSingleEliminationBracket(tournamentId, players) {
    const shuffledPlayers = players.sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      const player1 = shuffledPlayers[i];
      const player2 = shuffledPlayers[i + 1] || null;
      
      await TournamentMatch.create({
        tournamentId,
        roundNumber: 1,
        matchNumber: Math.floor(i / 2) + 1,
        player1Id: player1.userId,
        player2Id: player2?.userId || null,
        status: player2 ? 'scheduled' : 'completed',
        winnerId: player2 ? null : player1.userId,
        scheduledAt: new Date(Date.now() + 600000) // 10 minutes from now
      });
    }
  }

  /**
   * Generate round robin bracket
   */
  async generateRoundRobinBracket(tournamentId, players) {
    let matchNumber = 1;
    
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        await TournamentMatch.create({
          tournamentId,
          roundNumber: 1,
          matchNumber: matchNumber++,
          player1Id: players[i].userId,
          player2Id: players[j].userId,
          status: 'scheduled',
          scheduledAt: new Date(Date.now() + (matchNumber * 300000)) // Stagger matches by 5 minutes
        });
      }
    }
  }

  /**
   * Start periodic check for tournaments
   */
  startPeriodicCheck() {
    // Check every minute for tournaments that need status updates
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
      
      // Start registration for tournaments
      await Tournament.update(
        { status: 'registration_open' },
        {
          where: {
            status: 'draft',
            registrationStartAt: { [Op.lte]: now }
          }
        }
      );

      // Close registration for tournaments
      await Tournament.update(
        { status: 'registration_closed' },
        {
          where: {
            status: 'registration_open',
            registrationEndAt: { [Op.lte]: now }
          }
        }
      );

      // Start tournaments
      await Tournament.update(
        { status: 'in_progress' },
        {
          where: {
            status: 'registration_closed',
            startAt: { [Op.lte]: now }
          }
        }
      );

    } catch (error) {
      console.error('Error checking tournament statuses:', error);
    }
  }

  /**
   * Add new schedule
   */
  async addSchedule(scheduleData) {
    try {
      const schedule = await TournamentSchedule.create(scheduleData);
      await this.scheduleJob(schedule);
      return schedule;
    } catch (error) {
      console.error('Error adding schedule:', error);
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
        this.scheduledJobs.get(jobId).destroy();
        this.scheduledJobs.delete(jobId);
      }

      await TournamentSchedule.update(
        { isActive: false },
        { where: { id: scheduleId } }
      );
    } catch (error) {
      console.error('Error removing schedule:', error);
      throw error;
    }
  }

  /**
   * Stop all scheduled jobs
   */
  stop() {
    for (const [jobId, job] of this.scheduledJobs) {
      job.destroy();
    }
    this.scheduledJobs.clear();
    this.isRunning = false;
    console.log('🛑 Tournament Scheduler stopped');
  }
}

// Export singleton instance
module.exports = new TournamentScheduler();
