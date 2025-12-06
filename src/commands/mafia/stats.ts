import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Show overall server statistics for Rocket League Mafia',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand({
			name: this.name,
			description: this.description,
			integrationTypes,
			contexts
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		await interaction.deferReply();

		try {
			// Get guild statistics from database
			const stats = await container.db.getGuildStats(guild.id);

			// Build embed
			const embed = new EmbedBuilder()
				.setTitle(`📊 ${guild.name} — Mafia Statistics`)
				.setColor(0x00bfff)
				.addFields(
					{
						name: '🎮 Total Games Played',
						value: stats.total_games.toString(),
						inline: true
					},
					{
						name: '👥 Total Players',
						value: stats.total_players.toString(),
						inline: true
					},
					{
						name: '📈 Average ELO',
						value: Math.round(stats.avg_elo).toString(),
						inline: true
					}
				);

			// Add top player if exists
			if (stats.top_player) {
				embed.addFields({
					name: '🏆 Top Player',
					value: `**${stats.top_player.display_name}**\n${stats.top_player.elo} ELO`,
					inline: false
				});
			}

			// Get recent rounds for additional stats
			const recentRounds = await container.db.getRecentRounds(guild.id, 10);
			if (recentRounds.length > 0) {
				const mafiaWins = recentRounds.filter((r) => r.mafiaWon === true).length;
				const innocentWins = recentRounds.filter((r) => r.mafiaWon === false).length;
				const winRate = recentRounds.length > 0 ? ((mafiaWins / recentRounds.length) * 100).toFixed(1) : '0.0';

				embed.addFields({
					name: '📉 Recent Performance (Last 10 Games)',
					value:
						`Mafia Wins: ${mafiaWins}\n` +
						`Innocent Wins: ${innocentWins}\n` +
						`Mafia Win Rate: ${winRate}%`,
					inline: false
				});
			}

			embed.setFooter({
				text: `Use /mafia scoreboard to see the full leaderboard`
			});

			return interaction.editReply({ embeds: [embed] });
		} catch (err) {
			return interaction.editReply({
				content: `Error loading stats: ${err instanceof Error ? err.message : err}`
			});
		}
	}
}
