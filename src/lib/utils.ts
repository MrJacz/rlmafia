import {
	type ChatInputCommandSuccessPayload,
	type Command,
	type ContextMenuCommandSuccessPayload,
	container,
	type MessageCommandSuccessPayload
} from '@sapphire/framework';
import { cyan } from 'colorette';
import type { APIUser, Guild, User } from 'discord.js';
import type { MafiaPlayer } from './Mafia';

export function logSuccessCommand(
	payload: ContextMenuCommandSuccessPayload | ChatInputCommandSuccessPayload | MessageCommandSuccessPayload
): void {
	let successLoggerData: ReturnType<typeof getSuccessLoggerData>;

	if ('interaction' in payload) {
		successLoggerData = getSuccessLoggerData(payload.interaction.guild, payload.interaction.user, payload.command);
	} else {
		successLoggerData = getSuccessLoggerData(payload.message.guild, payload.message.author, payload.command);
	}

	container.logger.debug(
		`${successLoggerData.shard} - ${successLoggerData.commandName} ${successLoggerData.author} ${successLoggerData.sentAt}`
	);
}

export function getSuccessLoggerData(guild: Guild | null, user: User, command: Command) {
	const shard = getShardInfo(guild?.shardId ?? 0);
	const commandName = getCommandInfo(command);
	const author = getAuthorInfo(user);
	const sentAt = getGuildInfo(guild);

	return { shard, commandName, author, sentAt };
}

function getShardInfo(id: number) {
	return `[${cyan(id.toString())}]`;
}

function getCommandInfo(command: Command) {
	return cyan(command.name);
}

function getAuthorInfo(author: User | APIUser) {
	return `${author.username}[${cyan(author.id)}]`;
}

function getGuildInfo(guild: Guild | null) {
	if (guild === null) return 'Direct Messages';
	return `${guild.name}[${cyan(guild.id)}]`;
}

/**
 * Fisher-Yates shuffle algorithm
 * Returns a new shuffled array without modifying the original
 * @param array - Array to shuffle
 * @returns New shuffled array
 */
export function shuffle<T>(array: T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const temp = result[i]!;
		result[i] = result[j]!;
		result[j] = temp;
	}
	return result;
}

/**
 * Format ELO change for display
 * @param change - ELO delta (positive or negative)
 * @returns Formatted string with +/- prefix
 */
export function formatEloChange(change: number): string {
	if (change === 0) return '±0';
	return change > 0 ? `+${change}` : `${change}`;
}

/**
 * Format percentage with 1 decimal place
 * @param value - Percentage value (0-100)
 * @returns Formatted string with % suffix
 */
export function formatPercentage(value: number): string {
	return `${value.toFixed(1)}%`;
}

export function pickTeams(players: MapIterator<MafiaPlayer>): { one: MafiaPlayer[]; two: MafiaPlayer[] } {
	const pool = [...players];
	const teamA: MafiaPlayer[] = [];

	const teamSize = Math.ceil(pool.length / 2);

	while (teamA.length < teamSize) {
		const index = Math.floor(Math.random() * pool.length);
		teamA.push(pool[index]!);
		pool.splice(index, 1);
	}

	const teamB = pool;
	return {
		one: teamA,
		two: teamB
	};
}
