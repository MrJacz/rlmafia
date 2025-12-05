import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Show the current Mafia game status (players, active roster, votes).',
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

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		const embed = this.buildStatusEmbed(guild.id);
		return interaction.reply({ embeds: [embed] });
	}

	private buildStatusEmbed(guildId: string): EmbedBuilder {
		const game = container.mafia.get(guildId);

		if (!game) {
			return new EmbedBuilder()
				.setTitle('Mafia — Game Status')
				.setColor(0x00bfff)
				.setDescription('No Mafia game found for this server. Use `/mafia join` to start playing!');
		}

		// Pull data
		const players = Array.from(game.players.values());
		const playerNames = players.map((p) => p.user?.displayName ?? p.user?.user?.username ?? 'Unknown');
		const activeIds = game.activePlayerIds;
		const subsIds = game.subs;

		const activeNames = activeIds.map((id) =>
			game.players.get(id)?.user?.displayName ?? game.players.get(id)?.user?.user?.username ?? 'Unknown'
		);

		const subsNames = subsIds.map((id) =>
			game.players.get(id)?.user?.displayName ?? game.players.get(id)?.user?.user?.username ?? 'Unknown'
		);

		const votesIn = game.votes.size;
		const votesNeeded = activeIds.length || 0;
		const voteStatus = votesNeeded > 0 ? `${votesIn}/${votesNeeded}` : `${votesIn}`;

		const embed = new EmbedBuilder()
			.setTitle('Mafia — Game Status')
			.setColor(0x00bfff)
			.addFields(
				{ name: 'In Progress', value: game.inProgress ? 'Yes' : 'No', inline: true },
				{ name: 'Game State', value: game.gameState || 'IDLE', inline: true },
				{ name: 'Players Joined', value: String(players.length), inline: true }
			);

		// Only show active/subs if we've done a start
		if (activeIds.length > 0 || subsIds.length > 0) {
			embed.addFields(
				{ name: 'Active Players', value: activeNames.length ? sliceSafe(activeNames, 1024).join('\n') : '—' },
				{ name: 'Subs', value: subsNames.length ? sliceSafe(subsNames, 1024).join('\n') : '—' },
				{ name: 'Votes (this round)', value: voteStatus, inline: true }
			);
		}

		// Always show a compact player list (without roles)
		embed.addFields({
			name: 'All Players',
			value: playerNames.length ? sliceSafe(playerNames, 1024).join('\n') : 'No players yet. Use `/mafia join` to join!'
		});

		return embed;
	}
}

/** Safely fits a list of names into an embed field by truncating. */
function sliceSafe(names: string[], max = 1024): string[] {
	const out: string[] = [];
	let used = 0;
	for (const n of names) {
		const line = n;
		const add = (out.length ? 1 : 0) + line.length; // +1 for newline if not first
		if (used + add > max) break;
		out.push(line);
		used += add;
	}
	return out;
}
