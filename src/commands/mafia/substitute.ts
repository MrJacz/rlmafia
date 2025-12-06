import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Substitute a player mid-round (swap out a disconnected player)',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand(
			{
				name: 'substitute',
				description: this.description,
				integrationTypes,
				contexts,
				options: [
					{
						name: 'out',
						description: 'The player to remove from the round',
						type: 6, // USER
						required: true
					},
					{
						name: 'in',
						description: 'The player to substitute in',
						type: 6, // USER
						required: true
					}
				]
			}
		);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const oldUser = interaction.options.getUser('out', true);
		const newUser = interaction.options.getUser('in', true);

		// Get guild members
		const oldMember = await guild.members.fetch(oldUser.id).catch(() => null);
		const newMember = await guild.members.fetch(newUser.id).catch(() => null);

		if (!oldMember) {
			return interaction.reply({
				content: `Could not find member ${oldUser.username} in this server.`,
				flags: MessageFlags.Ephemeral
			});
		}

		if (!newMember) {
			return interaction.reply({
				content: `Could not find member ${newUser.username} in this server.`,
				flags: MessageFlags.Ephemeral
			});
		}

		const game = await container.mafia.add(guild.id);

		// Check if game is in progress
		if (!game.inProgress) {
			return interaction.reply({
				content: 'No round in progress. Use `/mafia bench` and `/mafia activate` to manage players between rounds.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Ensure both players are registered
		if (!game.players.has(oldMember.id)) {
			return interaction.reply({
				content: `${oldMember.displayName} is not in the game.`,
				flags: MessageFlags.Ephemeral
			});
		}

		if (!game.players.has(newMember.id)) {
			// Auto-register the new player
			await game.addPlayer(newMember);
		}

		// Perform the substitution
		try {
			await game.substitutePlayer(oldMember.id, newMember.id);

			// Get the substitute's role information
			const substitutePlayer = game.players.get(newMember.id);
			if (!substitutePlayer) throw new Error('Failed to get substitute player');

			// Send DM to substitute with their role
			try {
				await newMember.send({
					content: `You have been substituted into the current round!\n\n${substitutePlayer.getRoleMessage()}\n\n**Your team:** Team ${substitutePlayer.team}`
				});
			} catch (_error) {
				// DM failed, but substitution succeeded
				await interaction.reply({
					content: `✅ Substituted ${oldMember.displayName} → ${newMember.displayName}\n⚠️ Could not DM ${newMember.displayName} their role. Please tell them manually.`
				});
				return;
			}

			await interaction.reply({
				content: `✅ Substituted ${oldMember.displayName} → ${newMember.displayName}\n${newMember.displayName} has been sent their role via DM.`
			});
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			return interaction.reply({
				content: `❌ Failed to substitute: ${errorMessage}`,
				flags: MessageFlags.Ephemeral
			});
		}
	}
}
