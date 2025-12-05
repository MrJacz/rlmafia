import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';
import { VotingSystem } from '../../lib/voting';
import { GameState } from '../../lib/database';

@ApplyOptions<Command.Options>({
	description: 'Report the winning team and start mafia voting.',
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
			contexts,
			options: [
				{
					name: 'team',
					description: 'Which team won the Rocket League match (1 or 2)',
					type: 4, // INTEGER type
					required: true,
					choices: [
						{ name: 'Team 1', value: 1 },
						{ name: 'Team 2', value: 2 }
					]
				}
			]
		});
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction): Promise<void> {
		const guild = interaction.guild;
		if (!guild) {
			await interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });
			return;
		}

		const teamNum = interaction.options.getInteger('team', true) as 1 | 2;

		const guildId = guild.id;
		const game = await container.mafia.add(guildId);

		if (!game.inProgress) {
			await interaction.reply({ content: 'No active Mafia game.', ephemeral: true });
			return;
		}

		if (game.activePlayerIds.length === 0) {
			await interaction.reply({ content: 'No active players to vote on.', ephemeral: true });
			return;
		}

		// Acknowledge the command
		await interaction.reply({ content: `Team ${teamNum} won the Rocket League match! Starting voting...` });

		// Update state to voting
		await container.db.updateGuildState(guildId, GameState.VOTING);
		game.gameState = GameState.VOTING;

		// Start voting using extracted VotingSystem
		const { embed, rows } = VotingSystem.createVotingEmbed(game);

		if (!interaction.channel || !('send' in interaction.channel)) {
			await interaction.followUp({ content: 'Error: Could not access channel.', ephemeral: true });
			return;
		}

		const votingMsg = await interaction.channel.send({ embeds: [embed], components: rows });

		// Collect votes (60 second timeout)
		await VotingSystem.collectVotes(votingMsg as any, game, 60_000);

		// Update state to resolving
		await container.db.updateGuildState(guildId, GameState.RESOLVING);
		game.gameState = GameState.RESOLVING;

		// Calculate ELO changes
		const eloChanges = await game.calculateElo(teamNum);

		// Create and send results
		const resultsEmbed = VotingSystem.createResultsEmbed(game, eloChanges);
		await interaction.followUp({ embeds: [resultsEmbed] });

		// Reset round state (players persist with updated ELO)
		await game.resetGame();
	}
}
