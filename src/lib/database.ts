/**
 * Database Service for Rocket League Mafia
 *
 * PostgreSQL persistence layer for ELO ratings, player stats, and game history.
 * Provides per-server isolation for all data.
 */

import { Client } from 'pg';

export enum GameState {
	IDLE = 'IDLE',
	LOBBY = 'LOBBY',
	PLAYING = 'PLAYING',
	VOTING = 'VOTING',
	RESOLVING = 'RESOLVING'
}

export interface GuildRecord {
	guild_id: string;
	num_mafia: number;
	in_progress: boolean;
	game_state: GameState;
	active_player_ids: string[];
	sub_player_ids: string[];
	created_at: Date;
	updated_at: Date;
}

export interface PlayerRecord {
	id: number;
	guild_id: string;
	user_id: string;
	display_name: string;
	elo: number;
	total_rounds: number;
	mafia_rounds: number;
	mafia_wins: number;
	correct_votes: number;
	total_votes: number;
	peak_elo: number;
	created_at: Date;
	updated_at: Date;
}

export interface ActiveRoundRecord {
	id: number;
	guild_id: string;
	mafia_ids: string[];
	innocent_ids: string[];
	player_teams: Record<string, 1 | 2>;
	votes: Record<string, string>;
	winning_team: number | null;
	started_at: Date;
}

export interface GameHistoryRecord {
	id: number;
	guild_id: string;
	mafia_ids: string[];
	winning_team: number;
	mafia_won: boolean;
	votes: Record<string, string>;
	elo_changes: Record<string, number>;
	played_at: Date;
}

export interface GuildStats {
	total_games: number;
	total_players: number;
	avg_elo: number;
	top_player: {
		user_id: string;
		display_name: string;
		elo: number;
	} | null;
}

export interface EloUpdate {
	eloDelta: number;
	totalRounds?: number;
	mafiaRounds?: number;
	mafiaWins?: number;
	correctVotes?: number;
	totalVotes?: number;
}

export class DatabaseService {
	private client: Client;
	private connected: boolean = false;

	constructor() {
		const connectionString = process.env.DATABASE_URL;
		if (!connectionString) {
			throw new Error('DATABASE_URL environment variable not set');
		}

		this.client = new Client({
			connectionString,
			ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
		});
	}

	async connect(): Promise<void> {
		if (!this.connected) {
			await this.client.connect();
			this.connected = true;
		}
	}

	async disconnect(): Promise<void> {
		if (this.connected) {
			await this.client.end();
			this.connected = false;
		}
	}

