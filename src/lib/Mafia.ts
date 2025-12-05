import { Collection, GuildMember, Snowflake } from 'discord.js';
import { DatabaseService, GameState, type PlayerRecord, type EloUpdate } from './database';
import { EloCalculator } from './elo';
import { shuffle } from './utils';

export class MafiaGame {
	private db: DatabaseService;
	private guildId: string;

	// In-memory cache (loaded from database)
	players: Collection<Snowflake, MafiaPlayer> = new Collection();
	numMafia: number = 1;
	gameState: GameState = GameState.IDLE;
	votes: Map<Snowflake, Snowflake> = new Map();

	// Round state (fixes missing property bugs)
	activePlayerIds: string[] = [];
	subs: string[] = [];
	mafiaIds: Set<string> = new Set();
	innocentIds: Set<string> = new Set();

	constructor(guildId: string, db: DatabaseService) {
		this.guildId = guildId;
		this.db = db;
	}

	/**
	 * Initialize game state from database
	 * Called when MafiaManager creates or retrieves a game
	 */
	async initialize(): Promise<void> {
		const guild = await this.db.getOrCreateGuild(this.guildId);
		this.numMafia = guild.num_mafia;
		this.gameState = guild.game_state as GameState;

		// Load players from database
		const players = await this.db.getGuildPlayers(this.guildId);
		this.players.clear();
		for (const record of players) {
			this.players.set(record.user_id, MafiaPlayer.fromRecord(record));
		}

		// Restore active round if exists
		if (guild.in_progress) {
			const round = await this.db.getActiveRound(this.guildId);
			if (round) {
				this.activePlayerIds = guild.active_player_ids;
				this.subs = guild.sub_player_ids;
				this.mafiaIds = new Set(round.mafia_ids);
				this.innocentIds = new Set(round.innocent_ids);
				this.votes = new Map(Object.entries(round.votes || {}));

				// Restore team assignments
				for (const [userId, team] of Object.entries(round.player_teams)) {
					const player = this.players.get(userId);
					if (player) {
						player.team = team;
					}
				}

				// Restore mafia flags
				for (const userId of this.mafiaIds) {
					const player = this.players.get(userId);
					if (player) {
						player.mafia = true;
					}
				}
			}
		}
	}

	// --- player management ---
	async addPlayer(member: GuildMember): Promise<void> {
		if (!this.players.has(member.id)) {
			const record = await this.db.getOrCreatePlayer(this.guildId, member.id, member.displayName);
			this.players.set(member.id, MafiaPlayer.fromRecord(record, member));
		}
	}

	async removePlayer(id: Snowflake): Promise<void> {
		await this.db.removePlayer(this.guildId, id);
		this.players.delete(id);

		// Remove from active arrays
		this.activePlayerIds = this.activePlayerIds.filter(x => x !== id);
		this.subs = this.subs.filter(x => x !== id);

		// Remove votes
		this.votes.delete(id);
		for (const [voter, suspect] of Array.from(this.votes.entries())) {
			if (suspect === id) this.votes.delete(voter);
		}

		// Remove from role sets
		this.mafiaIds.delete(id);
		this.innocentIds.delete(id);

		// Update database
		if (this.gameState !== GameState.IDLE) {
			await this.db.updateGuildActivePlayers(this.guildId, this.activePlayerIds, this.subs);
		}
	}

	async setNumMafia(num: number): Promise<void> {
		this.numMafia = Math.max(1, Math.floor(num));
		await this.db.setNumMafia(this.guildId, this.numMafia);
	}

