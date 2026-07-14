CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Overview
Relaxaurus is a Discord bot for remotely managing a Palworld dedicated server. It exposes slash commands that interact with the Palworld REST API (basic auth) and the host's screen sessions.

Commands
bash
npm start              # Start the bot (node index.js)
npm run register       # Register slash commands to the configured guild (node register.js)
There is no test suite, linter, or build step.

Architecture
text
index.js          → Bot entry point: dynamic command loader + interaction handler
register.js       → One-shot script that registers slash commands to a single guild
commands/         → One file per slash command; each exports { data, execute }
utils/restApi.js  → Shared axios base URL + basic-auth headers for the Palworld REST API
Command loading
index.js reads every .js file in commands/ at startup and builds a discord.js Collection keyed by command name. The interactionCreate handler routes incoming chat-input interactions to the matching command's execute().

Slash command registration
register.js uses Routes.applicationGuildCommands — commands are guild-scoped, not global. They only appear in the server identified by GUILD_ID. This means changes take effect instantly (no 1-hour global propagation delay).

Utility module
utils/restApi.js constructs the REST client from environment variables:

text
baseURL = http://<REST_HOST>:<REST_PORT>/v1/api
headers = { Authorization: Basic base64(admin:<ADMIN_PASSWORD>) }
Every command except /start uses this module to talk to the Palworld REST API.

The /start command (special case)
Unlike the other REST-backed commands, /start does not use the REST API. It spawns a screen session on the host via child_process.exec. The command string includes box64, meaning the host is an ARM64 Linux machine running the x86_64 PalServer binary through Box64 emulation.

Environment variables
Variable	Used by	Purpose
DISCORD_TOKEN	index.js, register.js	Discord bot token
CLIENT_ID	register.js	Discord application ID
GUILD_ID	register.js	Target guild for slash commands
PALSERVER_SCREEN_NAME	commands/start.js	screen -S session name
REST_HOST	utils/restApi.js	Palworld REST API host
REST_PORT	utils/restApi.js	Palworld REST API port (default 8212)
ADMIN_PASSWORD	utils/restApi.js	Palworld server admin password
Dependencies
discord.js v14 — bot framework; only GatewayIntentBits.Guilds is used (no message content or member intents needed)

axios — HTTP client for the Palworld REST API

dotenv — loads .env into process.env

Palworld REST API endpoints
The Palworld REST API category documents the following available actions:

Read endpoints
GET /info — get the server info.

GET /players — get player list.

GET /settings — get the server settings.

GET /metrics — get the server metrics.

GET /ws — get world actor snapshot.

Write endpoints
POST /announce — announce message.

POST /kick — kick player.

POST /ban — ban player.

POST /unban — unban player.

POST /save — save the world.

POST /shutdown — shut down the server.

POST /stop — force stop the server.

All 12 documented endpoints are implemented as slash commands:

Read endpoints: `/info` (GET /info), `/players` (GET /players), `/settings` (GET /settings), `/metrics` (GET /metrics)

Write endpoints: `/announce` (POST /announce), `/kick` (POST /kick), `/ban` (POST /ban), `/unban` (POST /unban), `/save` (POST /save), `/stop` (POST /shutdown, graceful), `/forcestop` (POST /stop, immediate), `/start` (`screen` + `box64`, no REST call)