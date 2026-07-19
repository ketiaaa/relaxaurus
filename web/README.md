# Relaxaurus Web Dashboard

Secure web-based dashboard for managing a Palworld dedicated server.

## Quick Start

1. In your Discord Application → OAuth2 → add redirect: `http://localhost:3000/api/auth/callback`
2. Enable **Server Members Intent** in Discord Developer Portal → Bot
3. Then:
```bash
cd web
npm install
cp .env.example .env   # edit with your values
npm start
```

Open `http://localhost:3000` — sign in with Discord.

## Authentication

Uses **Discord OAuth2** — no separate passwords to manage. Users must be members of your Discord server to access the dashboard. Their role (admin/viewer) is assigned based on their Discord roles.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PALWORLD_HOST` | 127.0.0.1 | Palworld server IP |
| `PALWORLD_REST_PORT` | 8212 | REST API port |
| `PALWORLD_ADMIN_PASSWORD` | — | Server admin password |
| `DISCORD_CLIENT_ID` | — | Discord application ID |
| `DISCORD_CLIENT_SECRET` | — | Discord OAuth2 client secret |
| `DISCORD_TOKEN` | — | Discord bot token |
| `GUILD_ID` | — | Discord server ID (guild check) |
| `SESSION_SECRET` | — | Random string for session signing |
| `DASHBOARD_ADMIN_ROLE_ID` | — | Discord role ID for admin access (optional) |
| `BASE_URL` | http://localhost:3000 | Dashboard public URL (no trailing slash) |
| `PORT` | 3000 | Web server port |

## Security Checklist Before Exposing

1. **Change default ports** — set `PALWORLD_REST_PORT` to something other than 8212
2. **Strong passwords** — use 16+ character `DASHBOARD_PASS` and `PALWORLD_ADMIN_PASSWORD`
3. **Generate JWT_SECRET** — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **Reverse proxy** — run behind Nginx/Caddy with TLS:
   ```nginx
   server {
       listen 443 ssl;
       server_name dashboard.your-domain.com;
       ssl_certificate /etc/letsencrypt/live/.../fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/.../privkey.pem;
       location / { proxy_pass http://127.0.0.1:3000; }
   }
   ```
5. **Restrict access** — use Cloudflare Access/Tunnel or UFW to limit by IP:
   ```bash
   sudo ufw allow from YOUR_IP to any port 3000
   ```
6. **Never forward REST/RCON ports** to the public internet — the dashboard proxies through localhost

## Systemd Service

```ini
[Unit]
Description=Relaxaurus Web Dashboard
After=network.target

[Service]
Type=simple
User=steam
WorkingDirectory=/home/steam/relaxaurus/web
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now relaxaurus-web
```

## Roles

Mapped from Discord guild membership:
- **admin** — users with the configured `DASHBOARD_ADMIN_ROLE_ID` Discord role (or the guild owner)
- **viewer** — any other member of your Discord server

If `DASHBOARD_ADMIN_ROLE_ID` is not set, the guild owner is the only admin — everyone else gets viewer access.

## Audit Log

All admin actions are logged to `web/audit.log` with timestamp, username, and action details.