	// --- round lifecycle ---
	async startGame(): Promise<void> {
		if (this.players.size < 4) throw new Error('Need at least 4 players');

		// Reset round state
		this.votes.clear();
		this.mafiaIds.clear();
		this.innocentIds.clear();

		// Choose up to 8 active players, rest are subs
		const allPlayerIds = Array.from(this.players.keys());
		const shuffledIds = shuffle(allPlayerIds);

		if (shuffledIds.length > 8) {
			this.activePlayerIds = shuffledIds.slice(0, 8);
			this.subs = shuffledIds.slice(8);
		} else {
			this.activePlayerIds = shuffledIds;
			this.subs = [];
		}

		// Ensure requested mafia count is feasible
		const maxMafia = Math.max(1, Math.min(2, Math.floor(this.activePlayerIds.length / 3)));
		this.numMafia = Math.min(this.numMafia, maxMafia);

		this.gameState = GameState.PLAYING;

		this.assignRoles(); // roles first (fixes bug: was using undefined 'actives')
		this.assignTeams(); // then split teams

		// Build team assignments for database
		const playerTeams: Record<string, 1 | 2> = {};
		for (const id of this.activePlayerIds) {
			const player = this.players.get(id);
			if (player && player.team !== 0) {
				playerTeams[id] = player.team as 1 | 2;
			}
		}

		// Persist to database
		await this.db.startRound(this.guildId, Array.from(this.mafiaIds), Array.from(this.innocentIds), playerTeams);
		await this.db.updateGuildState(this.guildId, GameState.PLAYING, true);
		await this.db.updateGuildActivePlayers(this.guildId, this.activePlayerIds, this.subs);
	}

	// --- assignments ---
	private assignRoles(): void {
		// Fix bug: was 'shuffle(actives)' but actives was undefined
		const shuffled = shuffle(this.activePlayerIds);
		const mafiaIds = shuffled.slice(0, this.numMafia);
		const innocentIds = shuffled.slice(this.numMafia);

		this.mafiaIds = new Set(mafiaIds);
		this.innocentIds = new Set(innocentIds);

		for (const [id, player] of this.players) {
			player.mafia = this.mafiaIds.has(id);
		}
	}

	private assignTeams(): void {
		// Shuffle actives then "deal" players to teams alternately
		const shuffled = shuffle(this.activePlayerIds);
		for (let i = 0; i < shuffled.length; i++) {
			const id = shuffled[i];
			const player = this.players.get(id);
			if (!player) continue;
			player.team = (i % 2 === 0 ? 1 : 2) as 1 | 2;
		}
	}

	// --- voting ---
	registerVote(voterId: Snowflake, suspectId: Snowflake): void {
		if (this.gameState === GameState.IDLE) throw new Error('Game not in progress');

		// Only active players can vote and only for active players
		if (!this.activePlayerIds.includes(voterId)) throw new Error('Only active players can vote');
		if (!this.activePlayerIds.includes(suspectId)) throw new Error('You can only vote for active players');

		if (voterId === suspectId) throw new Error('Cannot vote for yourself');

		// Voter and suspect must exist
		if (!this.players.has(voterId) || !this.players.has(suspectId)) throw new Error('Invalid vote');

		this.votes.set(voterId, suspectId);
	}

	allVotesIn(): boolean {
		const activeCount = this.activePlayerIds.length;
		return this.votes.size === activeCount;
	}

	// --- ELO scoring (replaces old calculatePoints) ---
	async calculateElo(winningTeam: 1 | 2): Promise<Map<string, number>> {
		if (this.gameState === GameState.IDLE) throw new Error('No round in progress');

		// Build player teams map
		const playerTeams: Record<string, 1 | 2> = {};
		for (const id of this.activePlayerIds) {
			const player = this.players.get(id);
			if (player && player.team !== 0) {
				playerTeams[id] = player.team as 1 | 2;
			}
		}

		// Build votes record
		const voteRecord: Record<string, string> = {};
		for (const [voterId, suspectId] of this.votes) {
			voteRecord[voterId] = suspectId;
		}

		// Calculate ELO changes
		const eloResults = EloCalculator.calculateRoundElo(this.mafiaIds, winningTeam, playerTeams, voteRecord);

		const eloChanges = new Map<string, number>();
		for (const result of eloResults) {
			eloChanges.set(result.userId, result.eloDelta);
		}

		// Build database updates
		const updates = new Map<string, EloUpdate>();
		for (const [userId, delta] of eloChanges) {
			const player = this.players.get(userId);
			if (!player) continue;

			const isMafia = this.mafiaIds.has(userId);
			const votedForMafia = this.votes.has(userId) && this.mafiaIds.has(this.votes.get(userId)!);
			const mafiaWon = delta > 0 && isMafia;

			updates.set(userId, {
				eloDelta: delta,
				totalRounds: 1,
				mafiaRounds: isMafia ? 1 : 0,
				mafiaWins: mafiaWon ? 1 : 0,
				correctVotes: votedForMafia ? 1 : 0,
				totalVotes: this.votes.has(userId) ? 1 : 0
			});
		}

		// Persist ELO changes to database
		await this.db.bulkUpdateElo(this.guildId, updates);
		await this.db.completeRound(this.guildId, winningTeam, Object.fromEntries(eloChanges));

		// Update in-memory player ELO
		for (const [userId, delta] of eloChanges) {
			const player = this.players.get(userId);
			if (player) {
				player.elo = Math.max(0, player.elo + delta);
				player.peakElo = Math.max(player.peakElo, player.elo);

				// Update stats
				player.totalRounds++;
				if (this.mafiaIds.has(userId)) {
					player.mafiaRounds++;
					if (delta > 0) {
						player.mafiaWins++;
					}
				}
				if (this.votes.has(userId)) {
					player.totalVotes++;
					if (this.mafiaIds.has(this.votes.get(userId)!)) {
						player.correctVotes++;
					}
				}
			}
		}

		return eloChanges;
	}

