import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Bench a player (set as inactive - they will not be selected for rounds)',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand(
			{
				name: 'bench',
				description: this.description,
				integrationTypes,
				contexts,
				options: [
					{
						name: 'player',
						description: 'The player to bench',
						type: 6, // USER
						required: true
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

		const targetUser = interaction.options.getUser('player', true);

		// Get the guild member
		const member = await guild.members.fetch(targetUser.id).catch(() => null);
		if (!member) {
			return interaction.reply({
				content: `Could not find member ${targetUser.username} in this server.`,
				flags: MessageFlags.Ephemeral
			});
		}

		const game = await container.mafia.add(guild.id);

		// Check if game is in progress
		if (game.inProgress) {
			return interaction.reply({
				content: 'Cannot bench players during an active round. Wait for the round to end.',
				flags: MessageFlags.Ephemeral
			});
		}

		// Check if player is in the game
		const player = game.players.get(member.id);
		if (!player) {
			return interaction.reply({
				content: `${member.displayName} hasn't joined the game yet. They need to use \`/mafia join\` first.`,
				flags: MessageFlags.Ephemeral
			});
		}

		// Check if already benched
		if (!player.active) {
			return interaction.reply({
				content: `${member.displayName} is already benched.`,
				flags: MessageFlags.Ephemeral
			});
		}

		// Bench the player
		await container.db.setMemberActive(guild.id, member.id, false);
		player.active = false;

		return interaction.reply({
			content: `✅ Benched ${member.displayName}. They will not be selected for upcoming rounds.`
		});
	}
}
