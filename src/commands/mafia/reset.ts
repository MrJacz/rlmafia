import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import { ApplicationIntegrationType, type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Reset game state and remove all players (admin only).',
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
			contexts
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		await interaction.deferReply({ ephemeral: true });

		try {
			(await container.mafia.add(guild.id)).resetGame();
			return interaction.editReply({
				content: 'Game completely reset. All players, ELO ratings, and history have been removed for this server.'
			});
		} catch (err) {
			return interaction.editReply({ content: `Error: ${err instanceof Error ? err.message : err}` });
		}
	}
}