	// --- utility / views ---
	getLeaderboard(): Array<{ name: string; elo: number; score: number; mafia: boolean }> {
		return Array.from(this.players.values())
			.sort((a, b) => b.elo - a.elo)
			.map(p => ({
				name: p.displayName,
				elo: p.elo,
				score: p.elo, // For backward compatibility with old code
				mafia: p.mafia
			}));
	}

	async resetGame(): Promise<void> {
		this.gameState = GameState.IDLE;
		this.mafiaIds.clear();
		this.innocentIds.clear();
		this.votes.clear();
		this.activePlayerIds = [];
		this.subs = [];

		for (const player of this.players.values()) {
			player.reset();
		}

		await this.db.resetRound(this.guildId);
	}

	// Computed properties
	get inProgress(): boolean {
		return this.gameState !== GameState.IDLE;
	}
}

export class MafiaPlayer {
	user: GuildMember | null = null;
	userId: string;
	displayName: string;

	// Persistent stats (loaded from database)
	elo: number = 1000;
	totalRounds: number = 0;
	mafiaRounds: number = 0;
	mafiaWins: number = 0;
	correctVotes: number = 0;
	totalVotes: number = 0;
	peakElo: number = 1000;

	// Round-specific (ephemeral)
	mafia: boolean = false;
	team: 0 | 1 | 2 = 0;

	constructor(user: GuildMember, record?: PlayerRecord) {
		this.user = user;
		this.userId = user.id;
		this.displayName = user.displayName;

		if (record) {
			this.elo = record.elo;
			this.totalRounds = record.total_rounds;
			this.mafiaRounds = record.mafia_rounds;
			this.mafiaWins = record.mafia_wins;
			this.correctVotes = record.correct_votes;
			this.totalVotes = record.total_votes;
			this.peakElo = record.peak_elo;
		}
	}

	static fromRecord(record: PlayerRecord, member?: GuildMember): MafiaPlayer {
		// Create a pseudo GuildMember if not provided
		if (!member) {
			const player = new MafiaPlayer({ id: record.user_id, displayName: record.display_name } as GuildMember, record);
			player.userId = record.user_id;
			player.displayName = record.display_name;
			return player;
		}
		return new MafiaPlayer(member, record);
	}

	get winRate(): number {
		return this.mafiaRounds > 0 ? (this.mafiaWins / this.mafiaRounds) * 100 : 0;
	}

	get accuracy(): number {
		return this.totalVotes > 0 ? (this.correctVotes / this.totalVotes) * 100 : 0;
	}

	reset(): void {
		this.mafia = false;
		this.team = 0;
	}
}

export class MafiaManager extends Collection<Snowflake, MafiaGame> {
	private db: DatabaseService;

	constructor(db: DatabaseService) {
		super();
		this.db = db;
	}

	async add(guildId: Snowflake): Promise<MafiaGame> {
		let game = this.get(guildId);
		if (game) return game;

		game = new MafiaGame(guildId, this.db);
		await game.initialize();
		this.set(guildId, game);
		return game;
	}
}
