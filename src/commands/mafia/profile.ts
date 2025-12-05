import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'View player statistics and ELO rating.',
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
			contexts,
			options: [
				{
					name: 'player',
					description: 'The player to view (leave blank for yourself)',
					type: 6,
					required: false
				}
			]
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		await interaction.deferReply();

		try {
			const targetUser = interaction.options.getUser('player') ?? interaction.user;
			const player = await container.db.getPlayer(guild.id, targetUser.id);

			if (!player) {
				return interaction.editReply({
					content: `${targetUser.username} hasn't joined the Mafia game yet. Use \`/mafia join\` to start playing!`
				});
			}

			const mafiaWinRate = player.mafia_rounds > 0
				? ((player.mafia_wins / player.mafia_rounds) * 100).toFixed(1)
				: '0.0';

			const guessAccuracy = player.total_votes > 0
				? ((player.correct_votes / player.total_votes) * 100).toFixed(1)
				: '0.0';

			const innocentRounds = player.total_rounds - player.mafia_rounds;
			const allPlayers = await container.db.getLeaderboard(guild.id, 1000);
			const rank = allPlayers.findIndex(p => p.user_id === targetUser.id) + 1;

			const embed = new EmbedBuilder()
				.setTitle(`${player.display_name}'s Profile`)
				.setColor(0x00bfff)
				.setThumbnail(targetUser.displayAvatarURL())
				.addFields(
					{ name: 'ELO Rating', value: `**${player.elo}**`, inline: true },
					{ name: 'Peak ELO', value: `${player.peak_elo}`, inline: true },
					{ name: 'Server Rank', value: rank > 0 ? `#${rank}` : 'Unranked', inline: true },
					{ name: 'Total Rounds', value: `${player.total_rounds}`, inline: true },
					{ name: 'Innocent Rounds', value: `${innocentRounds}`, inline: true },
					{ name: 'Mafia Rounds', value: `${player.mafia_rounds}`, inline: true },
					{ name: 'Mafia Win Rate', value: `${mafiaWinRate}%`, inline: true },
					{ name: 'Guess Accuracy', value: `${guessAccuracy}% (${player.correct_votes}/${player.total_votes})`, inline: true },
					{ name: 'Mafia Wins', value: `${player.mafia_wins}`, inline: true }
				)
				.setFooter({ text: `Member since ${player.created_at.toLocaleDateString()}` });

			return interaction.editReply({ embeds: [embed] });
		} catch (err: any) {
			return interaction.editReply({ content: `Error: ${err?.message ?? String(err)}` });
		}
	}
}
