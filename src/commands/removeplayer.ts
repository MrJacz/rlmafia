import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import type { Message, GuildMember } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Remove a player from the Mafia lobby.',
	runIn: 'GUILD_ANY'
	// recommended for hosts/mods only:
	// requiredUserPermissions: ['ManageGuild']
})
export class UserCommand extends Command {
	// Usage: m!removeplayer @User  OR  m!removeplayer 1234567890
	public override async messageRun(message: Message, args: Args) {
		const guild = message.guild;
		if (!guild) return message.reply('Use this in a server.');

		const game = container.mafia.get(guild.id);
		if (!game) return message.reply('No Mafia game found for this server.');

		if (game.inProgress) {
			return message.reply(
				'You can’t remove players while a round is running. End the round first (e.g., `m!report` then finish, or `m!endround`).'
			);
		}

		let member: GuildMember;
		try {
			member = await args.pick('member');
		} catch {
			return message.reply('Usage: removeplayer <@user|userId>');
		}

		if (!game.players.has(member.id)) {
			return message.reply(`${member.displayName} is not in the lobby.`);
		}

		// Cleans votes/roles/active/subs via helper (see patch below)
		game.removePlayer(member.id);

		const list =
			Array.from(game.players.values())
				.map((p) => p.user?.displayName ?? 'Unknown')
				.join(', ') || '—';

		return message.reply(`🗑️ Removed **${member.displayName}**. Players: ${list}`);
	}
}
