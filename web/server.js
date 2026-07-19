const express = require('express');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.set('trust proxy', 1);

// ── Config ──────────────────────────────────────────────────────────
const PALWORLD_HOST = process.env.PALWORLD_HOST || '127.0.0.1';
const REST_PORT = process.env.PALWORLD_REST_PORT || 8212;
const ADMIN_PASSWORD = process.env.PALWORLD_ADMIN_PASSWORD || 'admin';
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_GUILD_ID = process.env.GUILD_ID; // reuse from bot .env
const ADMIN_ROLE_ID = process.env.DASHBOARD_ADMIN_ROLE_ID || ''; // Discord role ID for admin
const BASE_CALLBACK = process.env.BASE_URL || `http://localhost:${PORT}`;

const BASE_URL = `http://${PALWORLD_HOST}:${REST_PORT}/v1/api`;
const AUTH_HEADER = `Basic ${Buffer.from(`admin:${ADMIN_PASSWORD}`).toString('base64')}`;
const axiosConfig = { headers: { Authorization: AUTH_HEADER }, timeout: 10000 };

// ── Audit log ────────────────────────────────────────────────────────
const AUDIT_LOG = path.join(__dirname, 'audit.log');
function auditLog(username, action, details = '') {
  const entry = `[${new Date().toISOString()}] ${username} | ${action} | ${details}\n`;
  fs.appendFileSync(AUDIT_LOG, entry);
}

// ── Input sanitizer ──────────────────────────────────────────────────
function sanitize(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[;&|`$(){}[\]\\"']/g, '').trim().slice(0, 256);
}

// ── Middleware ───────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", "https://discord.com"],
      imgSrc: ["'self'", "https://cdn.discordapp.com"],
    },
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000, // 12h
  },
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('short'));

// Rate limiting
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Rate limit exceeded' } });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Action rate limit exceeded' } });
app.use('/api', apiLimiter);

// ── Discord OAuth2 ──────────────────────────────────────────────────
async function getDiscordUser(accessToken) {
  const r = await axios.get('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return r.data;
}

async function getGuildMember(userId) {
  if (!DISCORD_GUILD_ID) return null;
  try {
    const r = await axios.get(
      `https://discord.com/api/users/@me/guilds`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
    );
    const botGuilds = r.data.map(g => g.id);
    if (!botGuilds.includes(DISCORD_GUILD_ID)) return null;

    const memberR = await axios.get(
      `https://discord.com/api/guilds/${DISCORD_GUILD_ID}/members/${userId}`,
      { headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` } }
    );
    return memberR.data;
  } catch {
    return null;
  }
}

function getUserRole(member) {
  if (!member) return 'viewer';
  if (ADMIN_ROLE_ID && member.roles?.includes(ADMIN_ROLE_ID)) return 'admin';
  // Guild owner is always admin
  if (member.user?.id === member.guild_id) return 'admin';
  // If no admin role configured, first login = viewer
  return 'viewer';
}

app.get('/api/auth/login', (req, res) => {
  const redirect = encodeURIComponent(`${BASE_CALLBACK}/api/auth/callback`);
  res.redirect(
    `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}` +
    `&redirect_uri=${redirect}&response_type=code&scope=identify%20guilds`
  );
});

app.get('/api/auth/callback', async (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?error=discord_denied');

  try {
    // Exchange code for token
    const tokenR = await axios.post('https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${BASE_CALLBACK}/api/auth/callback`,
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const user = await getDiscordUser(tokenR.data.access_token);
    const member = await getGuildMember(user.id);
    const role = getUserRole(member);

    req.session.user = {
      id: user.id,
      username: user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
      role,
    };

    auditLog(user.username, 'LOGIN', `role=${role}`);
    res.redirect('/');
  } catch (e) {
    console.error('OAuth error:', e.message);
    res.redirect('/?error=auth_failed');
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.clearCookie('connect.sid');
  return res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not authenticated' });
  return res.json(req.session.user);
});

