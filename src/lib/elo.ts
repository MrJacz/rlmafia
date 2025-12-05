/**
 * ELO Rating System for Rocket League Mafia
 *
 * Calculates ELO adjustments based on game outcomes:
 * - Mafia: +30 for successful sabotage, -30 for failure
 * - Voters: +5 for correct vote, -3 for incorrect vote
 */

export interface EloCalculationResult {
	userId: string;
	eloDelta: number;
	reason: string;
}

export class EloCalculator {
	// ELO adjustments from DESIGN.md specification
	private static readonly MAFIA_WIN = 30;
	private static readonly MAFIA_LOSS = -30;
	private static readonly CORRECT_VOTE = 5;
	private static readonly INCORRECT_VOTE = -3;

	/**
	 * Calculate ELO changes for all players in a round
	 *
	 * @param mafiaIds - Set of mafia player IDs
	 * @param winningTeam - Team that won the RL match (1 or 2)
	 * @param playerTeams - Map of userId -> team number
	 * @param votes - Map of voterId -> suspectId
	 * @returns Array of ELO adjustments
	 */
	static calculateRoundElo(
		mafiaIds: Set<string>,
		winningTeam: 1 | 2,
		playerTeams: Record<string, 1 | 2>,
		votes: Record<string, string>
	): EloCalculationResult[] {
		const results: EloCalculationResult[] = [];

		// Determine if mafia won (their team lost AND they weren't voted out)
		const mafiaVotedOut = EloCalculator.wasMafiaVotedOut(mafiaIds, votes);
		const mafiaTeamLost = Array.from(mafiaIds).every((id) => playerTeams[id] !== winningTeam);
		const mafiaWon = mafiaTeamLost && !mafiaVotedOut;

		// Calculate mafia ELO
		for (const mafiaId of mafiaIds) {
			if (mafiaWon) {
				results.push({
					userId: mafiaId,
					eloDelta: EloCalculator.MAFIA_WIN,
					reason: 'Mafia win: team lost, not voted out'
				});
			} else {
				const reason = mafiaVotedOut ? 'voted out' : 'team won';
				results.push({
					userId: mafiaId,
					eloDelta: EloCalculator.MAFIA_LOSS,
					reason: `Mafia loss: ${reason}`
				});
			}
		}

		// Calculate innocent (voter) ELO
		for (const [voterId, suspectId] of Object.entries(votes)) {
			// Skip mafia votes (mafia don't earn voting ELO)
			if (mafiaIds.has(voterId)) continue;

			const correct = mafiaIds.has(suspectId);
			results.push({
				userId: voterId,
				eloDelta: correct ? EloCalculator.CORRECT_VOTE : EloCalculator.INCORRECT_VOTE,
				reason: correct ? 'Correct vote' : 'Incorrect vote'
			});
		}

		return results;
	}

	/**
	 * Determine if any mafia was voted out by majority
	 * Only counts innocent votes (mafia votes don't count)
	 *
	 * @param mafiaIds - Set of mafia player IDs
	 * @param votes - Map of voterId -> suspectId
	 * @returns True if mafia received majority of innocent votes
	 */
	private static wasMafiaVotedOut(mafiaIds: Set<string>, votes: Record<string, string>): boolean {
		const voteCounts: Record<string, number> = {};
		let totalInnocentVotes = 0;

		// Count votes from innocent players only
		for (const [voterId, suspectId] of Object.entries(votes)) {
			// Only count innocent votes
			if (!mafiaIds.has(voterId)) {
				voteCounts[suspectId] = (voteCounts[suspectId] || 0) + 1;
				totalInnocentVotes++;
			}
		}

		const majority = Math.floor(totalInnocentVotes / 2) + 1;

		// Check if any mafia received majority
		for (const mafiaId of mafiaIds) {
			if ((voteCounts[mafiaId] ?? 0) >= majority) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Apply ELO floor (prevent going below 0)
	 *
	 * @param currentElo - Current ELO rating
	 * @param delta - ELO change (positive or negative)
	 * @returns New ELO rating (minimum 0)
	 */
	static applyEloFloor(currentElo: number, delta: number): number {
		return Math.max(0, currentElo + delta);
	}
}
