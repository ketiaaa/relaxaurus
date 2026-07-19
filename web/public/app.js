// ── State ────────────────────────────────────────────────────────────
let user = null;
let refreshTimer = null;

// ── API helper ───────────────────────────────────────────────────────
async function api(url, opts = {}) {
  const res = await fetch(url, { credentials: 'same-origin', ...opts, headers: { 'Content-Type': 'application/json', ...opts.headers } });
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Auth ─────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    user = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
  }
});

async function checkSession() {
  try {
    user = await api('/api/auth/me');
    showDashboard();
  } catch { /* not logged in */ }
}

function logout() {
  api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  user = null;
  clearInterval(refreshTimer);
  document.getElementById('login-page').classList.add('active');
  document.getElementById('dashboard-page').classList.remove('active');
}

document.getElementById('logout-btn').addEventListener('click', logout);

// ── Dashboard ────────────────────────────────────────────────────────
function showDashboard() {
  document.getElementById('login-page').classList.remove('active');
  document.getElementById('dashboard-page').classList.add('active');
  document.getElementById('current-user').textContent = `👤 ${user.username} (${user.role})`;

  if (user.role === 'admin') {
    document.getElementById('admin-section').style.display = '';
    document.getElementById('audit-section').style.display = '';
  }

  refreshData();
  refreshTimer = setInterval(refreshData, 10000);
}

async function refreshData() {
  try {
    const [info, players, metrics] = await Promise.all([
      api('/api/server/info').catch(() => null),
      api('/api/server/players').catch(() => null),
      api('/api/server/metrics').catch(() => null),
    ]);

    // Server status
    const badge = document.getElementById('server-status');
    if (info) {
      badge.textContent = '🟢 Online';
      badge.className = 'badge online';
    } else {
      badge.textContent = '🔴 Offline';
      badge.className = 'badge offline';
    }

    // Info cards
    document.getElementById('stat-name').textContent = info?.servername || 'Offline';
    document.getElementById('stat-players').textContent = metrics ? `${metrics.currentplayernum}/${metrics.maxplayernum}` : '--';
    document.getElementById('stat-fps').textContent = metrics?.serverfps ?? '--';
    document.getElementById('stat-uptime').textContent = metrics ? fmtUptime(metrics.uptime) : '--';

    // Player list
    const plist = document.getElementById('player-list');
    if (players?.players?.length) {
      plist.innerHTML = players.players.map(p => `
        <div class="player-row">
          <div class="player-info">
            <span class="player-name">${esc(p.name)} — Lv.${p.level}</span>
            <span class="player-meta">${esc(p.userId || 'N/A')} | ${p.ping ?? '?'}ms</span>
          </div>
          ${user.role === 'admin' ? `<span style="font-size:0.8rem;color:var(--text-muted)">\`${esc(p.userId || '')}\`</span>` : ''}
        </div>
      `).join('');
    } else {
      plist.innerHTML = '<p style="color:var(--text-muted)">No players online.</p>';
    }

    // Audit log
    if (user.role === 'admin') {
      try {
        const audit = await api('/api/audit');
        document.getElementById('audit-log').textContent = audit.entries.join('\n');
      } catch {}
    }
  } catch {}
}

// ── Admin actions ────────────────────────────────────────────────────
document.querySelectorAll('.btn-action[data-action]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const action = btn.dataset.action;

    if (action === 'save') {
      const r = await api('/api/server/save', { method: 'POST' });
      showResult(`✅ ${r.message}`);
    }
    if (action === 'shutdown') {
      showConfirm('🛑 Shut down the server?', async () => {
        const r = await api('/api/server/shutdown', { method: 'POST', body: JSON.stringify({ waittime: 10, message: 'Server shutting down via dashboard' }) });
        showResult(`✅ ${r.message}`);
      });
    }
    if (action === 'kick') {
      const uid = prompt('Steam ID of player to kick:');
      if (!uid) return;
      showConfirm(`Kick player ${uid}?`, async () => {
        const r = await api('/api/server/kick', { method: 'POST', body: JSON.stringify({ userid: uid }) });
        showResult(`✅ ${r.message}`);
        refreshData();
      });
    }
    if (action === 'ban') {
      const uid = prompt('Steam ID of player to ban:');
      if (!uid) return;
      showConfirm(`Ban player ${uid}?`, async () => {
        const r = await api('/api/server/ban', { method: 'POST', body: JSON.stringify({ userid: uid }) });
        showResult(`✅ ${r.message}`);
        refreshData();
      });
    }
  });
});

function showResult(msg) {
  const el = document.getElementById('action-result');
  el.textContent = msg;
  el.className = 'result-msg success';
  setTimeout(() => { el.textContent = ''; }, 5000);
}

// ── Announce modal ───────────────────────────────────────────────────
function showAnnounce() {
  document.getElementById('announce-modal').classList.add('active');
  document.getElementById('announce-msg').value = '';
}
document.getElementById('announce-cancel').addEventListener('click', () => {
  document.getElementById('announce-modal').classList.remove('active');
});
document.getElementById('announce-send').addEventListener('click', async () => {
  const msg = document.getElementById('announce-msg').value;
  if (!msg) return;
  try {
    await api('/api/server/announce', { method: 'POST', body: JSON.stringify({ message: msg }) });
    document.getElementById('announce-modal').classList.remove('active');
    showResult('✅ Announcement sent');
  } catch (err) {
    document.getElementById('announce-result').textContent = err.message;
  }
});

// ── Confirm modal ────────────────────────────────────────────────────
let confirmCallback = null;
function showConfirm(message, cb) {
  document.getElementById('modal-body').textContent = message;
  document.getElementById('confirm-modal').classList.add('active');
  confirmCallback = cb;
}
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('confirm-modal').classList.remove('active');
});
document.getElementById('modal-confirm').addEventListener('click', async () => {
  document.getElementById('confirm-modal').classList.remove('active');
  if (confirmCallback) await confirmCallback();
});

// ── Utils ────────────────────────────────────────────────────────────
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function fmtUptime(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// ── Init ─────────────────────────────────────────────────────────────
checkSession();
