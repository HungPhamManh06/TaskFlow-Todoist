/* Auth: username/password (JWT) + Google OAuth2 qua backend. */
'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { initDb } = require('./db');

// Bảo mật: tuyệt đối không fallback về secret hardcode trên production.
// Production (có DATABASE_URL — Render Postgres — hoặc NODE_ENV=production)
// phải có JWT_SECRET; thiếu → server từ chối khởi động rõ ràng.
// Local dev (pg-mem, không DATABASE_URL) dùng secret dev-only kèm cảnh báo.
const JWT_SECRET_ENV = process.env.JWT_SECRET;
const IS_PROD = !!(process.env.DATABASE_URL) || process.env.NODE_ENV === 'production';
if (!JWT_SECRET_ENV && IS_PROD) {
  throw new Error('FATAL: JWT_SECRET env is required in production (DATABASE_URL or NODE_ENV=production detected). Refusing to start with a fallback secret — set JWT_SECRET and redeploy.');
}
const JWT_SECRET = JWT_SECRET_ENV || 'dev-only-secret-pgmem-local';
if (!JWT_SECRET_ENV) {
  console.warn('[auth] WARN: no JWT_SECRET env — using a dev-only secret (pg-mem local). Tokens are forgeable; never run like this with DATABASE_URL.');
}
const TOKEN_TTL = '30d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || ''; // frontend (vd https://todoist.vercel.app)

// state → { created, origin } để chống CSRF trong flow OAuth
const googleStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

const router = express.Router();

function usernameValid(u) {
  return /^[A-Za-z0-9_.-]{3,30}$/.test(u);
}

function normalize(u) {
  return String(u || '').trim().toLowerCase();
}

function signToken(user) {
  return jwt.sign({ uid: user.id, uname: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'no-token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.uid, username: payload.uname };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid-token' });
  }
}

async function getUserByUsername(username) {
  const p = initDb();
  const r = await p.query('select * from users where username_lower = $1', [username]);
  return r.rows[0] || null;
}

async function getUserByGoogleId(googleId) {
  const p = initDb();
  const r = await p.query('select * from users where google_id = $1', [googleId]);
  return r.rows[0] || null;
}

// ---- POST /api/auth/signup { username, password } → 201 {token} (tự đăng nhập) ----
router.post('/signup', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!usernameValid(username)) return res.status(400).json({ error: 'invalid-username' });
    if (password.length < 6) return res.status(400).json({ error: 'weak-password' });
    const lower = normalize(username);
    if (await getUserByUsername(lower)) return res.status(409).json({ error: 'username-taken' });
    const p = initDb();
    const hash = await bcrypt.hash(password, 10);
    const r = await p.query(
      'insert into users (username, username_lower, password_hash) values ($1,$2,$3) returning *',
      [username, lower, hash]
    );
    return res.status(201).json({ token: signToken(r.rows[0]), user: { id: r.rows[0].id, username } });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- POST /api/auth/login { username, password } → {token} ----
router.post('/login', async (req, res) => {
  try {
    const username = normalize(req.body.username);
    const password = String(req.body.password || '');
    const user = await getUserByUsername(username);
    if (!user || !user.password_hash) return res.status(401).json({ error: 'bad-credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'bad-credentials' });
    return res.json({ token: signToken(user), user: { id: user.id, username: user.username } });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- GET /api/auth/me (Bearer) → {id, username} ----
router.get('/me', authMiddleware, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

// ---- POST /api/auth/change-password (Bearer) { currentPassword, newPassword } ----
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    if (newPassword.length < 6) return res.status(400).json({ error: 'weak-password' });
    const p = initDb();
    const r = await p.query('select password_hash from users where id = $1', [req.user.id]);
    const user = r.rows[0];
    if (!user || !user.password_hash) return res.status(400).json({ error: 'no-password' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'bad-credentials' });
    const hash = await bcrypt.hash(newPassword, 10);
    await p.query('update users set password_hash = $1 where id = $2', [hash, req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- POST /api/auth/delete-account (Bearer) → xoá user (cascade xoá luôn planner_state) ----
router.post('/delete-account', authMiddleware, async (req, res) => {
  try {
    const p = initDb();
    await p.query('delete from users where id = $1', [req.user.id]);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- GET /api/auth/google → 302 sang Google ----
router.get('/google', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'google-not-configured' });
  const state = crypto.randomBytes(16).toString('hex');
  googleStates.set(state, Date.now());
  const redirectUri = req.protocol + '://' + req.get('host') + '/api/auth/google/callback';
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// ---- GET /api/auth/google/callback?code=...&state=... → 302 về APP_URL?token=... ----
router.get('/google/callback', async (req, res) => {
  const fallback = APP_URL || '/';
  try {
    const { code, state } = req.query;
    if (!state || !googleStates.has(state)) {
      return res.redirect(fallback + (fallback.includes('?') ? '&' : '?') + 'error=bad-state');
    }
    googleStates.delete(state);
    if (!code) {
      return res.redirect(fallback + (fallback.includes('?') ? '&' : '?') + 'error=no-code');
    }
    const redirectUri = req.protocol + '://' + req.get('host') + '/api/auth/google/callback';
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokJson = await tok.json();
    if (!tok.ok || !tokJson.access_token) {
      return res.redirect(fallback + (fallback.includes('?') ? '&' : '?') + 'error=token-exchange');
    }
    const prof = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + tokJson.access_token },
    });
    const info = await prof.json();
    if (!info.sub) {
      return res.redirect(fallback + (fallback.includes('?') ? '&' : '?') + 'error=profile');
    }
    let user = await getUserByGoogleId(info.sub);
    if (!user) {
      // Tạo username từ email; nếu trùng thì thêm số ngẫu nhiên
      let base = (info.email || 'user').split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 24) || 'user';
      let username = base;
      const p = initDb();
      for (let i = 0; i < 20; i++) {
        const r = await p.query('select 1 from users where username_lower = $1', [normalize(username)]);
        if (!r.rows.length) break;
        username = base + '.' + Math.floor(100 + Math.random() * 900);
      }
      const r = await p.query(
        `insert into users (username, username_lower, google_id, display_name)
         values ($1,$2,$3,$4) returning *`,
        [username, normalize(username), info.sub, info.name || username]
      );
      user = r.rows[0];
    }
    const url = fallback + (fallback.includes('?') ? '&' : '?') + 'token=' + signToken(user);
    res.redirect(url);
  } catch (e) {
    res.redirect(fallback + (fallback.includes('?') ? '&' : '?') + 'error=server');
  }
});

// Dọn state cũ
setInterval(() => {
  const now = Date.now();
  googleStates.forEach((t, k) => { if (now - t > STATE_TTL_MS) googleStates.delete(k); });
}, 5 * 60 * 1000).unref();

module.exports = { router, authMiddleware };
