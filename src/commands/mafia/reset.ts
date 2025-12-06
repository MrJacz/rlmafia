import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import { ApplicationIntegrationType, type ChatInputCommandInteraction, InteractionContextType, MessageFlags } from 'discord.js';
import { GameState } from '../../lib/database';

@ApplyOptions<Command.Options>({
	description: 'Force-abandon the current round (admin only).',
	runIn: 'GUILD_ANY',
	preconditions: ['OwnerOnly']
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
					name: 'reason',
					description: 'Reason for abandoning the round',
					type: 3, // STRING
					required: false
				}
			]
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const reason = interaction.options.getString('reason') ?? 'Admin reset';

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		try {
			const game = await container.mafia.add(guild.id);

			if (!game.inProgress) {
				return interaction.editReply({
					content: 'No active round to reset. Use this command when a round is stuck or needs to be abandoned.'
				});
			}

			// Reset the guild (marks round as ABANDONED with reason)
			await container.db.resetGuild(guild.id, reason);

			// Reset in-memory state
			game.gameState = GameState.IDLE;
			game.votes.clear();
			for (const player of game.players.values()) {
				player.reset();
			}

			return interaction.editReply({
				content: `Round abandoned. Reason: "${reason}"\n\nPlayers and ELO ratings have been preserved. Use \`/mafia start\` to begin a new round.`
			});
		} catch (err) {
			return interaction.editReply({ content: `Error: ${err instanceof Error ? err.message : err}` });
		}
	}
}
