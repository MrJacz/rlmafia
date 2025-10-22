import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { ApplicationIntegrationType, InteractionContextType, type Message, type GuildMember, type ChatInputCommandInteraction } from 'discord.js';
import { container } from '@sapphire/framework';

@ApplyOptions<Command.Options>({
	description: 'Join the current Mafia game.',
	runIn: 'GUILD_ANY'
})
export class UserCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry) {
		const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
		const contexts: InteractionContextType[] = [InteractionContextType.Guild];

		registry.registerChatInputCommand(
			{
				name: this.name,
				description: this.description,
				integrationTypes,
				contexts
			}
			// optional: enable guild-only deploys for faster propagation
			// { guildIds: ['YOUR_GUILD_ID'] }
		);
	}

	public override async messageRun(message: Message) {
		const guild = message.guild;
		if (!guild) return message.reply('You must use this command in a server.');

		const member = message.member as GuildMember | null;
		if (!member) return message.reply('Could not resolve your member profile.');

		const result = this.joinGame(guild.id, member);
		return message.reply(result);
	}

	public override async chatInputRun(interaction: ChatInputCommandInteraction) {
		const guild = interaction.guild;
		if (!guild) return interaction.reply({ content: 'You must use this command in a server.', ephemeral: true });

		const member = interaction.member as GuildMember | null;
		if (!member) return interaction.reply({ content: 'Could not resolve your member profile.', ephemeral: true });

		const result = this.joinGame(guild.id, member);
		return interaction.reply({ content: result, ephemeral: false });
	}

	private joinGame(guildId: string, member: GuildMember): string {
		const game = container.mafia.add(guildId);

		if (game.inProgress) {
			return 'You cannot join: the game is already in progress.';
		}

		if (game.players.has(member.id)) {
			return 'You are already in the Mafia game!';
		}

		game.addPlayer(member);

		const playerNames = Array.from(game.players.values())
			.map((p) => p.user?.displayName ?? p.user?.user?.username ?? 'Unknown')
			.join(', ');

		return `You have joined the Mafia game! Current players: ${playerNames}`;
	}
}
