const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();

// ── Config ──────────────────────────────────────────────────────────
const PALWORLD_HOST = process.env.PALWORLD_HOST || '127.0.0.1';
const REST_PORT = process.env.PALWORLD_REST_PORT || 8212;
const RCON_PORT = process.env.PALWORLD_RCON_PORT || 25575;
const ADMIN_PASSWORD = process.env.PALWORLD_ADMIN_PASSWORD || 'admin';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const PORT = process.env.PORT || 3000;

const BASE_URL = `http://${PALWORLD_HOST}:${REST_PORT}/v1/api`;
const AUTH_HEADER = `Basic ${Buffer.from(`admin:${ADMIN_PASSWORD}`).toString('base64')}`;
const axiosConfig = { headers: { Authorization: AUTH_HEADER }, timeout: 10000 };

// ── User store (env-based, no DB needed) ────────────────────────────
const USERS = {};
const salt = bcrypt.genSaltSync(10);
const adminUser = process.env.DASHBOARD_USER || 'admin';
const adminPass = process.env.DASHBOARD_PASS || 'admin';
const viewerUser = process.env.VIEWER_USER || 'viewer';
const viewerPass = process.env.VIEWER_PASS || 'viewer';

USERS[adminUser] = { password: bcrypt.hashSync(adminPass, salt), role: 'admin' };
if (viewerUser) {
  USERS[viewerUser] = { password: bcrypt.hashSync(viewerPass, salt), role: 'viewer' };
}

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
    },
  },
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('short'));

// Rate limiting
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Rate limit exceeded' } });
const actionLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Action rate limit exceeded' } });

app.use('/api', apiLimiter);
app.use('/api/auth/login', loginLimiter);

// ── Auth middleware ──────────────────────────────────────────────────
function authenticate(req, res, next) {
  const token = req.cookies?.token || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const user = jwt.verify(token, JWT_SECRET);
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ── Auth routes ──────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = USERS[username];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  auditLog(username, 'LOGIN');
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
  return res.json({ username, role: user.role });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ ok: true });
});

app.get('/api/auth/me', authenticate, (req, res) => {
  return res.json({ username: req.user.username, role: req.user.role });
});

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
