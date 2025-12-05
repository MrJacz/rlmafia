import { PrismaPg } from '@prisma/adapter-pg';
import { type ActiveRound, type GameHistory, type Guild, type Player, PrismaClient } from '../generated/prisma/client';

export enum GameState {
	IDLE = 'IDLE',
	LOBBY = 'LOBBY',
	PLAYING = 'PLAYING',
	VOTING = 'VOTING',
	RESOLVING = 'RESOLVING'
}

export enum PlayerTeam {
	NOTEAM = 0,
	TEAM1 = 1,
	TEAM2 = 2
}

export type GuildRecord = Guild;
export type PlayerRecord = Player;
export type ActiveRoundRecord = ActiveRound & {
	player_teams: Record<string, 1 | 2>;
	votes: Record<string, string>;
};
export type GameHistoryRecord = GameHistory & {
	votes: Record<string, string>;
	elo_changes: Record<string, number>;
};

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
	private adapter: PrismaPg;
	private prisma: PrismaClient;

	constructor(connectionString: string) {
		this.adapter = new PrismaPg({ connectionString });
		this.prisma = new PrismaClient({ adapter: this.adapter });
	}

	// Guild operations
	async getOrCreateGuild(guildId: string): Promise<GuildRecord> {
		return this.prisma.guild.upsert({
			where: { guildId },
			create: { guildId },
			update: { updatedAt: new Date() }
		});
	}

	async updateGuildState(guildId: string, state: GameState, inProgress?: boolean): Promise<void> {
		const data = {
			gameState: state,
			updatedAt: new Date()
		};

		if (inProgress !== undefined) Object.defineProperty(data, 'inProgress', inProgress);

		await this.prisma.guild.update({
			where: { guildId },
			data
		});
	}

	async updateGuildActivePlayers(guildId: string, activeIds: string[]): Promise<void> {
		await this.prisma.guild.update({
			where: { guildId },
			data: {
				activePlayerIds: activeIds,
				updatedAt: new Date()
			}
		});
	}

	async setNumMafia(guildId: string, numMafia: number): Promise<void> {
		await this.prisma.guild.update({
			where: { guildId },
			data: {
				numMafia,
				updatedAt: new Date()
			}
		});
	}

	// Player operations
	async getOrCreatePlayer(guildId: string, userId: string, displayName: string): Promise<PlayerRecord> {
		return this.prisma.player.upsert({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			},
			create: {
				guildId,
				userId,
				displayName
			},
			update: {
				displayName,
				updatedAt: new Date()
			}
		});
	}

	async getPlayer(guildId: string, userId: string): Promise<PlayerRecord | null> {
		return this.prisma.player.findUnique({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			}
		});
	}

	async removePlayer(guildId: string, userId: string): Promise<void> {
		await this.prisma.player.delete({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			}
		});
	}

	async getGuildPlayers(guildId: string): Promise<PlayerRecord[]> {
		return this.prisma.player.findMany({
			where: { guildId },
			orderBy: { elo: 'desc' }
		});
	}

	async getLeaderboard(guildId: string, limit: number = 50): Promise<PlayerRecord[]> {
		return this.prisma.player.findMany({
			where: { guildId },
			orderBy: { elo: 'desc' },
			take: limit
		});
	}

	// ELO operations
	async updatePlayerElo(guildId: string, userId: string, eloDelta: number, updates: Partial<EloUpdate>): Promise<void> {
		const player = await this.getPlayer(guildId, userId);
		if (!player) return;

		const newElo = Math.max(0, player.elo + eloDelta);
		const newPeakElo = Math.max(player.peakElo, newElo);

		await this.prisma.player.update({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			},
			data: {
				elo: newElo,
				peakElo: newPeakElo,
				totalRounds: { increment: updates.totalRounds || 0 },
				mafiaRounds: { increment: updates.mafiaRounds || 0 },
				mafiaWins: { increment: updates.mafiaWins || 0 },
				correctVotes: { increment: updates.correctVotes || 0 },
				totalVotes: { increment: updates.totalVotes || 0 },
				updatedAt: new Date()
			}
		});
	}

	async bulkUpdateElo(guildId: string, updates: Map<string, EloUpdate>): Promise<void> {
		// Use transaction for consistency
		await this.prisma.$transaction(
			Array.from(updates.entries()).map(
				([userId, update]) =>
					this.prisma.$queryRaw`
					UPDATE players
					SET
						elo = GREATEST(0, elo + ${update.eloDelta}),
						peak_elo = GREATEST(peak_elo, GREATEST(0, elo + ${update.eloDelta})),
						total_rounds = total_rounds + ${update.totalRounds || 0},
						mafia_rounds = mafia_rounds + ${update.mafiaRounds || 0},
						mafia_wins = mafia_wins + ${update.mafiaWins || 0},
						correct_votes = correct_votes + ${update.correctVotes || 0},
						total_votes = total_votes + ${update.totalVotes || 0},
						updated_at = NOW()
					WHERE guild_id = ${guildId} AND user_id = ${userId}
				`
			)
		);
	}

	// Round operations
	async startRound(
		guildId: string,
		mafiaIds: string[],
		innocentIds: string[],
		teams: Record<string, 1 | 2>
	): Promise<void> {
		// Delete any existing active round first
		await this.prisma.activeRound.deleteMany({
			where: { guildId }
		});

		// Insert new active round
		await this.prisma.activeRound.create({
			data: {
				guildId,
				mafiaIds,
				innocentIds,
				playerTeams: teams,
				votes: {}
			}
		});
	}

	async getActiveRound(guildId: string): Promise<ActiveRoundRecord | null> {
		const round = await this.prisma.activeRound.findUnique({
			where: { guildId }
		});

		if (!round) return null;

		return {
			...round,
			player_teams: round.playerTeams as Record<string, 1 | 2>,
			votes: round.votes as Record<string, string>
		};
	}

	async saveVote(guildId: string, voterId: string, suspectId: string): Promise<void> {
		const round = await this.prisma.activeRound.findUnique({
			where: { guildId }
		});

		if (!round) return;

		const votes = round.votes as Record<string, string>;
		votes[voterId] = suspectId;

		await this.prisma.activeRound.update({
			where: { guildId },
			data: { votes }
		});
	}

	async completeRound(guildId: string, winningTeam: 1 | 2, eloChanges: Record<string, number>): Promise<void> {
		// Get active round data
		const round = await this.getActiveRound(guildId);
		if (!round) return;

		// Determine mafia win
		const mafiaWon = Object.entries(eloChanges).some(([userId, delta]) => round.mafiaIds.includes(userId) && delta > 0);

		// Insert into history
		await this.prisma.gameHistory.create({
			data: {
				guildId,
				mafiaIds: round.mafiaIds,
				winningTeam,
				mafiaWon,
				votes: round.votes,
				eloChanges: eloChanges
			}
		});

		// Delete active round
		await this.prisma.activeRound.delete({
			where: { guildId }
		});
	}

	async resetRound(guildId: string): Promise<void> {
		await this.prisma.activeRound.deleteMany({
			where: { guildId }
		});

		await this.updateGuildState(guildId, GameState.IDLE, false);
		await this.updateGuildActivePlayers(guildId, []);
	}

	// Stats operations
	async getGuildStats(guildId: string): Promise<GuildStats> {
		const [totalGames, playersData, topPlayer] = await Promise.all([
			this.prisma.gameHistory.count({ where: { guildId } }),
			this.prisma.player.aggregate({
				where: { guildId },
				_count: true,
				_avg: { elo: true }
			}),
			this.prisma.player.findFirst({
				where: { guildId },
				orderBy: { elo: 'desc' },
				select: {
					userId: true,
					displayName: true,
					elo: true
				}
			})
		]);

		return {
			total_games: totalGames,
			total_players: playersData._count,
			avg_elo: playersData._avg.elo || 1000,
			top_player: topPlayer
				? {
						user_id: topPlayer.userId,
						display_name: topPlayer.displayName || 'Unknown',
						elo: topPlayer.elo
					}
				: null
		};
	}

	async getRecentGames(guildId: string, limit: number = 10): Promise<GameHistoryRecord[]> {
		const games = await this.prisma.gameHistory.findMany({
			where: { guildId },
			orderBy: { playedAt: 'desc' },
			take: limit
		});

		return games.map((game) => ({
			...game,
			votes: game.votes as Record<string, string>,
			elo_changes: game.eloChanges as Record<string, number>
		}));
	}

	// Expose Prisma client for advanced queries
	get client() {
		return this.prisma;
	}
}
