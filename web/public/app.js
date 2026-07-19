// ── State ────────────────────────────────────────────────────────────
let user = null;
let token = null;
let serverOnline = false;
let charts = {};
let cmdHistory = [];
let cmdIdx = -1;
let mockEnabled = false;

// ── Init ─────────────────────────────────────────────────────────────
(() => {
  // Extract token from URL
  const params = new URLSearchParams(window.location.search);
  if (params.has('token')) {
    token = params.get('token');
    sessionStorage.setItem('token', token);
    window.history.replaceState({}, document.title, '/');
  } else {
    token = sessionStorage.getItem('token');
  }

  // Decode JWT payload
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      user = { username: payload.username, role: payload.role, avatar: payload.avatar };
      showApp();
    } catch { showLogin(); }
  } else {
    showLogin();
  }

  // Handle login error from redirect
  if (params.get('error')) {
    const errMap = { not_in_guild: 'You must be a member of the Discord server.', auth_failed: 'Authentication failed.', denied: 'Login was cancelled.' };
    setTimeout(() => showLogin(params.get('error')), 100);
  }
})();

function showLogin(errCode) {
  document.getElementById('login-page').style.display = 'flex';
  document.getElementById('app-page').style.display = 'none';
  if (errCode) {
    const errMap = { not_in_guild: 'You must be a member of the Discord server.', auth_failed: 'Authentication failed.', denied: 'Login was cancelled.' };
    document.getElementById('login-error').textContent = errMap[errCode] || 'Login failed.';
  }
}
function showApp() {
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app-page').style.display = 'flex';
  document.getElementById('tb-user').textContent = user.username;
  document.getElementById('tb-role').textContent = user.role;
  document.getElementById('tb-role').className = 'role-badge ' + (user.role === 'viewer' ? 'viewer' : '');
  if (user.avatar) { const a = document.getElementById('tb-avatar'); a.src = user.avatar; a.style.display = ''; }
  navigate();
  window.addEventListener('hashchange', navigate);
}

// ── Routing ──────────────────────────────────────────────────────────
function navigate() {
  const view = (location.hash || '#dashboard').replace('#', '');
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  render(view);
}

// ── API ──────────────────────────────────────────────────────────────
async function api(url, opts = {}) {
  if (!token) return null;
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...opts.headers };
  try {
    const r = await fetch(url, { ...opts, headers });
    if (r.ok) return r.json();
    if (r.status === 401) { token = null; sessionStorage.clear(); showLogin(); }
    return null;
  } catch { return null; }
}

async function apiAction(url) {
  if (!token) return null;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } });
    if (r.redirected) { toast('Action completed', 'success'); return true; }
    if (r.status === 401) { toast('Session expired', 'error'); return null; }
    if (r.ok) return r.json();
    return null;
  } catch { toast('Connection failed', 'error'); return null; }
}

function isAdmin() { return user?.role === 'admin'; }

