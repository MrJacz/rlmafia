import { describe, it, expect } from 'bun:test';
import { EloCalculator } from '../src/lib/elo';

describe('EloCalculator', () => {
	describe('calculateRoundElo', () => {
		it('should give mafia +30 when they win (team loses, not voted out)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = { mafia1: 1 as 1 | 2, player2: 2 as 1 | 2 };
			const votes = { player2: 'player3' }; // No one voted for mafia

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult).toBeDefined();
			expect(mafiaResult?.eloDelta).toBe(30);
			expect(mafiaResult?.reason).toContain('Mafia win');
		});

		it('should give mafia -30 when their team wins', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 1 as 1 | 2;
			const playerTeams = { mafia1: 1 as 1 | 2, player2: 2 as 1 | 2 };
			const votes = { player2: 'player3' };

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult).toBeDefined();
			expect(mafiaResult?.eloDelta).toBe(-30);
			expect(mafiaResult?.reason).toContain('team won');
		});

		it('should give mafia -30 when voted out by majority', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2
			};
			const votes = {
				player2: 'mafia1',
				player3: 'mafia1',
				player4: 'player2'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult).toBeDefined();
			expect(mafiaResult?.eloDelta).toBe(-30);
			expect(mafiaResult?.reason).toContain('voted out');
		});

		it('should give +5 for correct votes (voting for mafia)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = { mafia1: 1 as 1 | 2, player2: 2 as 1 | 2, player3: 2 as 1 | 2 };
			const votes = {
				player2: 'mafia1', // Correct
				player3: 'mafia1' // Correct
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const voter2Result = results.find(r => r.userId === 'player2');
			const voter3Result = results.find(r => r.userId === 'player3');

			expect(voter2Result?.eloDelta).toBe(5);
			expect(voter2Result?.reason).toBe('Correct vote');
			expect(voter3Result?.eloDelta).toBe(5);
			expect(voter3Result?.reason).toBe('Correct vote');
		});

		it('should give -3 for incorrect votes (voting for innocent)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2
			};
			const votes = {
				player2: 'player3', // Incorrect
				player3: 'player4' // Incorrect
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const voter2Result = results.find(r => r.userId === 'player2');
			const voter3Result = results.find(r => r.userId === 'player3');

			expect(voter2Result?.eloDelta).toBe(-3);
			expect(voter2Result?.reason).toBe('Incorrect vote');
			expect(voter3Result?.eloDelta).toBe(-3);
			expect(voter3Result?.reason).toBe('Incorrect vote');
		});

		it('should ignore mafia votes (mafia cannot earn voting ELO)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2
			};
			const votes = {
				mafia1: 'player2', // Mafia vote should be ignored
				player2: 'mafia1'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			// Should have 2 results: mafia ELO and player2 voting ELO
			expect(results).toHaveLength(2);
			// Mafia should have "Mafia loss: voted out", not "Correct vote" or "Incorrect vote"
			expect(results.some(r => r.userId === 'mafia1' && (r.reason === 'Correct vote' || r.reason === 'Incorrect vote'))).toBe(false);
		});

		it('should handle 2 mafia correctly', () => {
			const mafiaIds = new Set(['mafia1', 'mafia2']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				mafia2: 1 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2
			};
			const votes = {
				player3: 'player4',
				player4: 'player3'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafia1Result = results.find(r => r.userId === 'mafia1');
			const mafia2Result = results.find(r => r.userId === 'mafia2');

			expect(mafia1Result?.eloDelta).toBe(30);
			expect(mafia2Result?.eloDelta).toBe(30);
		});

		it('should calculate complex scenario with mixed votes', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2,
				player5: 2 as 1 | 2,
				player6: 2 as 1 | 2
			};
			const votes = {
				player2: 'mafia1', // Correct +5
				player3: 'mafia1', // Correct +5
				player4: 'player5', // Incorrect -3
				player5: 'player6', // Incorrect -3
				player6: 'mafia1' // Correct +5
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			// Mafia voted out (3/5 votes, majority is 3)
			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult?.eloDelta).toBe(-30);
			expect(mafiaResult?.reason).toContain('voted out');

			// Check voter ELO
			expect(results.find(r => r.userId === 'player2')?.eloDelta).toBe(5);
			expect(results.find(r => r.userId === 'player3')?.eloDelta).toBe(5);
			expect(results.find(r => r.userId === 'player4')?.eloDelta).toBe(-3);
			expect(results.find(r => r.userId === 'player5')?.eloDelta).toBe(-3);
			expect(results.find(r => r.userId === 'player6')?.eloDelta).toBe(5);
		});
	});

	describe('wasMafiaVotedOut (via calculateRoundElo)', () => {
		it('should not count mafia votes toward majority', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2
			};
			const votes = {
				mafia1: 'mafia1', // Mafia voting for themselves (should be ignored)
				player2: 'player3',
				player3: 'player2'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			// Mafia should win (not voted out), even though they have 1 vote
			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult?.eloDelta).toBe(30);
		});

		it('should require strict majority (floor(n/2) + 1)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2,
				player5: 2 as 1 | 2
			};

			// 4 innocent votes total, majority = floor(4/2) + 1 = 3
			const votes = {
				player2: 'mafia1',
				player3: 'mafia1', // 2 votes = not majority
				player4: 'player5',
				player5: 'player2'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult?.eloDelta).toBe(30); // Should win (not voted out)
		});

		it('should detect majority with exactly required votes', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2,
				player5: 2 as 1 | 2
			};

			// 4 innocent votes total, majority = 3
			const votes = {
				player2: 'mafia1',
				player3: 'mafia1',
				player4: 'mafia1', // 3 votes = exactly majority
				player5: 'player2'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			const mafiaResult = results.find(r => r.userId === 'mafia1');
			expect(mafiaResult?.eloDelta).toBe(-30); // Should lose (voted out)
			expect(mafiaResult?.reason).toContain('voted out');
		});
	});

	describe('applyEloFloor', () => {
		it('should allow positive changes', () => {
			expect(EloCalculator.applyEloFloor(1000, 30)).toBe(1030);
			expect(EloCalculator.applyEloFloor(500, 5)).toBe(505);
		});

		it('should allow negative changes above floor', () => {
			expect(EloCalculator.applyEloFloor(1000, -30)).toBe(970);
			expect(EloCalculator.applyEloFloor(100, -3)).toBe(97);
		});

		it('should prevent ELO from going below 0', () => {
			expect(EloCalculator.applyEloFloor(20, -30)).toBe(0);
			expect(EloCalculator.applyEloFloor(2, -3)).toBe(0);
			expect(EloCalculator.applyEloFloor(0, -30)).toBe(0);
		});

		it('should handle edge case of exactly 0', () => {
			expect(EloCalculator.applyEloFloor(30, -30)).toBe(0);
		});
	});

	describe('Edge Cases', () => {
		it('should handle game with no votes', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = { mafia1: 1 as 1 | 2, player2: 2 as 1 | 2 };
			const votes = {};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			// Should only have mafia result
			expect(results).toHaveLength(1);
			expect(results[0].userId).toBe('mafia1');
			expect(results[0].eloDelta).toBe(30); // Mafia wins (no votes)
		});

		it('should handle all players voting for same innocent', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 2 as 1 | 2;
			const playerTeams = {
				mafia1: 1 as 1 | 2,
				player2: 2 as 1 | 2,
				player3: 2 as 1 | 2,
				player4: 2 as 1 | 2
			};
			const votes = {
				player2: 'player3',
				player3: 'player4',
				player4: 'player2'
			};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			// All voters should get -3 (filter out mafia results)
			const voterResults = results.filter(r => r.reason === 'Correct vote' || r.reason === 'Incorrect vote');
			expect(voterResults.every(r => r.eloDelta === -3)).toBe(true);
		});

		it('should handle single player game (just mafia)', () => {
			const mafiaIds = new Set(['mafia1']);
			const winningTeam = 1 as 1 | 2;
			const playerTeams = { mafia1: 1 as 1 | 2 };
			const votes = {};

			const results = EloCalculator.calculateRoundElo(mafiaIds, winningTeam, playerTeams, votes);

			expect(results).toHaveLength(1);
			expect(results[0].eloDelta).toBe(-30); // Team won
		});
	});
});
