import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type Message, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Set the number of mafia for this server.',
	runIn: 'GUILD_ANY'
	// requiredUserPermissions: ['ManageGuild']
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
					name: 'count',
					description: 'How many mafia players to use (integer ≥ 1).',
					type: 4, // Integer
					required: true,
					min_value: 1,
					// You can set a soft upper hint; actual effective cap happens at startGame():
					max_value: 8
				}
			]
		});
	}

	// Message command: e.g. "m!setmafia 2"
	public override async messageRun(message: Message) {
		const guild = message.guild;
		if (!guild) return message.reply('You must use this command in a server.');

		const arg = message.content.trim().split(/\s+/)[1];
		const parsed = Number(arg);
		if (!arg || !Number.isInteger(parsed) || parsed < 1) {
			return message.reply('Usage: setmafia <count> (integer ≥ 1).');
		}

		const { applied, note } = this.applyMafiaCount(guild.id, parsed);
		return message.reply(`${applied}${note ? ` ${note}` : ''}`);
	}

	// Slash command: /setmafia count:2
	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		const count = interaction.options.getInteger('count', true);
		if (count < 1) {
			return interaction.reply({ content: 'Count must be an integer ≥ 1.', ephemeral: true });
		}

		const { applied, note } = this.applyMafiaCount(guild.id, count);
		return interaction.reply({ content: `${applied}${note ? ` ${note}` : ''}` });
	}

	private applyMafiaCount(guildId: string, count: number) {
		const game = container.mafia.add(guildId);
		game.setNumMafia(count);

		// Explain the effective cap that will be applied at startGame()
		// (from the adjusted startGame logic we discussed earlier)
		const activeCount = game.activePlayerIds.length || 0;
		const dynamicCap = Math.max(1, Math.min(2, Math.floor(Math.max(1, activeCount) / 3)));
		// If there are no actives yet, we can’t compute a meaningful dynamic cap; hint generally.
		const capText =
			activeCount > 0
				? `With ${activeCount} active player${activeCount === 1 ? '' : 's'}, the round will cap mafia at **${dynamicCap}** when it starts.`
				: `The exact cap depends on active players at round start (≈ floor(players/3), up to 2 by default).`;

		const applied = `✅ Mafia count set to **${game.numMafia}** for this server.`;
		const note = game.inProgress ? `A round is already in progress; this will apply **next round**. ${capText}` : capText;

		return { applied, note };
	}
}
