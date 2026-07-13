# Relaxaurus

A lightweight Discord bot to start, stop, and check the status of a Palworld dedicated server via RCON and screen sessions.

## Setup

1. Clone this repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your values
4. Run `node register.js` once to register slash commands
5. Run `node index.js` to start the bot

## Requirements

- Node.js 18+
- A running PalServer with RCON enabled
- Linux host with `screen` installed (for the `/start` command)

## Commands

- `/start` — starts the PalServer inside a screen session
- `/stop` — sends a graceful RCON shutdown
- `/status` — checks if the server is running

## License

MIT