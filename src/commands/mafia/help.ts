import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import {
	ApplicationIntegrationType,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	InteractionContextType
} from 'discord.js';

@ApplyOptions<Command.Options>({
	description: 'Show help and command reference for Rocket League Mafia',
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
		const embed = new EmbedBuilder()
			.setTitle('🎮 Rocket League Mafia — Help')
			.setColor(0x00bfff)
			.setDescription(
				'**Rocket League Mafia** is a social deduction game played alongside private RL matches.\n\n' +
					'One player is secretly the **Mafia** trying to sabotage their team. Everyone else must identify them!'
			)
			.addFields(
				{
					name: '📋 Game Setup',
					value:
						'`/mafia join` — Join the game\n' +
						'`/mafia leave` — Leave the game\n' +
						'`/mafia start` — Start a new round (assigns roles & teams)\n' +
						'`/mafia status` — Show current game status',
					inline: false
				},
				{
					name: '⚽ Playing',
					value:
						'1️⃣ Bot assigns roles (Mafia/Innocent) via DM\n' +
						'2️⃣ Bot randomizes Rocket League teams\n' +
						'3️⃣ Play your RL match\n' +
						'4️⃣ Use `/mafia report <1|2>` to report winning team\n' +
						'5️⃣ Vote for who you think was the Mafia\n' +
						'6️⃣ Bot reveals results and updates ELO',
					inline: false
				},
				{
					name: '📊 Stats & Info',
					value:
						'`/mafia scoreboard` — View ELO leaderboard\n' +
						'`/mafia profile [@player]` — View player stats\n' +
						'`/mafia stats` — View server statistics',
					inline: false
				},
				{
					name: '👥 Player Management',
					value:
						'`/mafia bench @player` — Set player as inactive (sub/spectator)\n' +
						'`/mafia activate @player` — Set player as active\n' +
						'`/mafia substitute @out @in` — Swap player mid-round\n' +
						'`addplayer @player` — Add players (prefix: `m!`)\n' +
						'`removeplayer @player` — Remove players (prefix: `m!`)',
					inline: false
				},
				{
					name: '⚙️ Configuration & Admin',
					value:
						'`/mafia setmaxactive <8-16>` — Set max active players per round\n' +
						'`/mafia restart` — Restart current round with new roles\n' +
						'`/mafia reset [reason]` — Force-abandon current round (admin)',
					inline: false
				},
				{
					name: '🎯 How to Win',
					value:
						'**As Mafia:** Lose the RL match without being voted out\n' +
						'**As Innocent:** Win the RL match OR correctly identify the Mafia\n\n' +
						'Earn ELO for successful plays and accurate voting!',
					inline: false
				}
			)
			.setFooter({ text: 'ELO starts at 1000 • Mafia win/loss: ±30 • Correct/incorrect vote: +5/-3' });

		return interaction.reply({ embeds: [embed] });
	}
}
