import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType,
	type Message,
	MessageFlags
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Show the current Mafia game status (players, active roster, mafia count, votes).',
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
			contexts
		});
	}

	public override async messageRun(message: Message) {
		const guild = message.guild;
		if (!guild) return message.reply('You must use this command in a server.');

		const contentOrEmbed = this.buildStatus(guild.id);
		return message.reply(contentOrEmbed);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });

		const contentOrEmbed = this.buildStatus(guild.id);
		return interaction.reply(contentOrEmbed);
	}

	private buildStatus(guildId: string) {
		const game = container.mafia.get(guildId);
		if (!game) return { content: 'No Mafia game found for this server.' };

		// Pull data
		const playerNames = game.players.map((player) => player.displayName || 'Unknown');
		const activeNames = game.activePlayers.map((player) => player.displayName || 'Unknown');

		const votesIn = game.votes.size;
		const votesNeeded = activeNames.length || 0;
		const voteStatus = votesNeeded > 0 ? `${votesIn}/${votesNeeded}` : `${votesIn}`;

		const embed = new EmbedBuilder()
			.setTitle('Mafia — Game Status')
			.setColor(0x00bfff)
			.addFields(
				{ name: 'In Progress', value: game.inProgress ? 'Yes' : 'No', inline: true },
				{ name: 'Configured Mafia', value: String(game.numMafia), inline: true },
				{ name: 'Players Joined', value: String(playerNames.length), inline: true }
			);

		if (activeNames.length > 0) {
			embed.addFields(
				{ name: 'Active Players', value: activeNames.length ? activeNames.join('\n') : '—' },
				{ name: 'Votes (this round)', value: voteStatus, inline: true }
			);
		}

		embed.addFields({
			name: 'All Players',
			value: playerNames.length ? playerNames.join('\n') : '—'
		});

		return { embeds: [embed] };
	}
}
