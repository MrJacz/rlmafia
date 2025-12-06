import { ApplyOptions } from '@sapphire/decorators';
import { Command, container } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags
} from 'discord.js';
import type { MafiaPlayer } from '../../lib/Mafia';

@ApplyOptions<Command.Options>({
	description: 'Restart the current round with new role and team assignments',
	runIn: 'GUILD_ANY',
	preconditions: ['OwnerOnly']
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
		if (!guild) {
			await interaction.reply({ content: 'You must use this command in a server.', flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply();

		try {
			const game = await container.mafia.add(guild.id);

			// Check if there's an active round
			if (!game.inProgress) {
				return interaction.editReply({
					content: 'No active round to restart. Use `/mafia start` to begin a new round.'
				});
			}

			// Get current active round
			const currentRound = await container.db.getActiveRound(guild.id);
			if (!currentRound) {
				return interaction.editReply({
					content: 'Could not find active round data. Use `/mafia reset` to clear state.'
				});
			}

			// Store current active players
			const activePlayers = Array.from(game.activePlayers.values());
			if (activePlayers.length < 4) {
				return interaction.editReply({
					content: 'Need at least 4 active players to restart. Use `/mafia start` instead.'
				});
			}

			// Mark old round as abandoned
			await container.db.abandonRound(currentRound.id, 'Round restarted with new assignments');

			// Reset player states
			for (const player of game.players.values()) {
				player.reset();
			}

			// Re-mark the same players as active
			for (const player of activePlayers) {
				const gamePlayer = game.players.get(player.userId);
				if (gamePlayer) gamePlayer.active = true;
			}

			// Clear votes
			game.votes.clear();

			// Create new round in database
			const newRound = await container.db.createRound(guild.id);

			// Reassign roles (same logic as startGame)
			const maxMafia = Math.max(1, Math.min(2, Math.floor(activePlayers.length / 3)));
			game.numMafia = Math.min(game.numMafia, maxMafia);

			const mafiaPlayers = game.activePlayers.random(game.numMafia);
			for (const player of mafiaPlayers) player.mafia = true;

			// Reassign teams using the pickTeams utility
			const { pickTeams } = await import('../../lib/utils');
			const { one, two } = pickTeams(game.activePlayers.values());

			for (const player of one) player.team = 1;
			for (const player of two) player.team = 2;

			// Create new RoundParticipant records
			const participants = game.activePlayers.map((player) => ({
				userId: player.userId,
				isMafia: player.mafia,
				team: player.team
			}));
			await container.db.createParticipants(newRound.id, participants);

			// Update guild state
			await container.db.updateGuildState(guild.id, game.gameState, true);

			// Build response embed
			const nameFor = (player: MafiaPlayer) => player.displayName ?? player?.user?.displayName ?? 'Unknown';
			const team1 = game.teamOnePlayers.map(nameFor);
			const team2 = game.teamTwoPlayers.map(nameFor);

			const embed = new EmbedBuilder()
				.setTitle('🔄 Round Restarted!')
				.setDescription('New roles and teams have been assigned. Roles sent via DM.')
				.addFields(
					{ name: 'Team 1', value: team1.length ? team1.join('\n') : '—', inline: true },
					{ name: 'Team 2', value: team2.length ? team2.join('\n') : '—', inline: true }
				)
				.setColor(0xffa500)
				.setFooter({ text: `Configured mafia: ${game.numMafia}` });

			// DM new roles to active players
			const failed: string[] = [];
			for (const player of game.activePlayers.values()) {
				try {
					await player.user?.send({ content: player.getRoleMessage() });
				} catch {
					failed.push(player.displayName);
				}
			}

			await interaction.editReply({ embeds: [embed] });

			if (failed.length) {
				await interaction.followUp({
					content: `⚠️ Could not DM roles to: ${failed.join(', ')}. Ask them to enable DMs or check /mafia status.`
				});
			}
		} catch (err) {
			container.logger.error('Restart command error:', err);
			await interaction.editReply({ content: `Error: ${err instanceof Error ? err.message : err}` });
		}
	}
}
