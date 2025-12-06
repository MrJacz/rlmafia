import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Set the maximum number of active players per round (8-16)',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand(
			{
				name: 'setmaxactive',
				description: this.description,
				integrationTypes,
				contexts,
				options: [
					{
						name: 'number',
						description: 'Maximum active players (8-16)',
						type: 4, // INTEGER
						required: true,
						minValue: 8,
						maxValue: 16
					}
				]
			},
			{
				idHints: [],
				guildIds: []
			}
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const maxActive = interaction.options.getInteger('number', true);

		// Validation (Discord should handle this via minValue/maxValue, but double-check)
		if (maxActive < 8 || maxActive > 16) {
			return interaction.reply({
				content: 'Maximum active players must be between 8 and 16.',
				flags: MessageFlags.Ephemeral
			});
		}

		const game = await container.mafia.add(guild.id);

		// Check if game is in progress
		if (game.inProgress) {
			return interaction.reply({
				content: 'Cannot change max active players during an active round. Wait for the round to end.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Update in database
		await container.db.setMaxActivePlayers(guild.id, maxActive);

		return interaction.reply({
			content: `✅ Set maximum active players to **${maxActive}**.\nUp to ${maxActive} players will be selected for each round.`
		});
	}
}
