# Relaxaurus

A Discord bot to manage a Palworld dedicated server via the REST API and screen sessions.

## Setup

1. Clone this repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Run `node register.js` once to register slash commands
5. Run `node index.js` to start the bot

## Requirements

- Node.js 18+
- A running PalServer with the REST API enabled
- Linux host with `screen` and `box64` installed (for the `/start` command)

## Commands

| Command | Description |
|---|---|
| `/start` | Starts the PalServer inside a screen session |
| `/stop` | Graceful shutdown with a 10-second warning |
| `/forcestop` | Force stops the server immediately |
| `/info` | Shows server name, version, and description |
| `/players` | Lists online players with levels |
| `/metrics` | Shows FPS, frame time, player count, and uptime |
| `/settings` | Displays all server settings |
| `/save` | Saves the world |
| `/announce` | Sends an announcement to all players |
| `/kick` | Kicks a player by Steam ID |
| `/ban` | Bans a player by Steam ID |
| `/unban` | Unbans a player by Steam ID |

## License

MIT
