import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { Message, EmbedBuilder } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Show the current Mafia game leaderboard.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override async messageRun(message: Message) {
		const guildId = message.guildId;
		if (!guildId) return message.reply('You must use this command in a server.');

		const game = container.mafia.get(guildId);
		if (!game) return message.reply('No Mafia game found for this server.');

		const leaderboard = game.getLeaderboard();
		if (leaderboard.length === 0) return message.reply('No players in the game.');

		// Keep the embed compact and safe against long lists
		const lines = leaderboard.map((p, i) => `${i + 1}. ${p.name ?? 'Unknown'} — ${p.score}pt${p.mafia ? ' (Mafia)' : ''}`);
		const description = lines.join('\n').slice(0, 4000); // under Discord embed description cap

		const embed = new EmbedBuilder().setTitle('Mafia Game Leaderboard').setColor(0x00bfff).setDescription(description);

		return message.reply({ embeds: [embed] });
	}
}