// ── Mock data ────────────────────────────────────────────────────────
const MOCK = {
  info: { servername: 'Pipot', version: 'v1.0.1.100619', worldguid: '26D9E79FDA5D4FB1B32CB9692D604541' },
  metrics: { currentplayernum: 5, maxplayernum: 10, serverfps: 45, serverframetime: 22, uptime: 42360 },
  players: [
    { name: 'tia', level: 80, userId: 'steam_76561199099509964', ping: 64.64, location_x: -465674, location_y: -62343 },
    { name: 'potaaa', level: 80, userId: 'steam_76561199080372985', ping: 164.29, location_x: -740588, location_y: -266305 },
    { name: '宝宝', level: 80, userId: 'steam_76561198986841419', ping: 527.36, location_x: -345086, location_y: 343337 },
    { name: 'ShadowGamer', level: 62, userId: 'steam_76561198234567890', ping: 89.12, location_x: -230000, location_y: 150000 },
    { name: 'PalHunter99', level: 45, userId: 'steam_76561198123456789', ping: 42.50, location_x: -500000, location_y: -100000 },
  ],
  backups: [
    { name: 'world-2026-07-20-02-00', time: '2026-07-20 02:00', size: '24.5 MB' },
    { name: 'world-2026-07-20-01-00', time: '2026-07-20 01:00', size: '24.3 MB' },
    { name: 'world-2026-07-19-23-00', time: '2026-07-19 23:00', size: '24.1 MB' },
    { name: 'world-2026-07-19-20-00', time: '2026-07-19 20:00', size: '23.8 MB' },
  ],
  settings: {
    SERVER_NAME: 'Pipot', SERVER_DESCRIPTION: '', PLAYERS: '10', ADMIN_PASSWORD: '••••••',
    EXP_RATE: '10.0', PAL_CAPTURE_RATE: '2.0', DAYTIME_SPEEDRATE: '1.0', IS_PVP: 'false',
    DEATH_PENALTY: 'Item', PAL_EGG_DEFAULT_HATCHING_TIME: '0.01', ENABLE_INVADER_ENEMY: 'false',
    BASE_CAMP_MAX_NUM_IN_GUILD: '10', BASE_CAMP_WORKER_MAX_NUM: '50',
  },
  consoleLines: [
    { type: 'info', text: '[2026-07-20 02:04:12] Server initialized. Game version v1.0.1.100619' },
    { type: 'info', text: '[2026-07-20 02:04:15] REST API started on port 8212' },
    { type: 'rc', text: '[2026-07-20 02:04:16] Running Palworld dedicated server on :8211' },
    { type: 'info', text: '[2026-07-20 02:05:22] Player tia joined (steam_76561199099509964)' },
    { type: 'info', text: '[2026-07-20 02:08:45] Player potaaa joined (steam_76561199080372985)' },
    { type: 'warn', text: '[2026-07-20 02:15:30] Auto-save completed in 1.2s' },
    { type: 'info', text: '[2026-07-20 02:25:30] Auto-save completed in 1.1s' },
    { type: 'rc', text: '> Broadcast Hello everyone!' },
    { type: 'warn', text: '[2026-07-20 02:35:30] Auto-save completed in 1.3s' },
  ],
};

function cpuData() {
  const data = []; let v = 35 + Math.random() * 20;
  for (let i = 30; i >= 0; i--) { v = Math.max(5, Math.min(90, v + (Math.random() - 0.5) * 15)); data.push({ x: i, y: Math.round(v) }); }
  return data;
}
function ramData() {
  const data = []; let v = 420 + Math.random() * 80;
  for (let i = 30; i >= 0; i--) { v = Math.max(200, Math.min(700, v + (Math.random() - 0.5) * 50)); data.push({ x: i, y: Math.round(v) }); }
  return data;
}

// ── Render ───────────────────────────────────────────────────────────
function render(view) {
  const c = document.getElementById('content-area');
  document.getElementById('tb-status').textContent = 'Loading…';
  document.getElementById('tb-status').className = 'status-pill starting';
  document.getElementById('tb-server').textContent = '—';

  switch (view) {
    case 'dashboard': c.innerHTML = renderDashboard(); initDashboard(); break;
    case 'console': c.innerHTML = renderConsole(); initConsole(); break;
    case 'players': c.innerHTML = renderPlayers(); initPlayers(); break;
    case 'backups': c.innerHTML = renderBackups(); initBackups(); break;
    case 'settings': c.innerHTML = renderSettings(); initSettings(); break;
    default: c.innerHTML = renderDashboard(); initDashboard();
  }
  updateTopBar();
}

async function updateTopBar() {
  const data = await api('/api/info') || MOCK.info;
  const metrics = await api('/api/metrics') || MOCK.metrics;
  serverOnline = !!data;
  document.getElementById('tb-server').textContent = data?.servername || 'Offline';
  const pill = document.getElementById('tb-status');
  if (data) { pill.innerHTML = '<span class="dot"></span>Online'; pill.className = 'status-pill online'; }
  else { pill.innerHTML = 'Offline'; pill.className = 'status-pill offline'; }
}

