import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ComponentType,
	EmbedBuilder,
	type Interaction,
	type Message
} from 'discord.js';
import type { MafiaGame } from './Mafia';

export interface VotingResult {
	votes: Map<string, string>;
	completed: boolean;
	reason: 'all_votes_in' | 'timeout';
}

export class VotingSystem {
	static createVotingEmbed(game: MafiaGame): {
		embed: EmbedBuilder;
		rows: ActionRowBuilder<ButtonBuilder>[];
	} {
		const embed = new EmbedBuilder()
			.setTitle('Vote for the Mafia!')
			.setDescription('Click the button below the player you suspect is mafia. You cannot vote for yourself.')
			.setColor(0x00bfff);

		const buttons: ButtonBuilder[] = game.activePlayers.map((player) => {
			const name = player?.user?.displayName ?? player?.user?.user?.username ?? 'Unknown';
			return new ButtonBuilder().setCustomId(`vote_${player.userId}`).setLabel(name).setStyle(ButtonStyle.Primary);
		});

		// Discord limits 5 buttons per row
		const rows: ActionRowBuilder<ButtonBuilder>[] = [];
		for (let i = 0; i < buttons.length; i += 5) {
			rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
		}

		return { embed, rows };
	}

	static async collectVotes(message: Message, game: MafiaGame, timeoutMs: number = 60_000): Promise<VotingResult> {
		const { embed, rows } = VotingSystem.createVotingEmbed(game);
		const sentMsg = await message.reply({ embeds: [embed], components: rows });

		return new Promise((resolve) => {
			const collector = sentMsg.createMessageComponentCollector({
				componentType: ComponentType.Button,
				time: timeoutMs,
				filter: (interaction: Interaction) => {
					if (!interaction.isButton()) return false;
					if (!interaction.customId.startsWith('vote_')) return false;
					const voterId = interaction.user.id;
					return game.activePlayers.has(voterId) && !game.votes.has(voterId);
				}
			});

			collector.on('collect', async (interaction) => {
				const voterId = interaction.user.id;
				const suspectId = interaction.customId.replace('vote_', '');

				try {
					// Validate suspect is active player
					if (!game.activePlayers.has(suspectId)) {
						return interaction.reply({
							content: 'You can only vote for active players.',
							flags: 'Ephemeral'
						});
					}

					// Block self-voting
					if (voterId === suspectId) {
						return interaction.reply({
							content: 'You cannot vote for yourself!',
							flags: 'Ephemeral'
						});
					}

					// Register vote
					game.registerVote(voterId, suspectId);

					// Early stop if all votes are in
					if (game.allVotesIn()) collector.stop('all_votes_in');

					const suspectName =
						game.players.get(suspectId)?.user?.displayName ??
						game.players.get(suspectId)?.user?.user?.username ??
						'Unknown';

					return interaction.reply({
						content: `Vote registered for **${suspectName}**!`,
						flags: 'Ephemeral'
					});
				} catch (err) {
					return interaction.reply({
						content: `Error: ${err instanceof Error ? err.message : err}`,
						flags: 'Ephemeral'
					});
				}
			});

			collector.on('end', async (_, reason: 'all_votes_in' | 'timeout') => {
				await VotingSystem.disableButtons(sentMsg, rows);
				resolve({
					votes: game.votes,
					completed: reason === 'all_votes_in',
					reason: reason
				});
			});
		});
	}

	private static async disableButtons(message: Message, rows: ActionRowBuilder<ButtonBuilder>[]): Promise<void> {
		const disabledRows = rows.map((row) =>
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				...row.components.map((b) => ButtonBuilder.from(b as ButtonBuilder).setDisabled(true))
			)
		);
		await message.edit({ components: disabledRows });
	}

	static createResultsEmbed(game: MafiaGame, eloChanges: Map<string, number>): EmbedBuilder {
		// Mafia names
		const mafiaNames =
			game.mafiaPlayers
				.map((player) => {
					return `**${player?.displayName ?? player?.user?.displayName ?? 'Unknown'}**`;
				})
				.join(', ') || 'None';

		// Vote breakdown
		const voteResults =
			Array.from(game.votes.entries())
				.map(([voterId, suspectId]) => {
					const voter = game.players.get(voterId);
					const suspect = game.players.get(suspectId);
					const voterName = voter?.displayName ?? voter?.user?.displayName ?? 'Unknown';
					const suspectName = suspect?.displayName ?? suspect?.user?.displayName ?? 'Unknown';
					return `**${voterName}** → **${suspectName}**`;
				})
				.join('\n') || 'No votes recorded.';

		// Leaderboard with ELO changes
		const leaderboard =
			Array.from(game.players.values())
				.sort((a, b) => b.elo - a.elo)
				.slice(0, 10)
				.map((p, i) => {
					const change = eloChanges.get(p.userId) || 0;
					const changeStr = change !== 0 ? ` (${change > 0 ? '+' : ''}${change})` : '';
					return `${i + 1}. **${p.displayName}** — ${p.elo} ELO${changeStr}`;
				})
				.join('\n') || 'No players.';

		return new EmbedBuilder()
			.setTitle('Voting Complete!')
			.setColor(0x00bfff)
			.setDescription(`Mafia: ${mafiaNames}`)
			.addFields(
				{ name: 'Leaderboard', value: leaderboard.slice(0, 1000) },
				{ name: 'Votes', value: voteResults.slice(0, 1000) }
			);
	}
}
