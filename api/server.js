// Sample REST API used by the Playwright API tests (tests/api/).
// Plain Node.js, no dependencies. Data is kept in memory and reset on restart.
//
//   npm run api            -> http://localhost:4002
//   API_PORT=5000 npm run api
//
// Endpoints
//   GET    /api/health            -> 200 { status: 'ok' }
//   POST   /api/auth/login        -> 200 { token } | 400 | 401
//   GET    /api/me                -> 200 { user }  | 401   (needs "Authorization: Bearer <token>")
//   GET    /api/users[?role=x]    -> 200 [users]
//   GET    /api/users/:id         -> 200 user | 404
//   POST   /api/users             -> 201 user (+ Location header) | 400 | 409
//   PUT    /api/users/:id         -> 200 user | 400 | 404 | 409
//   DELETE /api/users/:id         -> 204 | 404

const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.API_PORT) || 4002;
const ROLES = ['admin', 'editor', 'viewer'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Seed data. Tests only read these; they create their own users for writes.
const users = new Map([
  [1, { id: 1, name: 'Ada Admin', email: 'admin@example.test', role: 'admin' }],
  [2, { id: 2, name: 'Vic Viewer', email: 'viewer@example.test', role: 'viewer' }],
]);
let nextId = 3;

const CREDENTIALS = { 'admin@example.test': 'Passw0rd!' };
const sessions = new Map(); // token -> user id

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...(payload ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  });
  res.end(payload);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Returns a list of error messages; empty means valid.
function validateUser(body) {
  const errors = [];
  if (typeof body.name !== 'string' || body.name.trim() === '') errors.push('name is required');
  if (typeof body.email !== 'string' || !EMAIL_RE.test(body.email)) errors.push('email must be a valid email address');
  if (body.role !== undefined && !ROLES.includes(body.role)) errors.push(`role must be one of: ${ROLES.join(', ')}`);
  return errors;
}

function emailTaken(email, exceptId) {
  const wanted = email.toLowerCase();
  return [...users.values()].some((u) => u.email.toLowerCase() === wanted && u.id !== exceptId);
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method;

  if (method === 'GET' && pathname === '/api/health') {
    return send(res, 200, { status: 'ok' });
  }

  if (method === 'POST' && pathname === '/api/auth/login') {
    const { email, password } = await readJson(req);
    if (!email || !password) return send(res, 400, { error: 'email and password are required' });
    if (CREDENTIALS[email] !== password) return send(res, 401, { error: 'Invalid email or password' });
    const user = [...users.values()].find((u) => u.email === email);
    const token = crypto.randomBytes(16).toString('hex');
    sessions.set(token, user.id);
    return send(res, 200, { token });
  }

  if (method === 'GET' && pathname === '/api/me') {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    const user = match && users.get(sessions.get(match[1]));
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, user);
  }

  if (pathname === '/api/users') {
    if (method === 'GET') {
      const role = url.searchParams.get('role');
      const list = [...users.values()].filter((u) => !role || u.role === role);
      return send(res, 200, list);
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const errors = validateUser(body);
      if (errors.length) return send(res, 400, { errors });
      if (emailTaken(body.email)) return send(res, 409, { error: 'email already exists' });
      const user = { id: nextId++, name: body.name.trim(), email: body.email, role: body.role || 'viewer' };
      users.set(user.id, user);
      return send(res, 201, user, { Location: `/api/users/${user.id}` });
    }
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
  }

  const idMatch = /^\/api\/users\/(\d+)$/.exec(pathname);
  if (idMatch) {
    const id = Number(idMatch[1]);
    const existing = users.get(id);
    if (!['GET', 'PUT', 'DELETE'].includes(method)) {
      return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PUT, DELETE' });
    }
    if (!existing) return send(res, 404, { error: `User ${id} not found` });

    if (method === 'GET') return send(res, 200, existing);
    if (method === 'DELETE') {
      users.delete(id);
      return send(res, 204);
    }
    // PUT: full replacement of the editable fields.
    const body = await readJson(req);
    const errors = validateUser(body);
    if (errors.length) return send(res, 400, { errors });
    if (emailTaken(body.email, id)) return send(res, 409, { error: 'email already exists' });
    const updated = { id, name: body.name.trim(), email: body.email, role: body.role || 'viewer' };
    users.set(id, updated);
    return send(res, 200, updated);
  }

  return send(res, 404, { error: 'Not found' });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => send(res, 400, { error: err.message }));
  })
  .listen(PORT, () => console.log(`Sample API listening on http://localhost:${PORT}`));
