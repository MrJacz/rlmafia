// Unless explicitly defined, set NODE_ENV as development:
process.env.NODE_ENV ??= 'development';

import { ApplicationCommandRegistries, container, RegisterBehavior } from '@sapphire/framework';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-editable-commands/register';
import { ArrayString, setup } from '@skyra/env-utilities';
import * as colorette from 'colorette';
import { join } from 'node:path';
import { srcDir } from './constants';
import { MafiaManager } from './Mafia';

// Set default behavior to bulk overwrite
ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

// Read env var
setup({ path: join(srcDir, '.env') });

// Enable colorette
colorette.createColors({ useColor: true });

container.mafia = new MafiaManager();

declare module '@sapphire/pieces' {
	interface Container {
		mafia: MafiaManager;
	}
}

declare module '@skyra/env-utilities' {
	interface Env {
		OWNERS: ArrayString;
	}
}
