import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Join the current Mafia game.',
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

		const member = interaction.member as GuildMember | null;
		if (!member) return interaction.reply({ content: 'Could not resolve your member profile.', ephemeral: true });

		const result = await this.joinGame(guild.id, member);
		return interaction.reply({ content: result, ephemeral: false });
	}

	private async joinGame(guildId: string, member: GuildMember): Promise<string> {
		const game = await container.mafia.add(guildId);

		if (game.inProgress) {
			return 'You cannot join: the game is already in progress.';
		}

		if (game.players.has(member.id)) {
			return 'You are already in the Mafia game!';
		}

		await game.addPlayer(member);

		const playerNames = Array.from(game.players.values())
			.map((p) => p.displayName ?? p.user?.displayName ?? 'Unknown')
			.join(', ');

		return `You have joined the Mafia game! Current players: ${playerNames}`;
	}
}
