import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import { ApplicationIntegrationType, type ChatInputCommandInteraction, InteractionContextType, MessageFlags } from 'discord.js';

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
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const game = await container.mafia.add(guild.id);

		if (game.inProgress) {
			return interaction.reply({
				content: 'Cannot leave during an active round. Wait for the round to end.',
				flags: MessageFlags.Ephemeral
			});
		}

		if (!game.players.has(interaction.user.id)) {
			return interaction.reply({ content: 'You are not in the game.', flags: MessageFlags.Ephemeral });
		}

		await game.removePlayer(interaction.user.id);
		return interaction.reply({ content: 'You have left the Mafia game.', ephemeral: false });
	}
}
