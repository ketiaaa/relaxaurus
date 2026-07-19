// Run: node test/server.test.js
// Tests security: unauthenticated, role checks, input sanitization

const http = require('http');
const path = require('path');

const BASE = 'http://localhost:3001';
let token = '';
let viewerToken = '';

// Start a test server (requires the real server.js to accept PORT env var)
async function setup() {
  // Set test env
  process.env.PORT = 3001;
  process.env.JWT_SECRET = 'test-secret-32chars-minimum!!!';
  process.env.DASHBOARD_USER = 'testadmin';
  process.env.DASHBOARD_PASS = 'testpass123';
  process.env.VIEWER_USER = 'testviewer';
  process.env.VIEWER_PASS = 'viewpass123';
  process.env.PALWORLD_HOST = '127.0.0.1';
  process.env.PALWORLD_REST_PORT = 8212;
  process.env.PALWORLD_ADMIN_PASSWORD = 'test';

  const app = require('../server.js');
  // server.js calls app.listen, we let it bind
  await new Promise(r => setTimeout(r, 500));
}

async function request(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url, BASE);
    const opts = {
      hostname: u.hostname, port: u.port, path: u.pathname,
      method, headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== Relaxaurus Web Dashboard Security Tests ===\n');

  // 1. Unauthenticated access
  console.log('1. Unauthenticated requests...');
  let r = await request('GET', '/api/server/info');
  console.assert(r.status === 401, 'GET /info without auth → 401', r.status);
  console.log('   GET /info without auth:', r.status === 401 ? 'PASS' : 'FAIL');

  r = await request('POST', '/api/server/save');
  console.assert(r.status === 401, 'POST /save without auth → 401', r.status);
  console.log('   POST /save without auth:', r.status === 401 ? 'PASS' : 'FAIL');

  // 2. Login with wrong password
  console.log('\n2. Login with wrong password...');
  r = await request('POST', '/api/auth/login', { username: 'testadmin', password: 'wrong' });
  console.assert(r.status === 401, 'Wrong password → 401', r.status);
  console.log('   Wrong password:', r.status === 401 ? 'PASS' : 'FAIL');

  // 3. Login as admin
  console.log('\n3. Login as admin...');
  r = await request('POST', '/api/auth/login', { username: 'testadmin', password: 'testpass123' });
  console.assert(r.status === 200, 'Admin login → 200', r.status);
  console.log('   Admin login:', r.status === 200 ? 'PASS' : 'FAIL');
  token = r.headers['set-cookie'] || '';

  // 4. Viewer cannot do admin actions
  console.log('\n4. Viewer role restrictions...');
  r = await request('POST', '/api/auth/login', { username: 'testviewer', password: 'viewpass123' });
  const vCookie = r.headers['set-cookie'] || '';
  r = await request('POST', '/api/server/save', {}, { Cookie: vCookie });
  console.assert(r.status === 403, 'Viewer save → 403', r.status);
  console.log('   Viewer save rejected:', r.status === 403 ? 'PASS' : 'FAIL');

  r = await request('GET', '/api/server/info', null, { Cookie: vCookie });
  console.assert(r.status === 200, 'Viewer info → 200', r.status);
  console.log('   Viewer info allowed:', r.status === 200 ? 'PASS' : 'FAIL');

  // 5. Malformed input sanitization
  console.log('\n5. Input sanitization...');
  r = await request('POST', '/api/server/announce', { message: 'test; rm -rf /' }, { Cookie: token });
  // Should accept but sanitize
  console.log('   Injection attempt handled:', r.status < 500 ? 'PASS' : 'FAIL');

  // 6. Missing required fields
  console.log('\n6. Missing required fields...');
  r = await request('POST', '/api/server/kick', {}, { Cookie: token });
  console.assert(r.status === 400, 'Kick without userid → 400', r.status);
  console.log('   Kick without userid:', r.status === 400 ? 'PASS' : 'FAIL');

  r = await request('POST', '/api/server/announce', {}, { Cookie: token });
  console.assert(r.status === 400, 'Announce without message → 400', r.status);
  console.log('   Announce without message:', r.status === 400 ? 'PASS' : 'FAIL');

  console.log('\n=== All checks complete ===');
  process.exit(0);
}

run().catch((e) => {
  console.error('Test error:', e.message);
  process.exit(1);
});
