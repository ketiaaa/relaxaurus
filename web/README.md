# Relaxaurus Web Dashboard

Secure web-based dashboard for managing a Palworld dedicated server.

## Quick Start

```bash
cd web
npm install
cp .env.example .env   # edit with your values
npm start
```

Open `http://localhost:3000` — login with the credentials you set in `.env`.

## Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PALWORLD_HOST` | 127.0.0.1 | Palworld server IP |
| `PALWORLD_REST_PORT` | 8212 | REST API port |
| `PALWORLD_RCON_PORT` | 25575 | RCON port |
| `PALWORLD_ADMIN_PASSWORD` | — | Server admin password |
| `JWT_SECRET` | — | Random string for session signing (64 chars) |
| `DASHBOARD_USER` | admin | Admin login username |
| `DASHBOARD_PASS` | — | Admin login password |
| `VIEWER_USER` | viewer | Viewer login username (optional) |
| `VIEWER_PASS` | — | Viewer login password (optional) |
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

- **admin** — all actions (save, shutdown, kick, ban, announce, view audit log)
- **viewer** — read-only (server info, player list, metrics)

## Audit Log

All admin actions are logged to `web/audit.log` with timestamp, username, and action details.
