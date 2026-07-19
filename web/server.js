const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const axios = require('axios');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.set('trust proxy', 1);

const PALWORLD_HOST = process.env.PALWORLD_HOST || '127.0.0.1';
const REST_PORT = process.env.PALWORLD_REST_PORT || 8212;
const ADMIN_PASSWORD = process.env.PALWORLD_ADMIN_PASSWORD || 'admin';
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SESSION_SECRET || 'change-me';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_GUILD_ID = process.env.GUILD_ID;
const ADMIN_ROLE_ID = process.env.DASHBOARD_ADMIN_ROLE_ID || '';
const MOD_ROLE_ID = process.env.DASHBOARD_MOD_ROLE_ID || '';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

const BASE_API = `http://${PALWORLD_HOST}:${REST_PORT}/v1/api`;
const AUTH_HEADER = `Basic ${Buffer.from(`admin:${ADMIN_PASSWORD}`).toString('base64')}`;
const AX = { headers: { Authorization: AUTH_HEADER }, timeout: 10000 };

const AUDIT_LOG = path.join(__dirname, 'audit.log');
function audit(user, action, detail = '') {
  fs.appendFileSync(AUDIT_LOG, `[${new Date().toISOString()}] ${user} | ${action} | ${detail}\n`);
}

// ── Middleware ───────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'", "'unsafe-inline'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", "https://cdn.discordapp.com"], connectSrc: ["'self'"] } } }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('short'));

const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });
app.use('/api', apiLimiter);

// ── Auth helpers ─────────────────────────────────────────────────────
function getToken(req) {
  return req.query.token || (req.headers.authorization || '').replace('Bearer ', '');
}
function requireAuth(req, res) {
  const t = getToken(req);
  if (!t) return null;
  try { return jwt.verify(t, JWT_SECRET); } catch { return null; }
}
function isAdmin(u) { return u?.role === 'admin'; }
function canMod(u) { return u?.role === 'admin' || u?.role === 'mod'; }