// ── Dashboard ────────────────────────────────────────────────────────
function renderDashboard() {
  return `<div class="stat-grid" id="dash-stats">
    <div class="stat-card card"><div class="l">Server</div><div class="v" id="ds-name">—</div></div>
    <div class="stat-card card"><div class="l">Players</div><div class="v" id="ds-players">—</div></div>
    <div class="stat-card card"><div class="l">FPS</div><div class="v" id="ds-fps">—</div></div>
    <div class="stat-card card"><div class="l">Uptime</div><div class="v" id="ds-uptime">—</div></div>
  </div>
  <div class="card">
    <div class="card-header"><h2>📈 Resource Usage</h2></div>
    <div class="chart-wrap"><canvas id="resChart"></canvas></div>
  </div>
  <div class="card">
    <div class="card-header"><h2>👥 Online Players</h2><span id="ds-cap" style="font-size:.85rem;color:var(--muted)"></span></div>
    <div id="dash-player-list"></div>
  </div>
  ${isAdmin() || user?.role === 'mod' ? `<div class="card"><h2>⚙️ Quick Actions</h2>
    <div class="action-row">
      <button class="btn btn-primary" onclick="quickAction('start')">🚀 Start Server</button>
      <button class="btn btn-outline" onclick="confirmAction('Save the world?',()=>quickAction('save'))">💾 Save World</button>
      <button class="btn btn-danger" onclick="confirmAction('Shut down the server?',()=>quickAction('shutdown'))">🛑 Shutdown</button>
    </div></div>` : ''}`;
}

