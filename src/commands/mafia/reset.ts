import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

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
			// Delete guild record from database (cascades to players and rounds)
			await container.db.query('DELETE FROM guilds WHERE guild_id = $1', [guild.id]);

			// Remove from in-memory cache
			container.mafia.delete(guild.id);

			return interaction.editReply({
				content: 'Game completely reset. All players, ELO ratings, and history have been removed for this server.'
			});
		} catch (err: any) {
			return interaction.editReply({ content: `Error: ${err?.message ?? String(err)}` });
		}
	}
}
