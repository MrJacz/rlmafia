import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import { Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Interaction, ComponentType } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Report the winning team and start mafia voting.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override async messageRun(message: Message, args: Args) {
		// Parse team number safely
		let teamNum: number;
		try {
			teamNum = await args.pick('integer');
		} catch {
			return message.reply('Usage: report <team> (1 or 2)');
		}
		if (teamNum !== 1 && teamNum !== 2) return message.reply('Usage: report <team> (1 or 2)');

		const guildId = message.guildId!;
		const game = container.mafia.get(guildId);
		if (!game || !game.inProgress) return message.reply('No active Mafia game.');

		// 🔒 Active-only voting pool
		const activeIds = game.activePlayerIds;
		if (activeIds.length === 0) return message.reply('No active players to vote on.');

		const embed = new EmbedBuilder()
			.setTitle('Vote for the Mafia!')
			.setDescription('Click the button below the player you suspect is mafia. You cannot vote for yourself.');

		// Build buttons for active players only
		const buttons: ButtonBuilder[] = activeIds.map((id) => {
			const name = game.players.get(id)?.user?.displayName ?? game.players.get(id)?.user?.user?.username ?? 'Unknown';
			return new ButtonBuilder().setCustomId(`vote_${id}`).setLabel(name).setStyle(ButtonStyle.Primary);
		});

		const rows: ActionRowBuilder<ButtonBuilder>[] = [];
		for (let i = 0; i < buttons.length; i += 5) {
			rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons.slice(i, i + 5)));
		}

		const sentMsg = await message.reply({ embeds: [embed], components: rows });

		// Collector: active players only, vote once, valid button ids
		const collector = sentMsg.createMessageComponentCollector({
			componentType: ComponentType.Button,
			time: 60_000,
			filter: (interaction: Interaction) => {
				if (!interaction.isButton()) return false;
				if (!interaction.customId.startsWith('vote_')) return false;
				const voterId = interaction.user.id;
				return activeIds.includes(voterId) && !game.votes.has(voterId);
			}
		});

		const disableAllButtons = async () => {
			const disabledRows = rows.map((row) =>
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					...row.components.map((b) => ButtonBuilder.from(b as ButtonBuilder).setDisabled(true))
				)
			);
			await sentMsg.edit({ components: disabledRows });
		};

		collector.on('collect', async (interaction) => {
			const voterId = interaction.user.id;
			const suspectId = interaction.customId.replace('vote_', '');

			try {
				// Guard: suspect must be active
				if (!activeIds.includes(suspectId)) {
					return interaction.reply({ content: 'You can only vote for active players.', ephemeral: true });
				}
				if (voterId === suspectId) {
					return interaction.reply({ content: 'You cannot vote for yourself!', ephemeral: true });
				}

				game.registerVote(voterId, suspectId);

				// Early stop if all votes are in
				if (game.allVotesIn()) collector.stop('all_votes_in');

				return interaction.reply({
					content: `Vote registered for **${
						game.players.get(suspectId)?.user?.displayName ?? game.players.get(suspectId)?.user?.user?.username ?? 'Unknown'
					}**!`,
					ephemeral: true // ✅ correct way to make button-reply ephemeral
				});
			} catch (err: any) {
				return interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
			}
		});

		collector.on('end', async () => {
			await disableAllButtons();

			// Score the round (locks the round internally)
			game.calculatePoints(teamNum as 1 | 2);

			// Build results
			const leaderboard = game.getLeaderboard();
			const mafiaNames =
				Array.from(game.mafiaIds)
					.filter((id) => activeIds.includes(id)) // show mafia from this round
					.map((id) => `**${game.players.get(id)?.user?.displayName ?? 'Unknown'}**`)
					.join(', ') || 'None';

			const voteResults =
				Array.from(game.votes.entries())
					.map(([voterId, suspectId]) => {
						const voterName =
							game.players.get(voterId)?.user?.displayName ?? game.players.get(voterId)?.user?.user?.username ?? 'Unknown';
						const suspectName =
							game.players.get(suspectId)?.user?.displayName ?? game.players.get(suspectId)?.user?.user?.username ?? 'Unknown';
						return `**${voterName}** → **${suspectName}**`;
					})
					.join('\n') || 'No votes recorded.';

			const resultsEmbed = new EmbedBuilder()
				.setTitle('Voting Complete!')
				.setColor(0x00bfff)
				.setDescription(`Mafia: ${mafiaNames}`)
				.addFields(
					{
						name: 'Leaderboard',
						value:
							leaderboard
								.map((l, i) => `${i + 1}. **${l.name ?? 'Unknown'}** — ${l.score}`)
								.join('\n')
								.slice(0, 1000) || 'No players.'
					},
					{ name: 'Votes', value: voteResults.slice(0, 1000) }
				);

			await sentMsg.reply({ embeds: [resultsEmbed] });

			// Reset round state (scores persist)
			game.resetGame();
		});

		return;
	}
}