// ── Auth middleware ──────────────────────────────────────────────────
function authenticate(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Authentication required' });
  req.user = req.session.user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── REST API proxy (read-only, any authenticated user) ───────────────
app.get('/api/server/info', authenticate, async (req, res) => {
  try {
    const r = await axios.get(`${BASE_URL}/info`, axiosConfig);
    return res.json(r.data);
  } catch (e) {
    return res.status(502).json({ error: 'Server unreachable', detail: e.message });
  }
});

app.get('/api/server/players', authenticate, async (req, res) => {
  try {
    const r = await axios.get(`${BASE_URL}/players`, axiosConfig);
    return res.json(r.data);
  } catch (e) {
    return res.status(502).json({ error: 'Server unreachable', detail: e.message });
  }
});

app.get('/api/server/metrics', authenticate, async (req, res) => {
  try {
    const r = await axios.get(`${BASE_URL}/metrics`, axiosConfig);
    return res.json(r.data);
  } catch (e) {
    return res.status(502).json({ error: 'Server unreachable', detail: e.message });
  }
});

app.get('/api/server/settings', authenticate, async (req, res) => {
  try {
    const r = await axios.get(`${BASE_URL}/settings`, axiosConfig);
    return res.json(r.data);
  } catch (e) {
    return res.status(502).json({ error: 'Server unreachable', detail: e.message });
  }
});

// ── Admin-only actions ───────────────────────────────────────────────
app.post('/api/server/save', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  try {
    await axios.post(`${BASE_URL}/save`, {}, axiosConfig);
    auditLog(req.user.username, 'SAVE');
    return res.json({ ok: true, message: 'World saved' });
  } catch (e) {
    auditLog(req.user.username, 'SAVE_FAILED', e.message);
    return res.status(502).json({ error: 'Save failed', detail: e.message });
  }
});

app.post('/api/server/shutdown', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  const waittime = Math.min(Math.max(parseInt(req.body.waittime) || 10, 0), 60);
  const message = sanitize(req.body.message || 'Server shutting down...');
  try {
    await axios.post(`${BASE_URL}/shutdown`, { waittime, message }, axiosConfig);
    auditLog(req.user.username, 'SHUTDOWN', `waittime=${waittime} msg="${message}"`);
    return res.json({ ok: true, message: `Shutting down in ${waittime}s` });
  } catch (e) {
    auditLog(req.user.username, 'SHUTDOWN_FAILED', e.message);
    return res.status(502).json({ error: 'Shutdown failed', detail: e.message });
  }
});

app.post('/api/server/announce', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  const message = sanitize(req.body.message);
  if (!message) return res.status(400).json({ error: 'Message required' });
  try {
    await axios.post(`${BASE_URL}/announce`, { message }, axiosConfig);
    auditLog(req.user.username, 'ANNOUNCE', `"${message}"`);
    return res.json({ ok: true, message: 'Announcement sent' });
  } catch (e) {
    return res.status(502).json({ error: 'Announce failed', detail: e.message });
  }
});

app.post('/api/server/kick', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  const userid = sanitize(req.body.userid);
  const message = sanitize(req.body.message || '');
  if (!userid) return res.status(400).json({ error: 'User ID required' });
  try {
    await axios.post(`${BASE_URL}/kick`, { userid, message }, axiosConfig);
    auditLog(req.user.username, 'KICK', `userid=${userid}`);
    return res.json({ ok: true, message: `Kicked ${userid}` });
  } catch (e) {
    return res.status(502).json({ error: 'Kick failed', detail: e.message });
  }
});

app.post('/api/server/ban', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  const userid = sanitize(req.body.userid);
  if (!userid) return res.status(400).json({ error: 'User ID required' });
  try {
    await axios.post(`${BASE_URL}/ban`, { userid }, axiosConfig);
    auditLog(req.user.username, 'BAN', `userid=${userid}`);
    return res.json({ ok: true, message: `Banned ${userid}` });
  } catch (e) {
    return res.status(502).json({ error: 'Ban failed', detail: e.message });
  }
});

app.post('/api/server/unban', authenticate, requireAdmin, actionLimiter, async (req, res) => {
  const userid = sanitize(req.body.userid);
  if (!userid) return res.status(400).json({ error: 'User ID required' });
  try {
    await axios.post(`${BASE_URL}/unban`, { userid }, axiosConfig);
    auditLog(req.user.username, 'UNBAN', `userid=${userid}`);
    return res.json({ ok: true, message: `Unbanned ${userid}` });
  } catch (e) {
    return res.status(502).json({ error: 'Unban failed', detail: e.message });
  }
});

// ── Audit log viewer (admin only) ────────────────────────────────────
app.get('/api/audit', authenticate, requireAdmin, (req, res) => {
  try {
    const lines = fs.readFileSync(AUDIT_LOG, 'utf8').split('\n').filter(Boolean).slice(-100);
    return res.json({ entries: lines });
  } catch {
    return res.json({ entries: [] });
  }
});

// ── SPA fallback ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Relaxaurus Web Dashboard running on http://localhost:${PORT}`);
});
