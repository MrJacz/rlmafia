// src/commands/help.ts
import { ApplyOptions } from '@sapphire/decorators';
import { Args, Command } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { EmbedBuilder } from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Show a list of commands or details for one command.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	// Usage:
	//   m!help            -> list all commands
	//   m!help report     -> detail for "report"
	public override async messageRun(message: Message, args: Args) {
		// Try to pick a string argument; on failure return null
		const query = await args.pick('string').catch(() => null);

		// Access all commands from the store:
		const store = this.container.stores.get('commands');

		if (query) {
			const name = query.toLowerCase();
			const cmd = store.get(name) as Command | undefined;
			if (!cmd) return message.reply(`Unknown command: \`${name}\`.`);

			// Pull description + any extra metadata you’ve added (e.g., detailedDescription)
			const desc = cmd.description ?? 'No description provided.';
			// If you augmented DetailedDescriptionCommandObject, you can read it here:
			const detail = (cmd as any).detailedDescription as { usage?: string; examples?: string[]; note?: string } | undefined;

			const embed = new EmbedBuilder()
				.setTitle(`Help — ${cmd.name}`)
				.setColor(0x00bfff)
				.setDescription(desc)
				.addFields(
					...(detail?.usage ? [{ name: 'Usage', value: detail.usage }] : []),
					...(detail?.examples?.length ? [{ name: 'Examples', value: detail.examples.map((e) => `\`${e}\``).join('\n') }] : []),
					...(detail?.note ? [{ name: 'Notes', value: detail.note }] : [])
				);

			return message.reply({ embeds: [embed] });
		}

		// List mode
		const lines: string[] = [];
		for (const cmd of store.values() as Iterable<Command>) {
			// Skip aliases-only pieces if you use them
			if (!cmd.name) continue;
			const desc = cmd.description ?? '—';
			lines.push(`**${cmd.name}** — ${desc}`);
		}

		const embed = new EmbedBuilder()
			.setTitle('Help — Commands')
			.setColor(0x00bfff)
			.setDescription(lines.sort().join('\n') || 'No commands loaded.')
			.setFooter({ text: 'Tip: m!help <command> for details' });

		return message.reply({ embeds: [embed] });
	}
}
