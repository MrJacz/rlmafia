import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Restart the Mafia game and clear all players and scores.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override async messageRun(message: Message) {
		const guildId = message.guildId;
		if (!guildId) return message.reply('You must use this command in a server.');

		const game = container.mafia.get(guildId);
		if (!game) return message.reply('No Mafia game found for this server.');

		// Optional: be polite to the current round
		try {
			game.resetGame();
		} catch {}

		container.mafia.delete(guildId);
		return message.reply('Mafia game cleared for this server. All players and scores have been reset.');
	}
}
