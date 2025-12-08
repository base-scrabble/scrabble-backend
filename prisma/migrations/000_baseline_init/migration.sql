-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."enum_admins_role" AS ENUM ('super_admin', 'tournament_admin', 'moderator', 'content_manager');

-- CreateEnum
CREATE TYPE "public"."enum_games_status" AS ENUM ('waiting', 'active', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."enum_games_winner" AS ENUM ('player1', 'player2', 'draw');

-- CreateEnum
CREATE TYPE "public"."enum_tournament_matches_status" AS ENUM ('scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."enum_tournament_players_status" AS ENUM ('registered', 'confirmed', 'checked_in', 'active', 'eliminated', 'withdrawn', 'disqualified');

-- CreateEnum
CREATE TYPE "public"."enum_tournament_schedules_frequency" AS ENUM ('daily', 'weekly', 'monthly', 'custom');

-- CreateEnum
CREATE TYPE "public"."enum_tournament_schedules_type" AS ENUM ('recurring', 'one_time');

-- CreateEnum
CREATE TYPE "public"."enum_tournaments_status" AS ENUM ('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."enum_tournaments_type" AS ENUM ('single_elimination', 'double_elimination', 'round_robin', 'swiss');

-- CreateTable
CREATE TABLE "public"."Waitlist" (
    "id" SERIAL NOT NULL,
    "email" VARCHAR NOT NULL,
    "code" VARCHAR NOT NULL,
    "referrerId" INTEGER,
    "referralCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."admins" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "public"."enum_admins_role" NOT NULL DEFAULT 'moderator',
    "permissions" JSON NOT NULL DEFAULT '{}',
    "last_login_at" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_players" (
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
CREATE TABLE "public"."games" (
    "id" SERIAL NOT NULL,
    "gameCode" VARCHAR(255) NOT NULL,
    "status" "public"."enum_games_status" NOT NULL DEFAULT 'waiting',
    "winner" "public"."enum_games_winner",
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
CREATE TABLE "public"."moves" (
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
CREATE TABLE "public"."tournament_matches" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "matchNumber" INTEGER NOT NULL,
    "status" "public"."enum_tournament_matches_status" NOT NULL DEFAULT 'scheduled',
    "scorePlayer1" INTEGER DEFAULT 0,
    "scorePlayer2" INTEGER DEFAULT 0,
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "loserId" INTEGER,
    "player1Id" INTEGER NOT NULL,
    "player2Id" INTEGER,
    "winnerId" INTEGER,

    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournament_players" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "status" "public"."enum_tournament_players_status" NOT NULL DEFAULT 'registered',
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
CREATE TABLE "public"."tournament_schedules" (
    "id" SERIAL NOT NULL,
    "tournamentId" INTEGER,
    "name" VARCHAR(100) NOT NULL,
    "type" "public"."enum_tournament_schedules_type" NOT NULL DEFAULT 'recurring',
    "frequency" "public"."enum_tournament_schedules_frequency",
    "cronExpression" VARCHAR(255),
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "nextRunAt" TIMESTAMPTZ(6),
    "lastRunAt" TIMESTAMPTZ(6),
    "autoStart" BOOLEAN NOT NULL DEFAULT false,
    "minPlayers" INTEGER NOT NULL DEFAULT 2,
    "registrationDuration" INTEGER NOT NULL DEFAULT 3600,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tournament_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tournaments" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "public"."enum_tournaments_type" NOT NULL DEFAULT 'single_elimination',
    "status" "public"."enum_tournaments_status" NOT NULL DEFAULT 'draft',
    "maxPlayers" INTEGER NOT NULL,
    "entryFee" DECIMAL(10,2),
    "prizePool" DECIMAL(10,2),
    "registrationStartAt" TIMESTAMPTZ(6),
    "registrationEndAt" TIMESTAMPTZ(6),
    "startAt" TIMESTAMPTZ(6),
    "endAt" TIMESTAMPTZ(6),
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rules" JSON,
    "winnerId" INTEGER,

    CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "address" VARCHAR(255),
    "avatar" VARCHAR(255),
    "password" VARCHAR(255),
    "totalScore" INTEGER DEFAULT 0,
    "gamesPlayed" INTEGER DEFAULT 0,
    "gamesWon" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_code_key" ON "public"."Waitlist"("code" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_key" ON "public"."Waitlist"("email" ASC);

-- CreateIndex
CREATE INDEX "admins_is_active" ON "public"."admins"("is_active" ASC);

-- CreateIndex
CREATE INDEX "admins_role" ON "public"."admins"("role" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "admins_user_id_key" ON "public"."admins"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "games_gameCode_key" ON "public"."games"("gameCode" ASC);

-- CreateIndex
CREATE INDEX "tournament_schedules_isActive_idx" ON "public"."tournament_schedules"("isActive" ASC);

-- CreateIndex
CREATE INDEX "tournament_schedules_nextRunAt_idx" ON "public"."tournament_schedules"("nextRunAt" ASC);

-- CreateIndex
CREATE INDEX "tournament_schedules_tournamentId_idx" ON "public"."tournament_schedules"("tournamentId" ASC);

-- CreateIndex
CREATE INDEX "tournament_schedules_type_idx" ON "public"."tournament_schedules"("type" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_address_key" ON "public"."users"("address" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username" ASC);

-- AddForeignKey
ALTER TABLE "public"."admins" ADD CONSTRAINT "admins_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."admins" ADD CONSTRAINT "admins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_players" ADD CONSTRAINT "game_players_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_players" ADD CONSTRAINT "game_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."games" ADD CONSTRAINT "games_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."moves" ADD CONSTRAINT "moves_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "public"."games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."moves" ADD CONSTRAINT "moves_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_matches" ADD CONSTRAINT "tournament_matches_loserId_fkey" FOREIGN KEY ("loserId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_matches" ADD CONSTRAINT "tournament_matches_player1Id_fkey" FOREIGN KEY ("player1Id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_matches" ADD CONSTRAINT "tournament_matches_player2Id_fkey" FOREIGN KEY ("player2Id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_matches" ADD CONSTRAINT "tournament_matches_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_matches" ADD CONSTRAINT "tournament_matches_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_players" ADD CONSTRAINT "tournament_players_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_players" ADD CONSTRAINT "tournament_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournament_schedules" ADD CONSTRAINT "tournament_schedules_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "public"."tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournaments" ADD CONSTRAINT "tournaments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tournaments" ADD CONSTRAINT "tournaments_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
