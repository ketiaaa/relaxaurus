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

// ── Main page (server-rendered) ──────────────────────────────────────
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const u = requireAuth(req, res);
  const token = getToken(req);

  if (u) {
    const admin = isAdmin(u);

    // Fetch server stats for initial render
    async function fetchStats() {
      try {
        const [i, p, m] = await Promise.all([
          axios.get(`${BASE_API}/info`, AX).then(r => r.data).catch(() => null),
          axios.get(`${BASE_API}/players`, AX).then(r => r.data).catch(() => null),
          axios.get(`${BASE_API}/metrics`, AX).then(r => r.data).catch(() => null),
        ]);
        const serverName = i?.servername || 'Offline';
        const players = m ? `${m.currentplayernum||0}/${m.maxplayernum||0}` : '—';
        const fps = m?.serverfps ?? '—';
        const uptime = m?.uptime != null ? (() => { const h = Math.floor(m.uptime/3600); const min = Math.floor((m.uptime%3600)/60); return `${h}h ${min}m`; })() : '—';
        const playerList = p?.players;
        const playerHTML = playerList?.length
          ? playerList.map(x => `<div class="player"><div><div class="n">${x.name} — Lv.${x.level}</div><div class="m">${x.userId||'N/A'} | ${(x.ping!=null?x.ping.toFixed(2):'?')}ms</div></div></div>`).join('')
          : '<div class="empty">No players online.</div>';
        return { serverName, players, fps, uptime, playerHTML };
      } catch {
        return null;
      }
    }

    // Render page immediately with loading state, then JS refreshes
    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Relaxaurus Dashboard</title><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#0f1117;--surface:#1a1d27;--border:#2a2d3a;--text:#e4e6ed;--muted:#8b8fa3;--accent:#5865f2;--green:#57f287;--red:#ed4245;--radius:8px}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text)}header{display:flex;justify-content:space-between;align-items:center;padding:16px 24px;background:var(--surface);border-bottom:1px solid var(--border)}header h1{font-size:1.2rem}header .user{display:flex;align-items:center;gap:8px}header img{width:28px;height:28px;border-radius:50%}header a{color:var(--muted);text-decoration:none;font-size:.85rem}main{max-width:960px;margin:20px auto;padding:0 20px}.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:18px;margin-bottom:14px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}.stat{text-align:center;padding:14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}.stat .l{font-size:.75rem;color:var(--muted)}.stat .v{font-size:1.3rem;font-weight:600;margin-top:2px}button,.btn{padding:8px 14px;border-radius:var(--radius);border:none;font-size:.85rem;cursor:pointer;background:var(--accent);color:#fff;text-decoration:none;display:inline-block;margin:3px}button:hover,.btn:hover{opacity:.85}.btn-danger{background:var(--red)}.btn-ghost{background:transparent;color:var(--muted)}h2{font-size:1rem;margin-bottom:10px}.player{border-bottom:1px solid var(--border);padding:8px 0;display:flex;justify-content:space-between}.player:last-child{border:none}.player .n{font-weight:600}.player .m{font-size:.8rem;color:var(--muted)}.empty{color:var(--muted)}pre{background:var(--bg);padding:10px;border-radius:var(--radius);font-size:.78rem;max-height:250px;overflow-y:auto}form.inline{display:inline}.result{margin:8px 0;font-size:.85rem}.result.g{color:var(--green)}.result.r{color:var(--red)}</style></head><body><header><h1>🦖 Relaxaurus</h1><div class="user">${u.avatar?`<img src="${u.avatar}" alt="">`:''} <strong>${u.username}</strong> <span class="muted">(${u.role})</span> <a href="/?logout=1">Logout</a></div></header><main><div class="row" id="stats"><div class="stat"><div class="l">Server</div><div class="v" id="s-name">—</div></div><div class="stat"><div class="l">Players</div><div class="v" id="s-players">—</div></div><div class="stat"><div class="l">FPS</div><div class="v" id="s-fps">—</div></div><div class="stat"><div class="l">Uptime</div><div class="v" id="s-uptime">—</div></div></div><div class="card"><h2>👥 Players</h2><div id="players"><div class="empty">Loading…</div></div></div>${admin?`<div class="card"><h2>⚙️ Controls</h2><form method="post" action="/api/save?token=${token}" class="inline"><button>💾 Save</button></form><form method="post" action="/api/shutdown?token=${token}" class="inline" onsubmit="return confirm('Shut down the server?')"><button class="btn-danger">🛑 Shutdown</button></form><form method="post" action="/api/announce?token=${token}" class="inline"><input type="text" name="msg" placeholder="Announcement message…" style="padding:7px 10px;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);width:180px"><button type="submit">📢 Announce</button></form><form method="post" action="/api/kick?token=${token}" class="inline" onsubmit="const u=prompt('SteamID:');if(!u)return false;this.elements.uid.value=u"><input type="hidden" name="uid"><button class="btn-danger">👢 Kick</button></form><div id="result" class="result"></div></div>`:''}</main><script>
const T = decodeURIComponent('${encodeURIComponent(token)}');
async function load() {
  try {
    const headers = { 'Authorization': 'Bearer ' + T };
    const [i,p,m] = await Promise.all([
      fetch('/api/info',{headers}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/api/players',{headers}).then(r=>r.ok?r.json():null).catch(()=>null),
      fetch('/api/metrics',{headers}).then(r=>r.ok?r.json():null).catch(()=>null)
    ]);
    if (i) { document.getElementById('s-name').textContent = i.servername||'Offline'; }
    if (m) { document.getElementById('s-players').textContent = (m.currentplayernum||0)+'/'+(m.maxplayernum||0); document.getElementById('s-fps').textContent = m.serverfps||'—'; document.getElementById('s-uptime').textContent = fmt(m.uptime||0); }
    else if (!i) { document.getElementById('players').innerHTML = '<div class=\"empty\">Server offline</div>'; }
    const pl = p?.players;
    const d = document.getElementById('players');
    if (pl?.length) { d.innerHTML = pl.map(x=>'<div class=\"player\"><div><div class=\"n\">'+esc(x.name)+' — Lv.'+x.level+'</div><div class=\"m\">'+esc(x.userId||'N/A')+' | '+((x.ping!=null?x.ping.toFixed(2):'?'))+'ms</div></div></div>').join(''); }
    else if (pl && pl.length===0) { d.innerHTML = '<div class=\"empty\">No players online.</div>'; }
  } catch(e) { document.getElementById('players').innerHTML = '<div class=\"empty\">Error: '+e.message+'</div>'; }
}
function fmt(s) { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60); return h+'h '+m+'m'; }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
load(); setInterval(load, 10000);
</script></body></html>`);
    return;
  }

  // Not logged in — show login page
  const error = req.query.error;
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Relaxaurus Dashboard</title><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e6ed;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#1a1d27;border:1px solid #2a2d3a;border-radius:8px;padding:40px;text-align:center;max-width:360px;width:100%}h1{font-size:2rem;margin-bottom:4px}p.sub{color:#8b8fa3;margin-bottom:24px}a.btn{display:block;padding:12px;background:#5865f2;color:#fff;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:500}a.btn:hover{opacity:.9}.err{color:#ed4245;margin-top:12px;font-size:.85rem}</style></head><body><div class="card"><h1>🦖 Relaxaurus</h1><p class="sub">Palworld Server Dashboard</p><a href="/auth/login" class="btn">🔑 Sign in with Discord</a>${error ? `<p class="err">${error==='not_in_guild'?'You must be a member of the Discord server to access.':error==='auth_failed'?'Authentication failed. Please try again.':error==='denied'?'Login was cancelled.':''}</p>` : ''}</div></body></html>`);
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
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  try { await axios.post(`${BASE_API}/save`, {}, AX); audit(req.authUser.username, 'SAVE'); res.redirect('/?token='+getToken(req)+'&saved=1'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
});
app.post('/api/shutdown', apiAuth, actionLimiter, async (req, res) => {
  if (!isAdmin(req.authUser)) return res.status(403).send('Admin only');
  try { await axios.post(`${BASE_API}/shutdown`, { waittime: 10, message: 'Server shutting down via dashboard' }, AX); audit(req.authUser.username, 'SHUTDOWN'); res.redirect('/?token='+getToken(req)+'&msg=Shutting+down'); } catch(e) { res.redirect('/?token='+getToken(req)+'&error='+encodeURIComponent(e.message)); }
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

// ── Start ────────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Dashboard on http://localhost:${PORT}`));