// ── Discord OAuth ────────────────────────────────────────────────────
app.get('/auth/login', (req, res) => {
  const cb = encodeURIComponent(`${BASE_URL}/auth/callback`);
  res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${cb}&response_type=code&scope=identify%20guilds`);
});

app.get('/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=denied');
  try {
    const tr = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: `${BASE_URL}/auth/callback` }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const du = await axios.get('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tr.data.access_token}` } });
    const user = du.data;
    let role = 'viewer';
    if (DISCORD_GUILD_ID) {
      try {
        const guilds = await axios.get('https://discord.com/api/users/@me/guilds', { headers: { Authorization: `Bearer ${tr.data.access_token}` } });
        if (guilds.data.some(g => g.id === DISCORD_GUILD_ID)) {
          if (process.env.DISCORD_TOKEN) {
            const m = await axios.get(`https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${user.id}`, { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } });
            if (ADMIN_ROLE_ID && m.data.roles?.includes(ADMIN_ROLE_ID)) role = 'admin';
            else if (MOD_ROLE_ID && m.data.roles?.includes(MOD_ROLE_ID)) role = 'mod';
          }
        } else {
          return res.redirect('/?error=not_in_guild');
        }
      } catch { role = 'viewer'; }
    }
    const token = jwt.sign({ id: user.id, username: user.username, avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null, role }, JWT_SECRET, { expiresIn: '12h' });
    audit(user.username, 'LOGIN', `role=${role}`);
    res.redirect(`/?token=${token}`);
  } catch (e) {
    console.error('OAuth error:', e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.get('/logout', (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Logout</title></head><body><script>sessionStorage.clear();location.href='/';</script></body></html>`);
});

// ── Main page (serve SPA) ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── API proxy ────────────────────────────────────────────────────────
function apiAuth(req, res, next) {
  const u = requireAuth(req, res);
  if (!u) return res.status(401).json({ error: 'Auth required' });
  req.authUser = u;
  next();
}

app.get('/api/info', apiAuth, async (req, res) => {
  try { const r = await axios.get(`${BASE_API}/info`, AX); res.json(r.data); } catch(e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/players', apiAuth, async (req, res) => {
  try { const r = await axios.get(`${BASE_API}/players`, AX); res.json(r.data); } catch(e) { res.status(502).json({ error: e.message }); }
});
app.get('/api/metrics', apiAuth, async (req, res) => {
  try { const r = await axios.get(`${BASE_API}/metrics`, AX); res.json(r.data); } catch(e) { res.status(502).json({ error: e.message }); }
});

// Admin actions
app.post('/api/save', apiAuth, actionLimiter, async (req, res) => {
  if (!canMod(req.authUser)) return res.status(403).send('Mod or admin required');
  try { await axios.post(`${BASE_API}/save`, {}, AX); audit(req.authUser.username, 'SAVE'); res.redirect('/?token='+getToken(req)+'&saved=1'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/shutdown', apiAuth, actionLimiter, async (req, res) => {
  if (!canMod(req.authUser)) return res.status(403).send('Mod or admin required');
  try { await axios.post(`${BASE_API}/shutdown`, { waittime: 10, message: 'Server shutting down via dashboard' }, AX); audit(req.authUser.username, 'SHUTDOWN'); res.redirect('/?token='+getToken(req)+'&msg=Shutting+down'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/start', apiAuth, actionLimiter, async (req, res) => {
  if (!canMod(req.authUser)) return res.status(403).send('Mod or admin required');
  try {
    const { exec } = require('child_process');
    exec('docker start palworld-server 2>/dev/null || cd /home/steam/palworld-server && docker compose up -d', (err) => { if (err) console.error('Start error:', err.message); });
    audit(req.authUser.username, 'START');
    res.redirect('/?token='+getToken(req)+'&msg=Starting+server');
  } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/announce', apiAuth, actionLimiter, async (req, res) => {
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  const msg = (req.body.msg || '').replace(/[;&|`$(){}[\]\\"']/g, '').slice(0, 256);
  if (!msg) return res.redirect('/?token='+getToken(req)+'&error=Message+required');
  try { await axios.post(`${BASE_API}/announce`, { message: msg }, AX); audit(req.authUser.username, 'ANNOUNCE', msg); res.redirect('/?token='+getToken(req)+'&msg=Announced'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/kick', apiAuth, actionLimiter, async (req, res) => {
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  const uid = (req.body.uid || '').replace(/[;&|`$(){}[\]\\"']/g, '').slice(0, 32);
  if (!uid) return res.redirect('/?token='+getToken(req)+'&error=SteamID+required');
  try { await axios.post(`${BASE_API}/kick`, { userid: uid }, AX); audit(req.authUser.username, 'KICK', uid); res.redirect('/?token='+getToken(req)+'&msg=Kicked'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});

app.post('/api/ban', apiAuth, actionLimiter, async (req, res) => {
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  const uid = (req.body.uid || '').replace(/[;&|`$(){}[\]\\"']/g, '').slice(0, 32);
  if (!uid) return res.redirect('/?token='+getToken(req)+'&error=SteamID+required');
  try { await axios.post(`${BASE_API}/ban`, { userid: uid }, AX); audit(req.authUser.username, 'BAN', uid); res.redirect('/?token='+getToken(req)+'&msg=Banned'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/unban', apiAuth, actionLimiter, async (req, res) => {
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  const uid = (req.body.uid || '').replace(/[;&|`$(){}[\]\\"']/g, '').slice(0, 32);
  if (!uid) return res.redirect('/?token='+getToken(req)+'&error=SteamID+required');
  try { await axios.post(`${BASE_API}/unban`, { userid: uid }, AX); audit(req.authUser.username, 'UNBAN', uid); res.redirect('/?token='+getToken(req)+'&msg=Unbanned'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Dashboard on http://localhost:${PORT}`));
