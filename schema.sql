-- Rocket League Mafia Bot - Database Schema
-- PostgreSQL database schema for persistent ELO ratings and game history

-- Guilds table (per-server game configuration)
CREATE TABLE IF NOT EXISTS guilds (
    guild_id VARCHAR(20) PRIMARY KEY,
    num_mafia INTEGER DEFAULT 1 CHECK (num_mafia BETWEEN 1 AND 2),
    in_progress BOOLEAN DEFAULT FALSE,
    game_state VARCHAR(20) DEFAULT 'IDLE',
    active_player_ids TEXT[], -- PostgreSQL array of Snowflake IDs
    sub_player_ids TEXT[], -- Substitute players (9+)
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Players table (per-server player stats and ELO ratings)
CREATE TABLE IF NOT EXISTS players (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    user_id VARCHAR(20) NOT NULL,
    display_name VARCHAR(100),

    -- ELO rating system
    elo INTEGER DEFAULT 1000,
    total_rounds INTEGER DEFAULT 0,
    mafia_rounds INTEGER DEFAULT 0,
    mafia_wins INTEGER DEFAULT 0,
    correct_votes INTEGER DEFAULT 0,
    total_votes INTEGER DEFAULT 0,
    peak_elo INTEGER DEFAULT 1000,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    UNIQUE(guild_id, user_id),
    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_guild_user ON players(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_players_elo ON players(guild_id, elo DESC);

-- Active rounds table (current game state per guild)
CREATE TABLE IF NOT EXISTS active_rounds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) UNIQUE NOT NULL,
    mafia_ids TEXT[], -- Array of mafia player IDs
    innocent_ids TEXT[], -- Array of innocent player IDs
    player_teams JSONB, -- Map of user_id -> team number (1 or 2)
    votes JSONB, -- Map of voter_id -> suspect_id
    winning_team INTEGER, -- 1 or 2, NULL until reported
    started_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

-- Game history table (completed rounds for analytics)
CREATE TABLE IF NOT EXISTS game_history (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(20) NOT NULL,
    mafia_ids TEXT[], -- Who was mafia
    winning_team INTEGER, -- Which RL team won (1 or 2)
    mafia_won BOOLEAN, -- Did mafia successfully sabotage?
    votes JSONB, -- Vote records
    elo_changes JSONB, -- Map of user_id -> ELO delta
    played_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (guild_id) REFERENCES guilds(guild_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_history_guild ON game_history(guild_id, played_at DESC);

-- Schema migrations tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT NOW()
);

-- Record initial schema version
INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
