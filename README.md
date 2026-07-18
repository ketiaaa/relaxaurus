# Relaxaurus

A Discord bot to manage a Palworld dedicated server via the REST API.

## Server Setup (Recommended)

Use [palworld-server-docker](https://github.com/thijsvanloef/palworld-server-docker) on an ARM64 Linux host:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Clone the Docker image and configure
mkdir palworld-server && cd palworld-server
# Create docker-compose.yml with your settings (see .env.example for variables)
docker compose up -d
```

The Docker image runs PalServer natively on ARM64 — no Box64 needed.

## Bot Setup

1. Clone this repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Run `node register.js` once to register slash commands
5. Run `node index.js` to start the bot

## Requirements

- Node.js 18+
- A running Palworld server with the REST API enabled (port 8212)

## Commands

| Command | Description |
|---|---|
| `/start` | Starts the PalServer Docker container |
| `/stop` | Graceful shutdown with a 10-second warning |
| `/forcestop` | Force stops the server immediately |
| `/info` | Shows server name, version, players, FPS, uptime |
| `/players` | Lists online players with level, ping, and location |
| `/metrics` | Shows FPS, frame time, player count, and uptime |
| `/settings` | Displays all server settings (paginated) |
| `/save` | Saves the world |
| `/announce` | Sends an announcement to all players |
| `/kick` | Kicks a player by Steam ID |
| `/ban` | Bans a player by Steam ID |
| `/unban` | Unbans a player by Steam ID |

## License

MIT
