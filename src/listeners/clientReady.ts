import { ApplyOptions } from '@sapphire/decorators';
import { Listener } from '@sapphire/framework';
import type { StoreRegistryValue } from '@sapphire/pieces';
import { blue, gray, green, magenta, magentaBright, white, yellow } from 'colorette';

const dev = process.env.NODE_ENV !== 'production';

@ApplyOptions<Listener.Options>({ once: true })
export class UserEvent extends Listener {
	private readonly style = dev ? yellow : blue;

	public override async run() {
		this.printBanner();
		this.printStoreDebugInformation();
		await this.restoreGameState();
	}

	private async restoreGameState() {
		const { logger, db, mafia } = this.container;

		try {
			logger.info('Checking for active rounds to restore...');

			const activeRounds = await db.getAllActiveRounds();

			if (activeRounds.length === 0) {
				logger.info('No active rounds found.');
				return;
			}

			logger.info(`Found ${activeRounds.length} active round(s). Restoring state...`);

			for (const round of activeRounds) {
				try {
					// Initialize the game for this guild
					// The initialize() method will load the round, participants, and votes
					await mafia.add(round.guildId);

					logger.info(
						`Restored round ${round.id} for guild ${round.guildId} (status: ${round.status})`
					);
				} catch (error) {
					logger.error(`Failed to restore round ${round.id} for guild ${round.guildId}:`, error);
				}
			}

			logger.info('State restoration complete.');
		} catch (error) {
			logger.error('Failed to restore game state:', error);
		}
	}

	private printBanner() {
		const success = green('+');

		const llc = dev ? magentaBright : white;
		const blc = dev ? magenta : blue;

		const line01 = llc('');
		const line02 = llc('');
		const line03 = llc('');

		// Offset Pad
		const pad = ' '.repeat(7);

		console.log(
			String.raw`
${line01} ${pad}${blc('1.0.0')}
${line02} ${pad}[${success}] Gateway
${line03}${dev ? ` ${pad}${blc('<')}${llc('/')}${blc('>')} ${llc('DEVELOPMENT MODE')}` : ''}
		`.trim()
		);
	}

	private printStoreDebugInformation() {
		const { client, logger } = this.container;
		const stores = [...client.stores.values()];
		const last = stores.pop()!;

		for (const store of stores) logger.info(this.styleStore(store, false));
		logger.info(this.styleStore(last, true));
	}

	private styleStore(store: StoreRegistryValue, last: boolean) {
		return gray(`${last ? '└─' : '├─'} Loaded ${this.style(store.size.toString().padEnd(3, ' '))} ${store.name}.`);
	}
}