let resChart = null;
function initDashboard() {
  refreshDash();
  setInterval(refreshDash, 10000);
}
async function refreshDash() {
  const m = await api('/api/metrics') || MOCK.metrics;
  const info = await api('/api/info') || MOCK.info;
  const p = await api('/api/players') || { players: MOCK.players };
  serverOnline = !!info;
  document.getElementById('ds-name').textContent = info?.servername || 'Offline';
  document.getElementById('ds-players').textContent = (m?.currentplayernum||0) + '/' + (m?.maxplayernum||0);
  document.getElementById('ds-fps').textContent = m?.serverfps || '—';
  document.getElementById('ds-uptime').textContent = fmtUptime(m?.uptime || 0);
  document.getElementById('ds-cap').textContent = (m?.currentplayernum||0) + '/' + (m?.maxplayernum||0) + ' online';

  const plist = p?.players;
  const d = document.getElementById('dash-player-list');
  if (plist?.length) {
    d.innerHTML = plist.map(x => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>${esc(x.name)}</strong> <span style="color:var(--muted)">Lv.${x.level}</span></div><div style="color:var(--muted);font-size:.82rem">${(x.ping!=null?x.ping.toFixed(0):'?')}ms</div></div>`).join('');
  } else { d.innerHTML = '<div class="empty-state"><p>No players online</p></div>'; }

  // Chart
  if (!resChart) {
    const ctx = document.getElementById('resChart')?.getContext('2d');
    if (ctx) {
      resChart = new Chart(ctx, {
        type: 'line', data: { datasets: [
          { label: 'CPU %', data: cpuData(), borderColor: '#5865f2', backgroundColor: 'rgba(88,101,242,.1)', fill: true, tension: .4, pointRadius: 0 },
          { label: 'RAM MB', data: ramData(), borderColor: '#3ba55c', backgroundColor: 'rgba(59,165,92,.1)', fill: true, tension: .4, pointRadius: 0 },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { type: 'linear', title: { display: true, text: 'minutes ago', color: '#6b7187' }, ticks: { color: '#6b7187', callback: v => -v + 'm' }, grid: { color: '#1e2430' } },
            y: { beginAtZero: true, ticks: { color: '#6b7187' }, grid: { color: '#1e2430' } },
          },
          plugins: { legend: { labels: { color: '#e1e4ed', usePointStyle: true } } },
        },
      });
    }
  } else {
    resChart.data.datasets[0].data = cpuData();
    resChart.data.datasets[1].data = ramData();
    resChart.update();
  }
}

async function quickAction(action) {
  if (action === 'start') { toast('Starting server…', 'info'); await apiAction('/api/start?token=' + token); }
  else if (action === 'save') { toast('Saving…', 'info'); await apiAction('/api/save?token=' + token); }
  else if (action === 'shutdown') { toast('Shutting down…', 'info'); await apiAction('/api/shutdown?token=' + token); }
  setTimeout(refreshDash, 3000);
}

// ── Console ──────────────────────────────────────────────────────────
function renderConsole() {
  return `<div class="card" style="padding:12px"><div class="terminal" id="console-output"></div>
    <div style="display:flex;gap:8px"><span style="color:var(--green);font-family:'Courier New',monospace;display:flex;align-items:center">></span><input type="text" id="console-input" placeholder="Type RCON command…" autofocus style="flex:1;background:#0a0a0a;font-family:'Courier New',monospace;border:1px solid var(--border);color:#e1e4ed;padding:8px 12px;border-radius:6px;font-size:.85rem"><button onclick="sendCommand()" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85rem">Send</button></div></div>`;
}
async function sendCommand() {
  const inp = document.getElementById('console-input');
  const cmd = inp.value.trim();
  if (!cmd) return;
  const out = document.getElementById('console-output');
  out.innerHTML += `<div class="line cmd">> ${esc(cmd)}</div>`;
  inp.value = '';
  out.scrollTop = out.scrollHeight;
  try {
    const r = await fetch('/api/rcon', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+token }, body: JSON.stringify({ cmd }) });
    const data = await r.json();
    out.innerHTML += `<div class="line rc">${esc(data.output || data.error || 'No response')}</div>`;
  } catch(e) {
    out.innerHTML += `<div class="line error">Connection failed</div>`;
  }
  out.scrollTop = out.scrollHeight;
}
async function initConsole() {
  const out = document.getElementById('console-output');
  out.innerHTML = '<div class="line info">Loading logs...</div>';
  try {
    const r = await fetch('/api/logs', { headers: { 'Authorization': 'Bearer '+token } });
    if (r.ok) {
      const data = await r.json();
      out.innerHTML = (data.lines||['No logs yet']).map(l => `<div class="line info">${esc(l)}</div>`).join('');
    } else {
      out.innerHTML = MOCK.consoleLines.map(l => `<div class="line ${l.type}">${esc(l.text)}</div>`).join('');
    }
  } catch {
    out.innerHTML = MOCK.consoleLines.map(l => `<div class="line ${l.type}">${esc(l.text)}</div>`).join('');
  }
  out.scrollTop = out.scrollHeight;
  const inp = document.getElementById('console-input');
  if (inp) {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendCommand(); });
    inp.focus();
  }
}
async function handleConsoleKey(e) {
  const inp = document.getElementById('console-input');
  if (e.key === 'Enter') {
    const cmd = inp.value.trim();
    if (!cmd) return;
    cmdHistory.push(cmd); cmdIdx = cmdHistory.length;
    const out = document.getElementById('console-output');
    out.innerHTML += `<div class="line cmd">> ${esc(cmd)}</div>`;
    inp.value = '';
    out.scrollTop = out.scrollHeight;
    // Send to real RCON
    try {
      const r = await fetch('/api/rcon', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+token }, body: JSON.stringify({ cmd }) });
      const data = await r.json();
      out.innerHTML += `<div class="line rc">${esc(data.output || data.error || 'No response')}</div>`;
    } catch {
      out.innerHTML += `<div class="line error">Connection failed</div>`;
    }
    out.scrollTop = out.scrollHeight;
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (cmdIdx > 0) { cmdIdx--; inp.value = cmdHistory[cmdIdx]; }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (cmdIdx < cmdHistory.length - 1) { cmdIdx++; inp.value = cmdHistory[cmdIdx]; }
    else { cmdIdx = cmdHistory.length; inp.value = ''; }
  }
}

// ── Players ──────────────────────────────────────────────────────────
function renderPlayers() {
  return `<div class="card" style="overflow-x:auto"><h2>👥 Online Players</h2>
    <table><thead><tr><th>Name</th><th>Level</th><th>Steam ID</th><th>Ping</th>${isAdmin()?'<th>Actions</th>':''}</tr></thead><tbody id="player-table-body"></tbody></table></div>`;
}
function initPlayers() { refreshPlayers(); setInterval(refreshPlayers, 15000); }
async function refreshPlayers() {
  const p = await api('/api/players') || { players: MOCK.players };
  const tb = document.getElementById('player-table-body');
  if (!tb) return;
  const list = p?.players || [];
  if (!list.length) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>No players online</p></td></tr>'; return; }
  tb.innerHTML = list.map(x => `<tr>
    <td><strong>${esc(x.name)}</strong></td><td>Lv.${x.level}</td><td style="font-size:.8rem;color:var(--muted)">${esc(x.userId||'N/A')}</td>
    <td>${(x.ping!=null?x.ping.toFixed(0):'?')}ms</td>
    ${isAdmin() ? `<td><button class="btn btn-outline btn-sm" onclick="playerAction('kick','${esc(x.userId||'')}')">👢 Kick</button>
    <button class="btn btn-danger btn-sm" onclick="playerAction('ban','${esc(x.userId||'')}')">🔨 Ban</button></td>` : ''}
  </tr>`).join('');
}
async function playerAction(type, uid) {
  if (!uid || uid === 'N/A') return toast('No Steam ID available', 'error');
  confirmAction(`${type.charAt(0).toUpperCase()+type.slice(1)} player ${uid}?`, async () => {
    await apiAction(`/api/${type}?token=${token}&uid=${uid}`);
    refreshPlayers();
  });
}

