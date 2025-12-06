import { PrismaPg } from '@prisma/adapter-pg';
import {
	type EloChange,
	type Guild,
	type GuildMember,
	PrismaClient,
	type Round,
	type RoundParticipant,
	type Vote
} from '../generated/prisma/client';

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

export enum RoundStatus {
	ACTIVE = 'ACTIVE',
	VOTING = 'VOTING',
	COMPLETED = 'COMPLETED',
	ABANDONED = 'ABANDONED'
}

// Type exports
export type GuildRecord = Guild;
export type GuildMemberRecord = GuildMember;
export type RoundRecord = Round;
export type RoundParticipantRecord = RoundParticipant;
export type VoteRecord = Vote;
export type EloChangeRecord = EloChange;

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

export interface EloChangeData {
	userId: string;
	delta: number;
	previousElo: number;
	newElo: number;
	reason: string;
}

export class DatabaseService {
	private adapter: PrismaPg;
	private prisma: PrismaClient;

	constructor(connectionString: string) {
		this.adapter = new PrismaPg({ connectionString });
		this.prisma = new PrismaClient({ adapter: this.adapter });
	}

	// ============================================================================
	// GUILD OPERATIONS
	// ============================================================================

	async getOrCreateGuild(guildId: string): Promise<GuildRecord> {
		return this.prisma.guild.upsert({
			where: { guildId },
			create: { guildId },
			update: { updatedAt: new Date() }
		});
	}

	async updateGuildState(guildId: string, state: GameState, inProgress?: boolean): Promise<void> {
		const data: { gameState: string; updatedAt: Date; inProgress?: boolean } = {
			gameState: state,
			updatedAt: new Date()
		};

		if (inProgress !== undefined) {
			data.inProgress = inProgress;
		}

		await this.prisma.guild.update({
			where: { guildId },
			data
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

	async setMaxActivePlayers(guildId: string, maxActivePlayers: number): Promise<void> {
		// Clamp between 8 and 16
		const clamped = Math.max(8, Math.min(16, maxActivePlayers));

		await this.prisma.guild.update({
			where: { guildId },
			data: {
				maxActivePlayers: clamped,
				updatedAt: new Date()
			}
		});
	}

	// ============================================================================
	// GUILD MEMBER OPERATIONS
	// ============================================================================

	async getOrCreateMember(guildId: string, userId: string, displayName: string): Promise<GuildMemberRecord> {
		return this.prisma.guildMember.upsert({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			},
			create: {
				guildId,
				userId,
				displayName,
				isActive: true
			},
			update: {
				displayName,
				updatedAt: new Date()
			}
		});
	}

	async getMember(guildId: string, userId: string): Promise<GuildMemberRecord | null> {
		return this.prisma.guildMember.findUnique({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			}
		});
	}

	async removeMember(guildId: string, userId: string): Promise<void> {
		await this.prisma.guildMember.delete({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			}
		});
	}

	async getGuildMembers(guildId: string): Promise<GuildMemberRecord[]> {
		return this.prisma.guildMember.findMany({
			where: { guildId },
			orderBy: { elo: 'desc' }
		});
	}

	async getActiveMembers(guildId: string): Promise<GuildMemberRecord[]> {
		return this.prisma.guildMember.findMany({
			where: {
				guildId,
				isActive: true
			},
			orderBy: { elo: 'desc' }
		});
	}

	async setMemberActive(guildId: string, userId: string, isActive: boolean): Promise<void> {
		await this.prisma.guildMember.update({
			where: {
				guildId_userId: {
					guildId,
					userId
				}
			},
			data: {
				isActive,
				updatedAt: new Date()
			}
		});
	}

	async getLeaderboard(guildId: string, limit: number = 50): Promise<GuildMemberRecord[]> {
		return this.prisma.guildMember.findMany({
			where: { guildId },
			orderBy: { elo: 'desc' },
			take: limit
		});
	}

	// ============================================================================
	// ELO OPERATIONS
	// ============================================================================

