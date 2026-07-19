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

// ── Main page (server-rendered) ──────────────────────────────────────
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const u = requireAuth(req, res);
  const token = getToken(req);

  if (u) {
    const admin = isAdmin(u);
    const op = canMod(u);
    const avatarHtml = u.avatar ? `<img src="${u.avatar}" alt="" style="width:28px;height:28px;border-radius:50%">` : '';
    const style = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:root{--bg:#0b0e14;--s:#131720;--b:#1e2430;--t:#e1e4ed;--m:#6b7187;--a:#5865f2;--g:#3ba55c;--r:#ed4245;--rad:10px}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:var(--bg);color:var(--t)}.topbar{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:var(--s);border-bottom:1px solid var(--b)}.topbar h1{font-size:1.1rem}.user{display:flex;align-items:center;gap:8px;font-size:.9rem}.user img{width:28px;height:28px;border-radius:50%}main{max-width:1000px;margin:20px auto;padding:0 20px}.card{background:var(--s);border:1px solid var(--b);border-radius:var(--rad);padding:18px;margin-bottom:14px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}.stat{text-align:center;padding:14px;background:var(--s);border:1px solid var(--b);border-radius:var(--rad)}.stat .l{font-size:.7rem;color:var(--m);text-transform:uppercase;letter-spacing:.5px}.stat .v{font-size:1.3rem;font-weight:700;margin-top:2px}button,.btn{padding:8px 14px;border-radius:6px;border:none;font-size:.85rem;cursor:pointer;background:var(--a);color:#fff;text-decoration:none;display:inline-block;margin:2px}button:hover{opacity:.85}.btn-d{background:var(--r)}.btn-o{background:transparent;border:1px solid var(--b);color:var(--t)}h2{font-size:1rem;margin-bottom:10px}.player-row{border-bottom:1px solid var(--b);padding:8px 0;display:flex;justify-content:space-between}.player-row:last-child{border:none}.player-row .n{font-weight:600}.player-row .m{font-size:.8rem;color:var(--m)}.empty{color:var(--m);text-align:center;padding:20px}.pill{padding:3px 12px;border-radius:12px;font-size:.7rem;font-weight:600}.pill.on{background:var(--g);color:#000}.pill.off{background:var(--r)}form.inline{display:inline}.result{margin:8px 0;font-size:.85rem}.result.g{color:var(--g)}.result.r{color:var(--r)}input[type=text]{background:var(--bg);border:1px solid var(--b);color:var(--t);padding:8px 12px;border-radius:6px;font-size:.85rem;width:180px}@media(max-width:600px){main{padding:0 10px}.row{grid-template-columns:repeat(2,1fr)}.topbar{padding:12px 14px}}`;

    res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Relaxaurus Dashboard</title><style>${style}</style></head><body><div class="topbar"><h1>🦖 Relaxaurus</h1><div class="user">${avatarHtml} <strong>${u.username}</strong> <span style="color:var(--m)">(${u.role})</span> <a href="/logout" style="color:var(--m);text-decoration:none;font-size:.8rem">Logout</a></div></div><main><div class="row"><div class="stat"><div class="l">Server</div><div class="v" id="sn">—</div></div><div class="stat"><div class="l">Players</div><div class="v" id="sp">—</div></div><div class="stat"><div class="l">FPS</div><div class="v" id="sf">—</div></div><div class="stat"><div class="l">Uptime</div><div class="v" id="su">—</div></div></div><div class="card"><h2>👥 Players</h2><div id="pl"><div class="empty">Loading…</div></div></div>${op?`<div class="card"><h2>⚙️ Controls</h2><form method="post" action="/api/save?token=${token}" class="inline"><button>💾 Save</button></form><form method="post" action="/api/shutdown?token=${token}" class="inline" onsubmit="return confirm('Shut down the server?')"><button class="btn-d">🛑 Shutdown</button></form><form method="post" action="/api/start?token=${token}" class="inline"><button>🚀 Start</button></form>${admin?`<form method="post" action="/api/announce?token=${token}" class="inline"><input type="text" name="msg" placeholder="Announcement message…"><button type="submit">📢 Announce</button></form><form method="post" action="/api/kick?token=${token}" class="inline" onsubmit="const u=prompt('SteamID:');if(!u)return false;this.elements.uid.value=u"><input type="hidden" name="uid"><button class="btn-d">👢 Kick</button></form><form method="post" action="/api/ban?token=${token}" class="inline" onsubmit="const u=prompt('SteamID:');if(!u)return false;this.elements.uid.value=u"><input type="hidden" name="uid"><button class="btn-d">🔨 Ban</button></form><form method="post" action="/api/unban?token=${token}" class="inline" onsubmit="const u=prompt('SteamID:');if(!u)return false;this.elements.uid.value=u"><input type="hidden" name="uid"><button>✅ Unban</button></form>`:''}<div id="result" class="result"></div></div>`:''}</main><script>
const T='${encodeURIComponent(token)}';
const H={'Authorization':'Bearer '+decodeURIComponent(T)};
async function L(){try{const[i,p,m]=await Promise.all([fetch('/api/info',{headers:H}).then(r=>r.ok?r.json():null),fetch('/api/players',{headers:H}).then(r=>r.ok?r.json():null),fetch('/api/metrics',{headers:H}).then(r=>r.ok?r.json():null)]);document.getElementById('sn').textContent=i?.servername||'Offline';if(m){document.getElementById('sp').textContent=(m.currentplayernum||0)+'/'+(m.maxplayernum||0);document.getElementById('sf').textContent=m.serverfps||'—';document.getElementById('su').textContent=F(m.uptime||0)}const pl=p?.players;const d=document.getElementById('pl');if(pl?.length){d.innerHTML=pl.map(x=>'<div class=\"player-row\"><div><div class=\"n\">'+E(x.name)+' — Lv.'+x.level+'</div><div class=\"m\">'+E(x.userId||'')+' | '+(x.ping!=null?x.ping.toFixed(0):'?')+'ms</div></div></div>').join('')}else{d.innerHTML='<div class=\"empty\">No players online</div>'}}catch(e){document.getElementById('pl').innerHTML='<div class=\"empty\">Server offline</div>'}}
function F(s){var h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h+'h '+m+'m'}
function E(s){var d=document.createElement('div');d.textContent=s||'';return d.innerHTML}
L();setInterval(L,10000);
</script></body></html>`);
    return;
  }

  // Not logged in — show login page
  const error = req.query.error;
  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Relaxaurus Dashboard</title><style>*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#0b0e14;color:#e1e4ed;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:#131720;border:1px solid #1e2430;border-radius:16px;padding:48px;text-align:center;max-width:400px;width:90%}h1{font-size:2.2rem;margin-bottom:4px}p.sub{color:#6b7187;margin-bottom:28px}a.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 24px;background:#5865f2;color:#fff;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:600}a.btn:hover{background:#4752c4}.err{color:#ed4245;margin-top:14px;font-size:.85rem}</style></head><body><div class="card"><h1>🦖 Relaxaurus</h1><p class="sub">Palworld Server Dashboard</p><a href="/auth/login" class="btn">🔑 Sign in with Discord</a>${error?`<p class="err">${error==='not_in_guild'?'You must be a member of the Discord server.':error==='auth_failed'?'Authentication failed.':error==='denied'?'Login cancelled.':''}</p>`:''}</div><script>const t=sessionStorage.getItem('token');if(t)location.href='/?token='+t;</script></body></html>`);
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
