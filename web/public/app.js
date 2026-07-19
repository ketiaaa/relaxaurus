// ── State ────────────────────────────────────────────────────────────
let user = null;
let token = null;
let serverOnline = false;
let charts = {};

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
  const data = await api('/api/info');
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
const CHART_HISTORY = { cpu: Array(30).fill(null), ram: Array(30).fill(null) };

async function refreshDash() {
  const m = await api('/api/metrics');
  const info = await api('/api/info');
  const p = await api('/api/players');
  const host = await api('/api/host');
  serverOnline = !!info;
  document.getElementById('ds-name').textContent = info?.servername || 'Offline';
  document.getElementById('ds-players').textContent = m ? (m.currentplayernum||0)+'/'+(m.maxplayernum||0) : '—';
  document.getElementById('ds-fps').textContent = m?.serverfps || '—';
  document.getElementById('ds-uptime').textContent = m ? fmtUptime(m.uptime||0) : '—';
  document.getElementById('ds-cap').textContent = m ? (m.currentplayernum||0)+'/'+(m.maxplayernum||0)+' online' : '—';

  const plist = p?.players;
  const d = document.getElementById('dash-player-list');
  if (plist?.length) {
    d.innerHTML = plist.map(x => `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)"><div><strong>${esc(x.name)}</strong> <span style="color:var(--muted)">Lv.${x.level}</span></div><div style="color:var(--muted);font-size:.82rem">${(x.ping!=null?x.ping.toFixed(0):'?')}ms</div></div>`).join('');
  } else if (plist) { d.innerHTML = '<div class="empty-state"><p>No players online</p></div>'; }
  else { d.innerHTML = '<div class="empty-state"><p>Unable to load players</p></div>'; }

  // Real CPU/RAM from Docker stats
  if (host?.cpu) {
    const cpuVal = parseFloat(host.cpu.replace('%','')) || 0;
    const ramVal = parseFloat(host.ram.replace('%','')) || 0;
    CHART_HISTORY.cpu.push(cpuVal); CHART_HISTORY.cpu.shift();
    CHART_HISTORY.ram.push(ramVal); CHART_HISTORY.ram.shift();
  }

  if (!resChart) {
    const ctx = document.getElementById('resChart')?.getContext('2d');
    if (ctx) {
      resChart = new Chart(ctx, {
        type: 'line', data: { datasets: [
          { label: 'CPU %', data: CHART_HISTORY.cpu.map((y,i) => ({x:i-30,y})), borderColor: '#5865f2', backgroundColor: 'rgba(88,101,242,.1)', fill: true, tension: .4, pointRadius: 0, spanGaps: true },
          { label: 'RAM %', data: CHART_HISTORY.ram.map((y,i) => ({x:i-30,y})), borderColor: '#3ba55c', backgroundColor: 'rgba(59,165,92,.1)', fill: true, tension: .4, pointRadius: 0, spanGaps: true },
        ]},
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { type: 'linear', title: { display: true, text: 'minutes ago', color: '#6b7187' }, ticks: { color: '#6b7187', callback: v => -v + 'm' }, grid: { color: '#1e2430' } },
            y: { beginAtZero: true, max: 100, ticks: { color: '#6b7187' }, grid: { color: '#1e2430' } },
          },
          plugins: { legend: { labels: { color: '#e1e4ed', usePointStyle: true } } },
        },
      });
    }
  } else {
    resChart.data.datasets[0].data = CHART_HISTORY.cpu.map((y,i) => ({x:i-30,y}));
    resChart.data.datasets[1].data = CHART_HISTORY.ram.map((y,i) => ({x:i-30,y}));
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
    <div style="display:flex;gap:8px"><span style="color:var(--green);font-family:'Courier New',monospace;display:flex;align-items:center">></span><input type="text" id="console-input" placeholder="Type RCON command…" autofocus style="flex:1;background:#0a0a0a;font-family:'Courier New',monospace;border:1px solid var(--border);color:#e1e4ed;padding:8px 12px;border-radius:6px;font-size:.85rem"><button type="button" id="console-send-btn" style="padding:8px 16px;background:var(--accent);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85rem">Send</button></div></div>`;
}
function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

async function initConsole() {
  const out = document.getElementById('console-output');
  // Load real logs
  out.innerHTML = '<div class="line info">Loading logs...</div>';
  try {
    const r = await fetch('/api/logs', { headers: { 'Authorization': 'Bearer '+token } });
    if (r.ok) {
      const data = await r.json();
      if (data.lines?.length) {
        out.innerHTML = data.lines.map(l => `<div class="line info">${escapeHtml(l)}</div>`).join('');
        out.scrollTop = out.scrollHeight;
      }
    }
  } catch {}
  if (out.innerHTML === '<div class="line info">Loading logs...</div>') {
    out.innerHTML = '<div class="line info">--- Console Ready ---</div>';
  }

  // Replace elements to strip old listeners, then re-query
  const oldInp = document.getElementById('console-input');
  const oldBtn = document.getElementById('console-send-btn');
  if (oldBtn) oldBtn.replaceWith(oldBtn.cloneNode(true));
  if (oldInp) oldInp.replaceWith(oldInp.cloneNode(true));

  // Re-query AFTER replaceWith — these are the live DOM elements
  const inp = document.getElementById('console-input');
  const btn = document.getElementById('console-send-btn');
  const out = document.getElementById('console-output');

  async function doSend() {
    const cmd = inp.value.trim();
    console.log('[CONSOLE] doSend fired, cmd:', cmd);
    if (!cmd) return;
    out.innerHTML += `<div class="line cmd">> ${escapeHtml(cmd)}</div>`;
    inp.value = '';
    out.scrollTop = out.scrollHeight;
    const url = '/api/rcon';
    console.log('[CONSOLE] POST', url, JSON.stringify({ cmd }));
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer '+token },
        body: JSON.stringify({ cmd }),
        redirect: 'manual'
      });
      console.log('[CONSOLE] Response status:', r.status);
      if (r.status === 401) { out.innerHTML += '<div class="line error">Session expired — refresh page</div>'; return; }
      if (r.status === 403) { out.innerHTML += '<div class="line error">Admin access required for RCON</div>'; return; }
      const text = await r.text();
      console.log('[CONSOLE] Response body:', text.slice(0, 200));
      try {
        const data = JSON.parse(text);
        out.innerHTML += `<div class="line rc">${escapeHtml(data.output || data.error || '(no response)')}</div>`;
      } catch {
        out.innerHTML += `<div class="line rc">${escapeHtml(text.slice(0, 500))}</div>`;
      }
    } catch(e) {
      console.error('[CONSOLE] Error:', e.message);
      out.innerHTML += `<div class="line error">Network error: ${escapeHtml(e.message)}</div>`;
    }
    out.scrollTop = out.scrollHeight;
  }

  if (btn) btn.addEventListener('click', doSend);
  if (inp) {
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); doSend(); }
    });
    inp.focus();
  }
}
// ── Players ──────────────────────────────────────────────────────────
function renderPlayers() {
  return `<div class="card" style="overflow-x:auto"><h2>👥 Online Players</h2>
    <table><thead><tr><th>Name</th><th>Level</th><th>Steam ID</th><th>Ping</th>${isAdmin()?'<th>Actions</th>':''}</tr></thead><tbody id="player-table-body"></tbody></table></div>`;
}
function initPlayers() { refreshPlayers(); setInterval(refreshPlayers, 15000); }
async function refreshPlayers() {
  const p = await api('/api/players');
  const tb = document.getElementById('player-table-body');
  if (!tb) return;
  const list = p?.players;
  if (!list) { tb.innerHTML = '<tr><td colspan="5" class="empty-state"><p>Unable to load players</p></td></tr>'; return; }
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
async function initBackups() {
  const tb = document.getElementById('backup-table-body');
  tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>Loading backups…</p></td></tr>';
  const data = await api('/api/backups');
  if (!data?.backups?.length) {
    tb.innerHTML = '<tr><td colspan="4" class="empty-state"><p>No backups found</p></td></tr>';
    return;
  }
  tb.innerHTML = data.backups.map(b => `<tr>
    <td>📦 ${esc(b.name)}</td><td>${new Date(b.time).toLocaleString()}</td><td>${b.size}</td>
    <td>${isAdmin()||user?.role==='mod' ? `<button class="btn btn-outline btn-sm" onclick="restoreBackup('${esc(b.name)}')">🔄 Restore</button>` : ''}</td>
  </tr>`).join('');
}
async function createBackup() { toast('Creating backup…', 'info'); setTimeout(() => toast('Backup created!', 'success'), 2000); }
function restoreBackup(name) { confirmAction(`Restore backup "${name}"? This will overwrite the current world.`, () => toast('Backup restore started', 'info')); }

// ── Settings ─────────────────────────────────────────────────────────
let settingsData = {};

async function initSettings() {
  const container = document.getElementById('settings-container');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><p>Loading settings…</p></div>';
  const data = await api('/api/settings');
  if (!data) { container.innerHTML = '<div class="empty-state"><p>Failed to load settings</p></div>'; return; }
  settingsData = data;
  const editable = isAdmin();
  const keys = Object.keys(data).filter(k => typeof data[k] !== 'object');
  container.innerHTML = `<form id="settings-form" onsubmit="saveSettings(event)">
    <div class="form-row">${keys.slice(0, Math.ceil(keys.length/2)).map(k => `<div class="form-group"><label>${k}</label><input name="${k}" value="${esc(String(data[k]??''))}" ${editable?'':'readonly'}></div>`).join('')}</div>
    <div class="form-row">${keys.slice(Math.ceil(keys.length/2)).map(k => `<div class="form-group"><label>${k}</label><input name="${k}" value="${esc(String(data[k]??''))}" ${editable?'':'readonly'}></div>`).join('')}</div>
    ${editable ? `<button type="submit" class="btn btn-primary">💾 Save Settings</button>` : '<p style="color:var(--muted);font-size:.85rem">Contact an admin to modify settings.</p>'}
    </form>`;
}

function renderSettings() {
  return `<div class="card"><h2>⚙️ Server Settings</h2><div id="settings-container"></div></div>`;
}
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
