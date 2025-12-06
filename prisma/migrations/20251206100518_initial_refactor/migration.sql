-- CreateTable
CREATE TABLE "guilds" (
    "guild_id" VARCHAR(20) NOT NULL,
    "num_mafia" INTEGER NOT NULL DEFAULT 1,
    "max_active_players" INTEGER NOT NULL DEFAULT 8,
    "in_progress" BOOLEAN NOT NULL DEFAULT false,
    "game_state" VARCHAR(20) NOT NULL DEFAULT 'IDLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("guild_id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "display_name" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "elo" INTEGER NOT NULL DEFAULT 1000,
    "peak_elo" INTEGER NOT NULL DEFAULT 1000,
    "total_rounds" INTEGER NOT NULL DEFAULT 0,
    "mafia_rounds" INTEGER NOT NULL DEFAULT 0,
    "mafia_wins" INTEGER NOT NULL DEFAULT 0,
    "correct_votes" INTEGER NOT NULL DEFAULT 0,
    "total_votes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rounds" (
    "id" SERIAL NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "winning_team" SMALLINT,
    "mafia_won" BOOLEAN,
    "abandoned_reason" VARCHAR(200),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reported_at" TIMESTAMP(3),
    "voting_started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "round_participants" (
    "id" SERIAL NOT NULL,
    "round_id" INTEGER NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "is_mafia" BOOLEAN NOT NULL,
    "team" SMALLINT NOT NULL,
    "is_substitute" BOOLEAN NOT NULL DEFAULT false,
    "substituted_for" VARCHAR(20),
    "substituted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "round_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" SERIAL NOT NULL,
    "round_id" INTEGER NOT NULL,
    "voter_id" VARCHAR(20) NOT NULL,
    "suspect_id" VARCHAR(20) NOT NULL,
    "is_correct" BOOLEAN,
    "voted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elo_changes" (
    "id" SERIAL NOT NULL,
    "round_id" INTEGER NOT NULL,
    "guild_id" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(20) NOT NULL,
    "delta" INTEGER NOT NULL,
    "previous_elo" INTEGER NOT NULL,
    "new_elo" INTEGER NOT NULL,
    "reason" VARCHAR(100) NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "elo_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_members_guild_id_user_id_idx" ON "guild_members"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "guild_members_guild_id_elo_idx" ON "guild_members"("guild_id", "elo" DESC);

-- CreateIndex
CREATE INDEX "guild_members_guild_id_is_active_idx" ON "guild_members"("guild_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_guild_id_user_id_key" ON "guild_members"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "rounds_guild_id_status_idx" ON "rounds"("guild_id", "status");

-- CreateIndex
CREATE INDEX "rounds_status_idx" ON "rounds"("status");

-- CreateIndex
CREATE INDEX "rounds_guild_id_completed_at_idx" ON "rounds"("guild_id", "completed_at" DESC);

-- CreateIndex
CREATE INDEX "round_participants_round_id_is_mafia_idx" ON "round_participants"("round_id", "is_mafia");

-- CreateIndex
CREATE INDEX "round_participants_user_id_is_mafia_idx" ON "round_participants"("user_id", "is_mafia");

-- CreateIndex
CREATE INDEX "round_participants_round_id_team_idx" ON "round_participants"("round_id", "team");

-- CreateIndex
CREATE UNIQUE INDEX "round_participants_round_id_user_id_key" ON "round_participants"("round_id", "user_id");

-- CreateIndex
CREATE INDEX "votes_round_id_idx" ON "votes"("round_id");

-- CreateIndex
CREATE INDEX "votes_voter_id_idx" ON "votes"("voter_id");

-- CreateIndex
CREATE INDEX "votes_suspect_id_idx" ON "votes"("suspect_id");

-- CreateIndex
CREATE UNIQUE INDEX "votes_round_id_voter_id_key" ON "votes"("round_id", "voter_id");

-- CreateIndex
CREATE INDEX "elo_changes_round_id_idx" ON "elo_changes"("round_id");

-- CreateIndex
CREATE INDEX "elo_changes_guild_id_user_id_applied_at_idx" ON "elo_changes"("guild_id", "user_id", "applied_at" DESC);

-- AddForeignKey
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guilds"("guild_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "round_participants" ADD CONSTRAINT "round_participants_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elo_changes" ADD CONSTRAINT "elo_changes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
