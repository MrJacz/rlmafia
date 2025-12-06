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
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		await interaction.deferReply();

		try {
			const targetUser = interaction.options.getUser('player') ?? interaction.user;
			const player = await container.db.getMember(guild.id, targetUser.id);

			if (!player) {
				return interaction.editReply({
					content: `${targetUser.username} hasn't joined the Mafia game yet. Use \`/mafia join\` to start playing!`
				});
			}

			const mafiaWinRate = player.mafiaRounds > 0 ? ((player.mafiaWins / player.mafiaRounds) * 100).toFixed(1) : '0.0';

			const guessAccuracy =
				player.totalVotes > 0 ? ((player.correctVotes / player.totalVotes) * 100).toFixed(1) : '0.0';

			const innocentRounds = player.totalRounds - player.mafiaRounds;
			const allPlayers = await container.db.getLeaderboard(guild.id, 1000);
			const rank = allPlayers.findIndex((p) => p.userId === targetUser.id) + 1;

			const embed = new EmbedBuilder()
				.setTitle(`${player.displayName}'s Profile`)
				.setColor(0x00bfff)
				.setThumbnail(targetUser.displayAvatarURL())
				.addFields(
					{ name: 'ELO Rating', value: `**${player.elo}**`, inline: true },
					{ name: 'Peak ELO', value: `${player.peakElo}`, inline: true },
					{ name: 'Server Rank', value: rank > 0 ? `#${rank}` : 'Unranked', inline: true },
					{ name: 'Total Rounds', value: `${player.totalRounds}`, inline: true },
					{ name: 'Innocent Rounds', value: `${innocentRounds}`, inline: true },
					{ name: 'Mafia Rounds', value: `${player.mafiaRounds}`, inline: true },
					{ name: 'Mafia Win Rate', value: `${mafiaWinRate}%`, inline: true },
					{
						name: 'Guess Accuracy',
						value: `${guessAccuracy}% (${player.correctVotes}/${player.totalVotes})`,
						inline: true
					},
					{ name: 'Mafia Wins', value: `${player.mafiaWins}`, inline: true }
				)
				.setFooter({ text: `Member since ${player.createdAt.toLocaleDateString()}` });

			return interaction.editReply({ embeds: [embed] });
		} catch (err) {
			return interaction.editReply({ content: `Error: ${err instanceof Error ? err.message : err}` });
		}
	}
}