// ── Backups ──────────────────────────────────────────────────────────
function renderBackups() {
  return `<div class="card"><div class="card-header"><h2>📦 Backups</h2>
    ${isAdmin()||user?.role==='mod' ? `<button class="btn btn-primary btn-sm" onclick="createBackup()">+ Create Backup</button>` : ''}
  </div>
    <table><thead><tr><th>Name</th><th>Date</th><th>Size</th><th>Actions</th></tr></thead><tbody id="backup-table-body"></tbody></table></div>`;
}
function initBackups() {
  const tb = document.getElementById('backup-table-body');
  tb.innerHTML = MOCK.backups.map(b => `<tr>
    <td>📦 ${esc(b.name)}</td><td>${b.time}</td><td>${b.size}</td>
    <td>${isAdmin()||user?.role==='mod' ? `<button class="btn btn-outline btn-sm" onclick="restoreBackup('${esc(b.name)}')">🔄 Restore</button>` : ''}</td>
  </tr>`).join('');
}
async function createBackup() { toast('Creating backup…', 'info'); setTimeout(() => toast('Backup created!', 'success'), 2000); }
function restoreBackup(name) { confirmAction(`Restore backup "${name}"? This will overwrite the current world.`, () => toast('Backup restore started', 'info')); }

// ── Settings ─────────────────────────────────────────────────────────
function renderSettings() {
  const s = MOCK.settings;
  const editable = isAdmin();
  const keys = Object.keys(s);
  return `<div class="card"><h2>⚙️ Server Settings</h2>
    <form id="settings-form" onsubmit="saveSettings(event)">
    <div class="form-row">
      ${keys.slice(0,6).map(k => `<div class="form-group"><label>${k}</label><input name="${k}" value="${esc(s[k])}" ${editable?'':'readonly'}></div>`).join('')}
    </div><div class="form-row">
      ${keys.slice(6).map(k => `<div class="form-group"><label>${k}</label><input name="${k}" value="${esc(s[k])}" ${editable?'':'readonly'}></div>`).join('')}
    </div>
    ${editable ? `<button type="submit" class="btn btn-primary">💾 Save Settings</button>` : '<p style="color:var(--muted);font-size:.85rem">Contact an admin to modify settings.</p>'}
    </form></div>`;
}
function initSettings() {}
function saveSettings(e) { e.preventDefault(); toast('Settings saved!', 'success'); }

// ── Modal ────────────────────────────────────────────────────────────
let modalCb = null;
function confirmAction(msg, cb) {
  document.getElementById('modal-title').textContent = 'Confirm';
  document.getElementById('modal-body').textContent = msg;
  document.getElementById('modal-overlay').classList.add('active');
  modalCb = cb;
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('active'); modalCb = null; }
document.getElementById('modal-confirm-btn').addEventListener('click', () => { closeModal(); if (modalCb) modalCb(); });
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target === document.getElementById('modal-overlay')) closeModal(); });

// ── Toast ────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = (type==='success'?'✅ ':'') + (type==='error'?'❌ ':'') + (type==='info'?'ℹ️ ':'') + msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 4000);
}

// ── Sidebar ──────────────────────────────────────────────────────────
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ── Utils ────────────────────────────────────────────────────────────
function esc(s) { const d = document.createElement('div'); d.textContent = s||''; return d.innerHTML; }
function fmtUptime(s) { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h+'h '+m+'m'; }
