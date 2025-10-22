import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Start the Mafia game and assign roles/teams.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override async messageRun(message: Message) {
		const guild = message.guild;
		if (!guild) return message.reply('You must use this command in a server.');

		const game = container.mafia.add(guild.id);

		if (game.inProgress) {
			return message.reply('A round is already in progress.');
		}

		if (game.players.size < 4) {
			return message.reply('Need at least 4 players to start.');
		}

		try {
			game.startGame(); // picks up to 8 actives, assigns roles & teams

			// Helpers
			const nameFor = (id: string) => game.players.get(id)?.user?.displayName ?? game.players.get(id)?.user?.user?.username ?? 'Unknown';

			const team1 = game.activePlayerIds.filter((id) => game.players.get(id)?.team === 1).map(nameFor);
			const team2 = game.activePlayerIds.filter((id) => game.players.get(id)?.team === 2).map(nameFor);
			const subs = game.subs.map(nameFor);

			const embed = new EmbedBuilder()
				.setTitle('Rocket League Mafia — Round Started!')
				.setDescription('Teams assigned. Roles have been DM’d to active players.')
				.addFields(
					{ name: 'Team 1', value: team1.length ? team1.join('\n') : '—', inline: true },
					{ name: 'Team 2', value: team2.length ? team2.join('\n') : '—', inline: true },
					{ name: 'Subs', value: subs.length ? subs.join('\n') : '—' }
				)
				.setColor(0x00bfff)
				.setFooter({ text: `Configured mafia: ${game.numMafia}` });

			// DM roles to ACTIVE players only
			const failed: string[] = [];
			for (const id of game.activePlayerIds) {
				const member = game.players.get(id)?.user; // GuildMember
				if (!member) continue;
				const roleText = game.mafiaIds.has(id)
					? 'You are **MAFIA**. Blend in, lose RL, and avoid being voted out.'
					: 'You are **INNOCENT**. Win RL and find the mafia.';

				try {
					await member.user.send({ content: `Your role this round: ${roleText}` });
				} catch {
					failed.push(member.displayName ?? member.user.username);
				}
			}

			const sent = await message.reply({ embeds: [embed] });

			if (failed.length) {
				await message.reply(
					`Could not DM roles to: ${failed.join(', ')}. Ask them to enable DMs from server members or run **m!status** to confirm they’re active.`
				);
			}

			return sent;
		} catch (err: any) {
			return message.reply(`Error: ${err?.message ?? String(err)}`);
		}
	}
}
