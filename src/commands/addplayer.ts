import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import type { Message, GuildMember } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Add one or more players to the Mafia lobby.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	// Usage:
	//   m!addplayer @UserA @UserB 1234567890 ...
	public override async messageRun(message: Message, args: Args) {
		const guild = message.guild;
		if (!guild) return message.reply('Use this in a server.');

		const game = container.mafia.add(guild.id);

		// Grab ALL remaining arguments as members
		const members = await args.repeat('member');

		// Deduplicate by ID to avoid double work
		const unique = new Map<string, GuildMember>();
		for (const m of members) unique.set(m.id, m);

		const added: string[] = [];
		const already: string[] = [];

		for (const [, m] of unique) {
			if (game.players.has(m.id)) {
				already.push(m.displayName);
				continue;
			}
			game.addPlayer(m);
			added.push(m.displayName);
		}

		const suffix = game.inProgress ? ' (added for next round)' : '';
		const roster =
			Array.from(game.players.values())
				.map((p) => p.user?.displayName ?? 'Unknown')
				.join(', ') || '—';

		const summary =
			(added.length ? `✅ Added: ${added.join(', ')}${suffix}\n` : '') +
			(already.length ? `ℹ️ Already in lobby: ${already.join(', ')}\n` : '') +
			`Players now: ${roster}`;

		return message.reply(summary.trim());
	}
}
