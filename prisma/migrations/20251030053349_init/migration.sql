-- CreateEnum
CREATE TYPE "enum_admins_role" AS ENUM ('super_admin', 'tournament_admin', 'moderator', 'content_manager');

-- CreateEnum
CREATE TYPE "enum_games_status" AS ENUM ('waiting', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "enum_games_winner" AS ENUM ('player1', 'player2', 'draw');

-- CreateEnum
CREATE TYPE "enum_tournament_matches_status" AS ENUM ('scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled');

-- CreateEnum
CREATE TYPE "enum_tournament_players_status" AS ENUM ('registered', 'confirmed', 'checked_in', 'active', 'eliminated', 'withdrawn', 'disqualified');

-- CreateEnum
CREATE TYPE "enum_tournament_schedules_frequency" AS ENUM ('daily', 'weekly', 'monthly', 'custom');

-- CreateEnum
CREATE TYPE "enum_tournament_schedules_type" AS ENUM ('recurring', 'one_time');

-- CreateEnum
CREATE TYPE "enum_tournaments_scheduling_type" AS ENUM ('manual', 'automatic');

-- CreateEnum
CREATE TYPE "enum_tournaments_status" AS ENUM ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "enum_tournaments_type" AS ENUM ('single_elimination', 'double_elimination', 'round_robin', 'swiss');

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "enum_admins_role" NOT NULL DEFAULT 'moderator',
    "permissions" JSON NOT NULL DEFAULT '{"tournaments":{"create":false,"read":true,"update":false,"delete":false,"manage_players":false},"users":{"create":false,"read":true,"update":false,"delete":false,"ban":false},"games":{"create":false,"read":true,"update":false,"delete":false,"moderate":false},"system":{"settings":false,"logs":false,"backup":false,"analytics":true}}',
    "last_login_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "playerNumber" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "score" INTEGER DEFAULT 0,
    "tiles" TEXT DEFAULT '[]',
    "isActive" BOOLEAN DEFAULT true,
    "joinedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "gameCode" VARCHAR(255) NOT NULL,
    "status" "enum_games_status" NOT NULL DEFAULT 'waiting',
    "winner" "enum_games_winner",
    "boardState" TEXT DEFAULT '[]',
    "currentTurn" INTEGER DEFAULT 1,
    "maxPlayers" INTEGER DEFAULT 4,
    "createdBy" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "blockchainGameId" BIGINT,
    "blockchainSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "submissionTxHash" TEXT,
    "submissionBlockNumber" BIGINT,
    "submissionAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastSubmissionError" TEXT,
    "submissionFailed" BOOLEAN NOT NULL DEFAULT false,
    "player1Address" VARCHAR(42),
    "player2Address" VARCHAR(42),
    "player1Score" INTEGER,
    "player2Score" INTEGER,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moves" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "word" VARCHAR(255) NOT NULL,
    "position" JSON NOT NULL,
    "score" INTEGER NOT NULL,
    "turnNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "moves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_matches" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "player1_id" INTEGER NOT NULL,
    "player2_id" INTEGER,
    "winner_id" INTEGER,
    "loser_id" INTEGER,
    "roundNumber" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "status" "enum_tournament_matches_status" NOT NULL DEFAULT 'scheduled',
    "scorePlayer1" INTEGER DEFAULT 0,
    "scorePlayer2" INTEGER DEFAULT 0,
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_players" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "enum_tournament_players_status" NOT NULL DEFAULT 'registered',
    "seed" INTEGER DEFAULT 0,
    "ranking" INTEGER DEFAULT 0,
    "wins" INTEGER DEFAULT 0,
    "losses" INTEGER DEFAULT 0,
    "totalScore" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournament_schedules" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "type" "enum_tournament_schedules_type" NOT NULL DEFAULT 'recurring',
    "frequency" "enum_tournament_schedules_frequency",
    "cronExpression" VARCHAR(255),
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "nextRunAt" TIMESTAMPTZ(6),
    "lastRunAt" TIMESTAMPTZ(6),
    "autoStart" BOOLEAN NOT NULL DEFAULT false,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "registrationDuration" INTEGER NOT NULL DEFAULT 3600,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB DEFAULT '{"notifications":{"registrationOpen":true,"tournamentStart":true,"roundStart":true},"automation":{"createBrackets":true,"startMatches":false,"advanceRounds":false}}',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tournaments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "enum_tournaments_type" NOT NULL DEFAULT 'single_elimination',
    "status" "enum_tournaments_status" NOT NULL DEFAULT 'draft',
    "maxPlayers" INTEGER NOT NULL,
    "entryFee" DECIMAL(10,2),
    "prizePool" DECIMAL(10,2),
    "registrationStartAt" TIMESTAMPTZ(6),
    "registrationEndAt" TIMESTAMPTZ(6),
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "winner_id" INTEGER,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSON,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255),
    "avatar" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "totalScore" INTEGER DEFAULT 0,
    "gamesPlayed" INTEGER DEFAULT 0,
    "gamesWon" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_user_id" ON "admins"("user_id");

-- CreateIndex
CREATE INDEX "admins_is_active" ON "admins"("is_active");

-- CreateIndex
CREATE INDEX "admins_role" ON "admins"("role");

-- CreateIndex
CREATE UNIQUE INDEX "games_gameCode_key" ON "games"("gameCode");

-- CreateIndex
CREATE INDEX "tournament_schedules_tournamentId_idx" ON "tournament_schedules"("tournamentId");

-- CreateIndex
CREATE INDEX "tournament_schedules_type_idx" ON "tournament_schedules"("type");

-- CreateIndex
CREATE INDEX "tournament_schedules_nextRunAt_idx" ON "tournament_schedules"("nextRunAt");

-- CreateIndex
CREATE INDEX "tournament_schedules_isActive_idx" ON "tournament_schedules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_address_key" ON "users"("address");

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admins" ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moves" ADD CONSTRAINT "moves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_loser_id_fkey" FOREIGN KEY ("loser_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player1_id_fkey" FOREIGN KEY ("player1_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_player2_id_fkey" FOREIGN KEY ("player2_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_players" ADD CONSTRAINT "tournament_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournament_schedules" ADD CONSTRAINT "tournament_schedules_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_winner_id_fkey" FOREIGN KEY ("winner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
