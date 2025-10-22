import { Collection, GuildMember, Snowflake } from 'discord.js';
import { randomInt } from 'crypto';

function shuffle<T>(items: T[]): T[] {
	// Fisher–Yates without mutating the original
	const a = items.slice();
	for (let i = a.length - 1; i > 0; i--) {
		// use a cryptographically secure RNG for unbiased shuffling
		const j = randomInt(0, i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

export class MafiaGame {
	players: Collection<Snowflake, MafiaPlayer> = new Collection();

	// configurable
	numMafia: number = 1;

	// round state
	inProgress: boolean = false;
	activePlayerIds: Snowflake[] = [];
	subs: Snowflake[] = [];
	mafiaIds: Set<Snowflake> = new Set();
	innocentIds: Set<Snowflake> = new Set();
	votes: Map<Snowflake, Snowflake> = new Map();

	// --- player management ---
	addPlayer(member: GuildMember) {
		if (!this.players.has(member.id)) {
			this.players.set(member.id, new MafiaPlayer(member));
		}
	}

	setNumMafia(num: number) {
		this.numMafia = Math.max(1, Math.floor(num));
	}

	// --- round lifecycle ---
	startGame() {
		if (this.players.size < 4) throw new Error('Need at least 4 players');

		// reset round state
		this.votes.clear();
		this.mafiaIds.clear();
		this.innocentIds.clear();
		this.activePlayerIds = [];
		this.subs = [];

		// choose up to 8 active players, rest are subs
		const allPlayerIds = Array.from(this.players.keys());
		const shuffledIds = shuffle(allPlayerIds);

		if (shuffledIds.length > 8) {
			this.activePlayerIds = shuffledIds.slice(0, 8);
			this.subs = shuffledIds.slice(8);
		} else {
			this.activePlayerIds = shuffledIds;
			this.subs = [];
		}

		// ensure requested mafia count is feasible
		const maxMafia = Math.max(1, Math.min(2, Math.floor(this.activePlayerIds.length / 3)));
		// cap to a sane upper bound so games stay fun; adjust as you like
		this.numMafia = Math.min(this.numMafia, maxMafia);

		this.inProgress = true;

		this.assignRoles(); // roles first
		this.assignTeams(); // then split teams
	}

	endGame() {
		this.inProgress = false;
	}

	// --- assignments ---
	private assignRoles() {
		const actives = this.activePlayerIds;
		if (actives.length === 0) throw new Error('No active players to assign roles');

		const shuffled = shuffle(actives);
		const mafiaIds = shuffled.slice(0, this.numMafia);
		const innocentIds = shuffled.slice(this.numMafia);

		this.mafiaIds = new Set(mafiaIds);
		this.innocentIds = new Set(innocentIds);

		for (const [id, player] of this.players) {
			player.mafia = this.mafiaIds.has(id);
		}
	}

	private assignTeams() {
		// Shuffle actives then "deal" players to teams alternately to avoid
		// any bias from slicing the array in half.
		const shuffled = shuffle(this.activePlayerIds);
		for (let i = 0; i < shuffled.length; i++) {
			const id = shuffled[i];
			const player = this.players.get(id);
			if (!player) continue;
			player.team = i % 2 === 0 ? 1 : 2;
		}
	}

	// --- voting ---
	registerVote(voterId: Snowflake, suspectId: Snowflake) {
		if (!this.inProgress) throw new Error('Game not in progress');

		// Only active players can vote and only for active players
		if (!this.activePlayerIds.includes(voterId)) throw new Error('Only active players can vote');
		if (!this.activePlayerIds.includes(suspectId)) throw new Error('You can only vote for active players');

		if (voterId === suspectId) throw new Error('Cannot vote for yourself');

		// voter must exist (it will if active), suspect must exist too
		if (!this.players.has(voterId) || !this.players.has(suspectId)) throw new Error('Invalid vote');

		this.votes.set(voterId, suspectId);
	}

	allVotesIn() {
		// Typically all active players vote (including mafia)
		const activeCount = this.activePlayerIds.length;
		return this.votes.size === activeCount;
	}

	// --- scoring ---
	calculatePoints(winningTeam: 1 | 2) {
		if (!this.inProgress) throw new Error('No round in progress');

		const mafiaVotedOut = this.getMafiaVotedOut();

		// Did any mafia end up on the winning RL team?
		const mafiaTeamWon = this.activePlayerIds.some((id) => {
			const p = this.players.get(id);
			return p?.mafia && p.team === winningTeam;
		});

		for (const id of this.activePlayerIds) {
			const player = this.players.get(id);
			if (!player) continue;

			if (player.mafia) {
				// Small twist: if mafia *didn't* win RL and also weren't voted out, they earn 3
				if (!mafiaTeamWon && !mafiaVotedOut) {
					player.score += 3;
				}
			} else {
				// Innocents: +1 if they correctly voted for a mafia member
				const votedFor = this.votes.get(id);
				if (votedFor && this.mafiaIds.has(votedFor)) {
					player.score += 1;
				}
			}
		}

		// Lock the round
		this.endGame();
	}

	private getMafiaVotedOut() {
		// Only consider votes from *active innocents* for majority,
		// and only against *active suspects*.
		const voteCounts: Record<string, number> = {};
		let innocentVotes = 0;

		for (const [voterId, suspectId] of this.votes.entries()) {
			if (!this.activePlayerIds.includes(voterId)) continue;
			if (!this.activePlayerIds.includes(suspectId)) continue;

			const voter = this.players.get(voterId);
			if (voter && !voter.mafia) {
				voteCounts[suspectId] = (voteCounts[suspectId] || 0) + 1;
				innocentVotes++;
			}
		}

		const majority = Math.floor(innocentVotes / 2) + 1;

		for (const mafiaId of this.mafiaIds) {
			const count = voteCounts[mafiaId];
			if (count && count >= majority) {
				return true;
			}
		}
		return false;
	}

	// In MafiaGame class (Mafia.ts)
	removePlayer(id: Snowflake) {
		this.players.delete(id);
		this.activePlayerIds = this.activePlayerIds.filter((x) => x !== id);
		this.subs = this.subs.filter((x) => x !== id);

		// Remove votes cast by or against this player
		this.votes.delete(id);
		for (const [voter, suspect] of Array.from(this.votes.entries())) {
			if (suspect === id) this.votes.delete(voter);
		}

		// Role sets
		this.mafiaIds.delete(id);
		this.innocentIds.delete(id);
	}

	// --- utility / views ---
	getLeaderboard() {
		return Array.from(this.players.values())
			.sort((a, b) => b.score - a.score)
			.map((p) => ({
				name: p.user?.displayName ?? p.user?.user?.username ?? 'Unknown',
				score: p.score,
				mafia: p.mafia
			}));
	}

	resetGame() {
		this.inProgress = false;
		this.mafiaIds.clear();
		this.innocentIds.clear();
		this.votes.clear();
		this.activePlayerIds = [];
		this.subs = [];
		for (const player of this.players.values()) {
			player.reset();
		}
	}
}

export class MafiaPlayer {
	user: GuildMember | null = null;
	score: number = 0;
	mafia: boolean = false;
	team: 0 | 1 | 2 = 0;

	constructor(user: GuildMember) {
		this.user = user;
	}

	reset() {
		this.mafia = false;
		this.team = 0;
	}
}

export class MafiaManager extends Collection<Snowflake, MafiaGame> {
	add(guildId: Snowflake) {
		const exists = this.get(guildId);
		if (exists) return exists;

		const mafiaGame = new MafiaGame();
		this.set(guildId, mafiaGame);
		return mafiaGame;
	}
}