	async updateMemberElo(guildId: string, userId: string, eloDelta: number, updates: Partial<EloUpdate>): Promise<void> {
		const member = await this.getMember(guildId, userId);
		if (!member) return;

		const newElo = Math.max(0, member.elo + eloDelta);
		const newPeakElo = Math.max(member.peakElo, newElo);

		await this.prisma.guildMember.update({
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
			Array.from(updates.entries()).map(([userId, update]) =>
				this.prisma.$queryRaw`
					UPDATE guild_members
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

	// ============================================================================
	// ROUND OPERATIONS
	// ============================================================================

	async createRound(guildId: string): Promise<RoundRecord> {
		return this.prisma.round.create({
			data: {
				guildId,
				status: RoundStatus.ACTIVE
			}
		});
	}

	async getRound(roundId: number): Promise<RoundRecord | null> {
		return this.prisma.round.findUnique({
			where: { id: roundId }
		});
	}

	async getActiveRound(guildId: string): Promise<RoundRecord | null> {
		return this.prisma.round.findFirst({
			where: {
				guildId,
				status: {
					in: [RoundStatus.ACTIVE, RoundStatus.VOTING]
				}
			}
		});
	}

	async updateRoundStatus(roundId: number, status: RoundStatus): Promise<void> {
		const data: { status: string; reportedAt?: Date; votingStartedAt?: Date; completedAt?: Date } = {
			status
		};

		if (status === RoundStatus.VOTING) {
			data.votingStartedAt = new Date();
		} else if (status === RoundStatus.COMPLETED || status === RoundStatus.ABANDONED) {
			data.completedAt = new Date();
		}

		await this.prisma.round.update({
			where: { id: roundId },
			data
		});
	}

	async setRoundWinner(roundId: number, winningTeam: 1 | 2): Promise<void> {
		await this.prisma.round.update({
			where: { id: roundId },
			data: {
				winningTeam,
				reportedAt: new Date(),
				status: RoundStatus.VOTING,
				votingStartedAt: new Date()
			}
		});
	}

	async completeRound(roundId: number, mafiaWon: boolean): Promise<void> {
		await this.prisma.round.update({
			where: { id: roundId },
			data: {
				status: RoundStatus.COMPLETED,
				mafiaWon,
				completedAt: new Date()
			}
		});
	}

	async abandonRound(roundId: number, reason: string): Promise<void> {
		await this.prisma.round.update({
			where: { id: roundId },
			data: {
				status: RoundStatus.ABANDONED,
				abandonedReason: reason,
				completedAt: new Date()
			}
		});
	}

	async getRecentRounds(guildId: string, limit: number = 10): Promise<RoundRecord[]> {
		return this.prisma.round.findMany({
			where: {
				guildId,
				status: RoundStatus.COMPLETED
			},
			orderBy: { completedAt: 'desc' },
			take: limit
		});
	}

	// ============================================================================
	// ROUND PARTICIPANT OPERATIONS
	// ============================================================================

	async createParticipant(roundId: number, userId: string, isMafia: boolean, team: number): Promise<RoundParticipantRecord> {
		return this.prisma.roundParticipant.create({
			data: {
				roundId,
				userId,
				isMafia,
				team
			}
		});
	}

	async createParticipants(
		roundId: number,
		participants: Array<{ userId: string; isMafia: boolean; team: number }>
	): Promise<void> {
		await this.prisma.roundParticipant.createMany({
			data: participants.map((p) => ({
				roundId,
				...p
			}))
		});
	}

	async getRoundParticipants(roundId: number): Promise<RoundParticipantRecord[]> {
		return this.prisma.roundParticipant.findMany({
			where: { roundId }
		});
	}

	async getMafiaParticipants(roundId: number): Promise<RoundParticipantRecord[]> {
		return this.prisma.roundParticipant.findMany({
			where: {
				roundId,
				isMafia: true
			}
		});
	}

	async substitutePlayer(
		roundId: number,
		oldUserId: string,
		newUserId: string
	): Promise<RoundParticipantRecord> {
		// Get the original participant's role and team
		const originalParticipant = await this.prisma.roundParticipant.findUnique({
			where: {
				roundId_userId: {
					roundId,
					userId: oldUserId
				}
			}
		});

		if (!originalParticipant) {
			throw new Error('Original participant not found');
		}

		// Create substitute participant
		return this.prisma.roundParticipant.create({
			data: {
				roundId,
				userId: newUserId,
				isMafia: originalParticipant.isMafia,
				team: originalParticipant.team,
				isSubstitute: true,
				substitutedFor: oldUserId,
				substitutedAt: new Date()
			}
		});
	}

	// ============================================================================
	// VOTE OPERATIONS
	// ============================================================================

	async createVote(roundId: number, voterId: string, suspectId: string): Promise<VoteRecord> {
		return this.prisma.vote.upsert({
			where: {
				roundId_voterId: {
					roundId,
					voterId
				}
			},
			create: {
				roundId,
				voterId,
				suspectId
			},
			update: {
				suspectId,
				votedAt: new Date()
			}
		});
	}

	async getRoundVotes(roundId: number): Promise<VoteRecord[]> {
		return this.prisma.vote.findMany({
			where: { roundId }
		});
	}

	async markVotesCorrect(roundId: number, mafiaUserIds: string[]): Promise<void> {
		await this.prisma.vote.updateMany({
			where: {
				roundId,
				suspectId: {
					in: mafiaUserIds
				}
			},
			data: {
				isCorrect: true
			}
		});

		await this.prisma.vote.updateMany({
			where: {
				roundId,
				suspectId: {
					notIn: mafiaUserIds
				}
			},
			data: {
				isCorrect: false
			}
		});
	}

	// ============================================================================
	// ELO CHANGE OPERATIONS
	// ============================================================================

	async createEloChange(
		roundId: number,
		guildId: string,
		userId: string,
		delta: number,
		previousElo: number,
		newElo: number,
		reason: string
	): Promise<EloChangeRecord> {
		return this.prisma.eloChange.create({
			data: {
				roundId,
				guildId,
				userId,
				delta,
				previousElo,
				newElo,
				reason
			}
		});
	}

	async createEloChanges(roundId: number, guildId: string, changes: EloChangeData[]): Promise<void> {
		await this.prisma.eloChange.createMany({
			data: changes.map((change) => ({
				roundId,
				guildId,
				...change
			}))
		});
	}

	async getRoundEloChanges(roundId: number): Promise<EloChangeRecord[]> {
		return this.prisma.eloChange.findMany({
			where: { roundId }
		});
	}

	async getMemberEloHistory(guildId: string, userId: string, limit: number = 20): Promise<EloChangeRecord[]> {
		return this.prisma.eloChange.findMany({
			where: {
				guildId,
				userId
			},
			orderBy: { appliedAt: 'desc' },
			take: limit
		});
	}

	// ============================================================================
	// STATS OPERATIONS
	// ============================================================================

	async getGuildStats(guildId: string): Promise<GuildStats> {
		const [totalGames, membersData, topMember] = await Promise.all([
			this.prisma.round.count({
				where: {
					guildId,
					status: RoundStatus.COMPLETED
				}
			}),
			this.prisma.guildMember.aggregate({
				where: { guildId },
				_count: true,
				_avg: { elo: true }
			}),
			this.prisma.guildMember.findFirst({
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
			total_players: membersData._count,
			avg_elo: membersData._avg.elo || 1000,
			top_player: topMember
				? {
						user_id: topMember.userId,
						display_name: topMember.displayName || 'Unknown',
						elo: topMember.elo
					}
				: null
		};
	}

	// ============================================================================
	// UTILITY METHODS
	// ============================================================================

	/**
	 * Reset round state for a guild (for use with /mafia reset command)
	 */
	async resetGuild(guildId: string, reason: string): Promise<void> {
		const activeRound = await this.getActiveRound(guildId);

		if (activeRound) {
			await this.abandonRound(activeRound.id, reason);
		}

		await this.updateGuildState(guildId, GameState.IDLE, false);
	}

	/**
	 * Get all active rounds across all guilds (for state restoration on bot restart)
	 */
	async getAllActiveRounds(): Promise<RoundRecord[]> {
		return this.prisma.round.findMany({
			where: {
				status: {
					in: [RoundStatus.ACTIVE, RoundStatus.VOTING]
				}
			},
			include: {
				guild: true,
				participants: true,
				votes: true
			}
		});
	}

	// Expose Prisma client for advanced queries
	get client() {
		return this.prisma;
	}
}
