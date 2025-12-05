import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Leave the Mafia game.',
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

		const game = await container.mafia.add(guild.id);

		if (game.inProgress) {
			return interaction.reply({ content: 'Cannot leave during an active round. Wait for the round to end.', ephemeral: true });
		}

		if (!game.players.has(interaction.user.id)) {
			return interaction.reply({ content: 'You are not in the game.', ephemeral: true });
		}

		await game.removePlayer(interaction.user.id);
		return interaction.reply({ content: 'You have left the Mafia game.', ephemeral: false });
	}
}
