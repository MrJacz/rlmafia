import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Show the ELO leaderboard for this server.',
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
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		await interaction.deferReply();

		try {
			// Get leaderboard from database
			const players = await container.db.getLeaderboard(guild.id, 25);

			if (players.length === 0) {
				return interaction.editReply({
					content: 'No players found. Use `/mafia join` to start playing!'
				});
			}

			// Build leaderboard embed
			const lines = players.map((p, i) => {
				const rank = i + 1;
				const medal = rank === 1 ? '>G' : rank === 2 ? '>H' : rank === 3 ? '>I' : `${rank}.`;
				const winRate = p.mafia_rounds > 0 ? ((p.mafia_wins / p.mafia_rounds) * 100).toFixed(1) : '0.0';
				const guessRate = p.total_votes > 0 ? ((p.correct_votes / p.total_votes) * 100).toFixed(1) : '0.0';

				return `${medal} **${p.display_name}**  ${p.elo} ELO\n` +
					`    ${p.total_rounds} games | Mafia WR: ${winRate}% | Guess: ${guessRate}%`;
			});

			const description = lines.join('\n').slice(0, 4000);

			const embed = new EmbedBuilder()
				.setTitle('<Æ Mafia ELO Leaderboard')
				.setColor(0x00bfff)
				.setDescription(description)
				.setFooter({ text: `Showing top ${players.length} players` });

			return interaction.editReply({ embeds: [embed] });
		} catch (err: any) {
			return interaction.editReply({ content: `Error: ${err?.message ?? String(err)}` });
		}
	}
}
