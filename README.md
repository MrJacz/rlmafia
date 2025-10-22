# rlMafia — Discord Mafia Bot (WIP)

A small Discord bot built with the Sapphire framework (TypeScript) that runs mafia-style games. This project is a work in progress (WIP): it currently works, but I plan to rewrite and clean it up when I have time. Consider this an early, usable prototype — expect rough edges and ongoing changes.

Invite the bot:
https://discord.com/oauth2/authorize?client_id=1410467535081705634

Status
- Work in progress / prototype.
- Functional for basic play, but the code and UX will be refactored in a future rewrite.
- Bug reports, suggestions, and PRs are welcome.

Commands
Note: the exact command names and whether they are slash or prefix commands depend on the current implementation. Use these as the canonical list of features the bot exposes; update them to match the code if names change.

- help — Show help and a list of available commands.
- ping — Check bot latency and status.
- start — Start a new mafia game in the current channel (creates lobby, assigns roles, etc.).
- join — Join the current lobby/game.
- leave — Leave the current lobby/game.
- players — List the players currently in the game.
- role — (DM) Shows the role assigned to the player.
- vote — Cast a vote during the day/lynch phase.
- status — Show the current game state (day/night, alive players, votes).
- night — Perform a night action (used by roles that act at night; may be handled automatically or via DM).
- end — End the current game and reset state.
- setup — Configure game options (player limits, role list, timers).
- rules — Display the game rules and expected behaviour.

If a command listed above does not match the live bot, check the repository's commands folder or run `help` in Discord to see the exact names.

Running locally

Prerequisites
- Node.js (recommended LTS)
- A bot token and necessary intents configured in Discord Developer Portal

Install dependencies
```sh
npm install
```

Development
This project uses TypeScript. To run with auto-reload during development:
```sh
npm run watch:start
```

Production
To run the built bot:
```sh
npm dev
# or build and run
npm run build
node ./dist/index.js
```

Contributing
- Open issues for bugs or feature requests.
- PRs are welcome — small, focused changes are easiest to review.
- If you want to help with the planned rewrite, open an issue to discuss scope and design.

License
Dedicated to the public domain via the Unlicense (courtesy of the Sapphire Community and contributors).

Acknowledgements
- Built using the [Sapphire framework](https://github.com/sapphiredev/framework)
- Example structure inspired by Sapphire examples

(If you'd like, I can update the command list to exactly match what's implemented in the repo — tell me to scan the src/commands folder and I'll list them verbatim.)