	// Guild operations
	async getOrCreateGuild(guildId: string): Promise<GuildRecord> {
		const result = await this.client.query<GuildRecord>(
			`INSERT INTO guilds (guild_id)
       VALUES ($1)
       ON CONFLICT (guild_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
			[guildId]
		);
		return result.rows[0];
	}

	async updateGuildState(guildId: string, state: GameState, inProgress?: boolean): Promise<void> {
		const query = inProgress !== undefined
			? `UPDATE guilds SET game_state = $1, in_progress = $2, updated_at = NOW() WHERE guild_id = $3`
			: `UPDATE guilds SET game_state = $1, updated_at = NOW() WHERE guild_id = $2`;

		const params = inProgress !== undefined ? [state, inProgress, guildId] : [state, guildId];

		await this.client.query(query, params);
	}

	async updateGuildActivePlayers(guildId: string, activeIds: string[], subIds: string[]): Promise<void> {
		await this.client.query(
			`UPDATE guilds
       SET active_player_ids = $1, sub_player_ids = $2, updated_at = NOW()
       WHERE guild_id = $3`,
			[activeIds, subIds, guildId]
		);
	}

	async setNumMafia(guildId: string, numMafia: number): Promise<void> {
		await this.client.query(
			`UPDATE guilds SET num_mafia = $1, updated_at = NOW() WHERE guild_id = $2`,
			[numMafia, guildId]
		);
	}

	// Player operations
	async getOrCreatePlayer(guildId: string, userId: string, displayName: string): Promise<PlayerRecord> {
		const result = await this.client.query<PlayerRecord>(
			`INSERT INTO players (guild_id, user_id, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET display_name = $3, updated_at = NOW()
       RETURNING *`,
			[guildId, userId, displayName]
		);
		return result.rows[0];
	}

	async getPlayer(guildId: string, userId: string): Promise<PlayerRecord | null> {
		const result = await this.client.query<PlayerRecord>(
			`SELECT * FROM players WHERE guild_id = $1 AND user_id = $2`,
			[guildId, userId]
		);
		return result.rows[0] || null;
	}

	async removePlayer(guildId: string, userId: string): Promise<void> {
		await this.client.query(
			`DELETE FROM players WHERE guild_id = $1 AND user_id = $2`,
			[guildId, userId]
		);
	}

	async getGuildPlayers(guildId: string): Promise<PlayerRecord[]> {
		const result = await this.client.query<PlayerRecord>(
			`SELECT * FROM players WHERE guild_id = $1 ORDER BY elo DESC`,
			[guildId]
		);
		return result.rows;
	}

	async getLeaderboard(guildId: string, limit: number = 50): Promise<PlayerRecord[]> {
		const result = await this.client.query<PlayerRecord>(
			`SELECT * FROM players
       WHERE guild_id = $1
       ORDER BY elo DESC
       LIMIT $2`,
			[guildId, limit]
		);
		return result.rows;
	}

	// ELO operations
	async updatePlayerElo(
		guildId: string,
		userId: string,
		eloDelta: number,
		updates: Partial<EloUpdate>
	): Promise<void> {
		const player = await this.getPlayer(guildId, userId);
		if (!player) return;

		const newElo = Math.max(0, player.elo + eloDelta);
		const newPeakElo = Math.max(player.peak_elo, newElo);

		await this.client.query(
			`UPDATE players
       SET elo = $1,
           peak_elo = $2,
           total_rounds = total_rounds + $3,
           mafia_rounds = mafia_rounds + $4,
           mafia_wins = mafia_wins + $5,
           correct_votes = correct_votes + $6,
           total_votes = total_votes + $7,
           updated_at = NOW()
       WHERE guild_id = $8 AND user_id = $9`,
			[
				newElo,
				newPeakElo,
				updates.totalRounds || 0,
				updates.mafiaRounds || 0,
				updates.mafiaWins || 0,
				updates.correctVotes || 0,
				updates.totalVotes || 0,
				guildId,
				userId
			]
		);
	}

	async bulkUpdateElo(guildId: string, updates: Map<string, EloUpdate>): Promise<void> {
		// Use transaction for consistency
		await this.client.query('BEGIN');

		try {
			for (const [userId, update] of updates.entries()) {
				await this.updatePlayerElo(guildId, userId, update.eloDelta, update);
			}

			await this.client.query('COMMIT');
		} catch (error) {
			await this.client.query('ROLLBACK');
			throw error;
		}
	}

	// Round operations
	async startRound(
		guildId: string,
		mafiaIds: string[],
		innocentIds: string[],
		teams: Record<string, 1 | 2>
	): Promise<void> {
		// Delete any existing active round first
		await this.client.query(`DELETE FROM active_rounds WHERE guild_id = $1`, [guildId]);

		// Insert new active round
		await this.client.query(
			`INSERT INTO active_rounds (guild_id, mafia_ids, innocent_ids, player_teams, votes)
       VALUES ($1, $2, $3, $4, $5)`,
			[guildId, mafiaIds, innocentIds, JSON.stringify(teams), JSON.stringify({})]
		);
	}

	async getActiveRound(guildId: string): Promise<ActiveRoundRecord | null> {
		const result = await this.client.query<ActiveRoundRecord>(
			`SELECT * FROM active_rounds WHERE guild_id = $1`,
			[guildId]
		);

		if (result.rows.length === 0) return null;

		const row = result.rows[0];
		return {
			...row,
			player_teams: row.player_teams as Record<string, 1 | 2>,
			votes: row.votes as Record<string, string>
		};
	}

	async saveVote(guildId: string, voterId: string, suspectId: string): Promise<void> {
		await this.client.query(
			`UPDATE active_rounds
       SET votes = jsonb_set(votes, '{${voterId}}', '"${suspectId}"')
       WHERE guild_id = $1`,
			[guildId]
		);
	}

	async completeRound(guildId: string, winningTeam: 1 | 2, eloChanges: Record<string, number>): Promise<void> {
		// Get active round data
		const round = await this.getActiveRound(guildId);
		if (!round) return;

		// Determine mafia win
		const mafiaWon = Object.entries(eloChanges).some(([userId, delta]) =>
			round.mafia_ids.includes(userId) && delta > 0
		);

		// Insert into history
		await this.client.query(
			`INSERT INTO game_history (guild_id, mafia_ids, winning_team, mafia_won, votes, elo_changes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
			[
				guildId,
				round.mafia_ids,
				winningTeam,
				mafiaWon,
				JSON.stringify(round.votes),
				JSON.stringify(eloChanges)
			]
		);

		// Delete active round
		await this.client.query(`DELETE FROM active_rounds WHERE guild_id = $1`, [guildId]);
	}

	async resetRound(guildId: string): Promise<void> {
		await this.client.query(`DELETE FROM active_rounds WHERE guild_id = $1`, [guildId]);
		await this.updateGuildState(guildId, GameState.IDLE, false);
		await this.updateGuildActivePlayers(guildId, [], []);
	}

	// Stats operations
	async getGuildStats(guildId: string): Promise<GuildStats> {
		const [gamesResult, playersResult, topPlayerResult] = await Promise.all([
			this.client.query<{ count: string }>(`SELECT COUNT(*) as count FROM game_history WHERE guild_id = $1`, [guildId]),
			this.client.query<{ count: string; avg_elo: string }>(
				`SELECT COUNT(*) as count, AVG(elo) as avg_elo FROM players WHERE guild_id = $1`,
				[guildId]
			),
			this.client.query<{ user_id: string; display_name: string; elo: number }>(
				`SELECT user_id, display_name, elo FROM players WHERE guild_id = $1 ORDER BY elo DESC LIMIT 1`,
				[guildId]
			)
		]);

		return {
			total_games: parseInt(gamesResult.rows[0].count, 10),
			total_players: parseInt(playersResult.rows[0].count, 10),
			avg_elo: parseFloat(playersResult.rows[0].avg_elo || '1000'),
			top_player: topPlayerResult.rows[0] || null
		};
	}

	async getRecentGames(guildId: string, limit: number = 10): Promise<GameHistoryRecord[]> {
		const result = await this.client.query<GameHistoryRecord>(
			`SELECT * FROM game_history
       WHERE guild_id = $1
       ORDER BY played_at DESC
       LIMIT $2`,
			[guildId, limit]
		);

		return result.rows.map(row => ({
			...row,
			votes: row.votes as Record<string, string>,
			elo_changes: row.elo_changes as Record<string, number>
		}));
	}

	// Utility
	async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
		const result = await this.client.query(sql, params);
		return result.rows as T[];
	}
}
