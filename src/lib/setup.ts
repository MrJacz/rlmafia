// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import { ApplicationCommandRegistries, container, RegisterBehavior } from '@sapphire/framework';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-editable-commands/register';
import { type ArrayString, setup } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'node:path';
import { srcDir } from './constants';
import { DatabaseService } from './database';
import { MafiaManager } from './Mafia';

// Set default behavior to bulk overwrite
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

// Read env var
setup({ path: join(srcDir, '.env') });

// Enable colorette
colorette.createColors({ useColor: true });

// Initialize database connection
const db = new DatabaseService();
db.connect()
	.then(() => {
		container.logger.info('Database connected successfully');
	})
	.catch(error => {
		container.logger.error('Failed to connect to database:', error);
		process.exit(1);
	});

// Initialize Mafia Manager with database
container.db = db;
container.mafia = new MafiaManager(db);

declare module '@sapphire/pieces' {
	interface Container {
		db: DatabaseService;
		mafia: MafiaManager;
	}
}

declare module '@skyra/env-utilities' {
	interface Env {
		OWNERS: ArrayString;
		DATABASE_URL: string;
	}
}
