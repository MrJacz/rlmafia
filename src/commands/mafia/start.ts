import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Start the Mafia game and assign roles/teams.',
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

	public override async chatInputRun(interaction: ChatInputCommandInteraction): Promise<void> {
		const guild = interaction.guild;
		if (!guild) {
			await interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });
			return;
		}

		await interaction.deferReply();

		try {
			const { embed, failed } = await this.startMafiaGame(guild.id);

			await interaction.editReply({ embeds: [embed] });

			if (failed.length) {
				await interaction.followUp({
					content: `Could not DM roles to: ${failed.join(', ')}. Ask them to enable DMs from server members or run **/mafia status** to confirm they're active.`
				});
			}
		} catch (err: any) {
			await interaction.editReply({ content: `Error: ${err?.message ?? String(err)}` });
		}
	}

	private async startMafiaGame(guildId: string): Promise<{ embed: EmbedBuilder; failed: string[] }> {
		const game = await container.mafia.add(guildId);

		if (game.inProgress) {
			throw new Error('A round is already in progress.');
		}

		if (game.players.size < 4) {
			throw new Error('Need at least 4 players to start.');
		}

		await game.startGame(); // picks up to 8 actives, assigns roles & teams

		// Helpers
		const nameFor = (id: string) =>
			game.players.get(id)?.displayName ?? game.players.get(id)?.user?.displayName ?? 'Unknown';

		const team1 = game.activePlayerIds.filter((id) => game.players.get(id)?.team === 1).map(nameFor);
		const team2 = game.activePlayerIds.filter((id) => game.players.get(id)?.team === 2).map(nameFor);
		const subs = game.subs.map(nameFor);

		const embed = new EmbedBuilder()
			.setTitle('Rocket League Mafia — Round Started!')
			.setDescription('Teams assigned. Roles have been DMed to active players.')
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

		return { embed, failed };
	}
}
