import { container } from '@sapphire/framework';
import { Collection, type GuildMember, type Snowflake } from 'discord.js';
import { type EloUpdate, GameState, type GuildMemberRecord, PlayerTeam } from './database';
import { EloCalculator } from './elo';
import { pickTeams } from './utils';

export class MafiaGame {
	private guildId: string;

	players: Collection<Snowflake, MafiaPlayer> = new Collection();
	numMafia: number = 1;
	gameState: GameState = GameState.IDLE;
	votes: Map<Snowflake, Snowflake> = new Map();

	constructor(guildId: string) {
		this.guildId = guildId;
	}

	async initialize(): Promise<void> {
		const guild = await container.db.getOrCreateGuild(this.guildId);
		this.numMafia = guild.numMafia;
		this.gameState = guild.gameState as GameState;

		const members = await container.db.getGuildMembers(this.guildId);
		this.players.clear();
		for (const record of members) {
			this.players.set(record.userId, MafiaPlayer.fromRecord(record));
		}

		if (guild.inProgress) {
			const round = await container.db.getActiveRound(this.guildId);
			if (round) {
				// Load participants to restore roles and teams
				const participants = await container.db.getRoundParticipants(round.id);
				for (const participant of participants) {
					const player = this.players.get(participant.userId);
					if (player) {
						player.active = true;
						player.mafia = participant.isMafia;
						player.team = participant.team as PlayerTeam;
					}
				}

				// Load votes
				const votes = await container.db.getRoundVotes(round.id);
				this.votes.clear();
				for (const vote of votes) {
					this.votes.set(vote.voterId, vote.suspectId);
				}
			}
		}
	}

	async addPlayer(member: GuildMember): Promise<void> {
		if (!this.players.has(member.id)) {
			const record = await container.db.getOrCreateMember(this.guildId, member.id, member.displayName);
			this.players.set(member.id, MafiaPlayer.fromRecord(record, member));
		}
	}

	async removePlayer(id: Snowflake): Promise<void> {
		const player = this.players.get(id);
		if (!player) throw new Error('Player doesnt exist');

		// Remove from database
		await container.db.removeMember(this.guildId, id);

		// Remove from local collection
		this.players.delete(id);

		// Clear any votes involving this player
		this.votes.delete(id);
		for (const [voter, suspect] of Array.from(this.votes.entries())) {
			if (suspect === id) this.votes.delete(voter);
		}
	}

	async setNumMafia(num: number): Promise<void> {
		this.numMafia = Math.max(1, Math.floor(num));
		await container.db.setNumMafia(this.guildId, this.numMafia);
	}

	async startGame(): Promise<void> {
		// Get guild configuration
		const guild = await container.db.getOrCreateGuild(this.guildId);

		// Get active members from database
		const activeMembers = await container.db.getActiveMembers(this.guildId);

		if (activeMembers.length < 4) throw new Error('Need at least 4 active players');

		// Select up to maxActivePlayers for this round
		const selectedMembers = activeMembers.slice(0, guild.maxActivePlayers);

		// Mark selected players as active for this round
		for (const player of this.players.values()) {
			player.active = selectedMembers.some((m) => m.userId === player.userId);
		}

		// Calculate Mafia count (max 1/3 of active players, capped at 2)
		const maxMafia = Math.max(1, Math.min(2, Math.floor(selectedMembers.length / 3)));
		this.numMafia = Math.min(this.numMafia, maxMafia);

		this.gameState = GameState.PLAYING;

		// Assign roles and teams
		this.assignRoles();
		this.assignTeams();

		// Create Round record in database
		const round = await container.db.createRound(this.guildId);

		// Create RoundParticipant records
		const participants = this.activePlayers.map((player) => ({
			userId: player.userId,
			isMafia: player.mafia,
			team: player.team
		}));
		await container.db.createParticipants(round.id, participants);

		// Update guild state
		await container.db.updateGuildState(this.guildId, GameState.PLAYING, true);
	}

	private assignRoles(): void {
		const mafiaPlayers = this.activePlayers.random(this.numMafia);

		for (const player of mafiaPlayers) player.mafia = true;
	}

