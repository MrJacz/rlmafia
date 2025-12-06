import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	InteractionContextType,
	type Message,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Add one or more players to the active roster.',
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
					name: 'players',
					description: 'Mention one or more players to add',
					type: 3, // STRING
					required: true
				}
			]
		});
	}

	public override async messageRun(message: Message) {
		const guild = message.guild;
		if (!guild) return message.reply('You must use this command in a server.');

		// Get mentioned users from the message
		const mentions = message.mentions.members;
		if (!mentions || mentions.size === 0) {
			return message.reply('Please mention at least one player to add (e.g., `m!addplayer @user1 @user2`)');
		}

		const game = await container.mafia.add(guild.id);
		const added: string[] = [];
		const alreadyActive: string[] = [];

		for (const [, member] of mentions) {
			// Ensure player exists in the game
			await game.addPlayer(member);
			const player = game.players.get(member.id);

			if (player) {
				if (player.active) {
					alreadyActive.push(member.displayName);
				} else {
					// Set player as active in database
					await container.db.setMemberActive(guild.id, member.id, true);
					player.active = true;
					added.push(member.displayName);
				}
			}
		}

		let response = '';
		if (added.length > 0) {
			response += `✅ Added to active roster: ${added.join(', ')}`;
		}
		if (alreadyActive.length > 0) {
			if (response) response += '\n';
			response += `ℹ️ Already active: ${alreadyActive.join(', ')}`;
		}

		return message.reply(response || 'No players were added.');
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const playersInput = interaction.options.getString('players', true);

		// Extract user IDs from mentions in the format <@123456789>
		const mentionMatches = playersInput.matchAll(/<@!?(\d+)>/g);
		const userIds = Array.from(mentionMatches, (match) => match[1]);

		if (userIds.length === 0) {
			return interaction.reply({
				content: 'Please mention at least one player to add (e.g., `/addplayer @user1 @user2`)',
				flags: MessageFlags.Ephemeral
			});
		}

		const game = await container.mafia.add(guild.id);
		const added: string[] = [];
		const alreadyActive: string[] = [];
		const notFound: string[] = [];

		for (const userId of userIds) {
			if (!userId) continue;
			try {
				const member = await guild.members.fetch(userId);

				// Ensure player exists in the game
				await game.addPlayer(member);
				const player = game.players.get(member.id);

				if (player) {
					if (player.active) {
						alreadyActive.push(member.displayName);
					} else {
						// Set player as active in database
						await container.db.setMemberActive(guild.id, member.id, true);
						player.active = true;
						added.push(member.displayName);
					}
				}
			} catch {
				notFound.push(`<@${userId}>`);
			}
		}

		let response = '';
		if (added.length > 0) {
			response += `✅ Added to active roster: ${added.join(', ')}`;
		}
		if (alreadyActive.length > 0) {
			if (response) response += '\n';
			response += `ℹ️ Already active: ${alreadyActive.join(', ')}`;
		}
		if (notFound.length > 0) {
			if (response) response += '\n';
			response += `⚠️ Not found: ${notFound.join(', ')}`;
		}

		return interaction.reply(response || 'No players were added.');
	}
}