	private assignTeams(): void {
		const { one, two } = pickTeams(this.players.values());

		for (const player of one) player.team = PlayerTeam.TEAM1;
		for (const player of two) player.team = PlayerTeam.TEAM2;
	}

	registerVote(voterId: Snowflake, suspectId: Snowflake): void {
		if (this.gameState === GameState.IDLE) throw new Error('Game not in progress');
		if (voterId === suspectId) throw new Error('Cannot vote for yourself');
		if (!this.players.has(voterId) || !this.players.has(suspectId)) throw new Error('Invalid vote');

		this.votes.set(voterId, suspectId);
	}

	allVotesIn(): boolean {
		return this.votes.size === this.activePlayers.size;
	}

	async calculateElo(winningTeam: 1 | 2): Promise<Map<string, number>> {
		if (this.gameState === GameState.IDLE) throw new Error('No round in progress');

		// Get active round
		const round = await container.db.getActiveRound(this.guildId);
		if (!round) throw new Error('No active round found');

		const playerTeams: Record<Snowflake, 1 | 2> = {};
		for (const player of this.activePlayers.values()) {
			if (player.team !== PlayerTeam.NOTEAM) playerTeams[player.userId] = player.team;
		}

		const voteRecord: Record<string, string> = {};
		for (const [voterId, suspectId] of this.votes) voteRecord[voterId] = suspectId;

		// Calculate ELO changes
		const eloResults = EloCalculator.calculateRoundElo(
			new Set(this.mafiaPlayers.keys()),
			winningTeam,
			playerTeams,
			voteRecord
		);

		const eloChanges = new Map<string, number>();
		for (const result of eloResults) eloChanges.set(result.userId, result.eloDelta);

		// Prepare EloChange records with reasons
		const eloChangeData = [];
		for (const result of eloResults) {
			const player = this.players.get(result.userId);
			if (!player) continue;

			const isMafia = this.mafiaPlayers.has(result.userId);
			const mafiaWon = result.eloDelta > 0 && isMafia;

			let reason = '';
			if (isMafia) {
				reason = mafiaWon ? 'Mafia win' : 'Mafia caught';
			} else {
				reason = this.votes.has(result.userId)
					? this.mafiaPlayers.has(this.votes.get(result.userId)!)
						? 'Correct vote'
						: 'Incorrect vote'
					: 'No vote';
			}

			eloChangeData.push({
				userId: result.userId,
				delta: result.eloDelta,
				previousElo: player.elo,
				newElo: Math.max(0, player.elo + result.eloDelta),
				reason
			});
		}

		// Create ELO change audit records
		await container.db.createEloChanges(round.id, this.guildId, eloChangeData);

		// Prepare bulk ELO updates
		const updates = new Map<string, EloUpdate>();
		for (const [userId, delta] of eloChanges) {
			const player = this.players.get(userId);
			if (!player) continue;

			const isMafia = this.mafiaPlayers.has(userId);
			const votedForMafia = this.votes.has(userId) && this.mafiaPlayers.has(this.votes.get(userId)!);
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

		// Mark votes as correct/incorrect
		await container.db.markVotesCorrect(
			round.id,
			Array.from(this.mafiaPlayers.keys())
		);

		// Bulk update member ELO and stats
		await container.db.bulkUpdateElo(this.guildId, updates);

		// Complete the round
		const mafiaTeamLost = this.mafiaPlayers.first()?.team !== winningTeam;
		const mafiaWon = mafiaTeamLost; // TODO: Add vote detection logic
		await container.db.completeRound(round.id, mafiaWon);

		// Update local player stats
		for (const [userId, delta] of eloChanges) {
			const player = this.players.get(userId);
			if (player) {
				player.elo = Math.max(0, player.elo + delta);
				player.peakElo = Math.max(player.peakElo, player.elo);

				player.totalRounds++;
				if (this.mafiaPlayers.has(userId)) {
					player.mafiaRounds++;
					if (delta > 0) {
						player.mafiaWins++;
					}
				}
				if (this.votes.has(userId)) {
					player.totalVotes++;
					if (this.mafiaPlayers.has(this.votes.get(userId)!)) {
						player.correctVotes++;
					}
				}
			}
		}

		return eloChanges;
	}

	getLeaderboard(): Array<{ name: string; elo: number; mafia: boolean }> {
		return Array.from(this.players.values())
			.sort((a, b) => b.elo - a.elo)
			.map((p) => ({
				name: p.displayName,
				elo: p.elo,
				mafia: p.mafia
			}));
	}

	async substitutePlayer(oldUserId: Snowflake, newUserId: Snowflake): Promise<void> {
		if (this.gameState === GameState.IDLE) throw new Error('No round in progress');

		const oldPlayer = this.players.get(oldUserId);
		const newPlayer = this.players.get(newUserId);

		if (!oldPlayer) throw new Error('Old player not found');
		if (!newPlayer) throw new Error('New player not found');
		if (!oldPlayer.active) throw new Error('Old player is not in current round');
		if (newPlayer.active) throw new Error('New player is already in current round');

		// Get active round
		const round = await container.db.getActiveRound(this.guildId);
		if (!round) throw new Error('No active round found');

		// Create substitute participant in database
		await container.db.substitutePlayer(round.id, oldUserId, newUserId);

		// Update local state: transfer role and team
		newPlayer.active = true;
		newPlayer.mafia = oldPlayer.mafia;
		newPlayer.team = oldPlayer.team;

		oldPlayer.active = false;
		oldPlayer.reset();

		// Transfer any votes
		if (this.votes.has(oldUserId)) {
			const suspectId = this.votes.get(oldUserId)!;
			this.votes.delete(oldUserId);
			this.votes.set(newUserId, suspectId);
		}

		// Update votes that targeted the old player
		for (const [voterId, suspectId] of this.votes.entries()) {
			if (suspectId === oldUserId) {
				this.votes.set(voterId, newUserId);
			}
		}
	}

	async resetGame(): Promise<void> {
		this.gameState = GameState.IDLE;
		this.votes.clear();

		this.resetPlayers();

		await container.db.resetGuild(this.guildId, 'Manual reset');
	}

	private resetPlayers() {
		for (const player of this.players.values()) player.reset();
	}

	get inProgress(): boolean {
		return this.gameState !== GameState.IDLE;
	}

	get activePlayers() {
		return this.players.filter((player) => player.active);
	}

	get mafiaPlayers() {
		return this.activePlayers.filter((player) => player.mafia);
	}

	get teamOnePlayers() {
		return this.activePlayers.filter((player) => player.team === PlayerTeam.TEAM1);
	}

	get teamTwoPlayers() {
		return this.activePlayers.filter((player) => player.team === PlayerTeam.TEAM2);
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
	active: boolean = false;
	mafia: boolean = false;
	team: PlayerTeam = PlayerTeam.NOTEAM;

	constructor(user: GuildMember, record?: GuildMemberRecord) {
		this.user = user;
		this.userId = user.id;
		this.displayName = user.displayName;

		if (record) {
			this.elo = record.elo;
			this.totalRounds = record.totalRounds;
			this.mafiaRounds = record.mafiaRounds;
			this.mafiaWins = record.mafiaWins;
			this.correctVotes = record.correctVotes;
			this.totalVotes = record.totalVotes;
			this.peakElo = record.peakElo;
		}
	}

	public getRoleMessage() {
		return this.mafia ? 'You are **MAFIA**. Blend in, lose RL, and avoid being voted out.' : 'You are **INNOCENT**. Win RL and find the mafia.';
	}

	static fromRecord(record: GuildMemberRecord, member?: GuildMember): MafiaPlayer {
		// Create a pseudo GuildMember if not provided
		if (!member) {
			const player = new MafiaPlayer(
				{ id: record.userId, displayName: record.displayName || 'Unknown' } as GuildMember,
				record
			);
			player.userId = record.userId;
			player.displayName = record.displayName || 'Unknown';
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
		this.team = PlayerTeam.NOTEAM;
		this.active = false;
	}
}

export class MafiaManager extends Collection<Snowflake, MafiaGame> {
	async add(guildId: Snowflake): Promise<MafiaGame> {
		let game = this.get(guildId);
		if (game) return game;

		game = new MafiaGame(guildId);
		await game.initialize();
		this.set(guildId, game);
		return game;
	}
}
