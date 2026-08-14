/* ============================================================
   TaskFlow-Todoist — Google Calendar READ-ONLY (V1.6A)
   ------------------------------------------------------------
   Kết nối tùy chọn: user bấm "Kết nối Google Calendar" → OAuth
   với scope tối thiểu calendar.readonly (KHÔNG có write). Access
   token lưu trên server (không bao giờ xuống client); client chỉ
   thấy {connected, write:false, calendars} qua /api/calendar/status.

   Không đụng sync global (planner-* LWW) — calendar chỉ đọc.
   ============================================================ */
'use strict';
const crypto = require('crypto');
const express = require('express');
const { initDb } = require('./db');
const { authMiddleware, verifyToken } = require('./auth');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || '';

const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const OAUTH_SCOPES = ['openid', 'email', 'profile', READ_SCOPE].join(' ');

const router = express.Router();

// state → { userId, created } — CSRF cho flow kết nối calendar
const calStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;
const CAL_LIST_TTL_MS = 60 * 60 * 1000; // cache calendarList 1h/user trong bộ nhớ
const calListCache = new Map(); // userId -> { fetchedAt, calendars }

function encodeCalendarId(id) {
  return encodeURIComponent(String(id || 'primary'));
}

function asIso(d) {
  return d ? new Date(d).toISOString() : null;
}

async function clearGoogleTokens(userId) {
  const p = initDb();
  await p.query(
    `update users set google_access_token = null, google_refresh_token = null,
       google_token_expires_at = null, google_scopes = null, google_connected_at = null
     where id = $1`,
    [userId]
  );
}

async function getGoogleRow(userId) {
  const p = initDb();
  const r = await p.query(
    `select google_access_token, google_refresh_token, google_token_expires_at, google_scopes, google_connected_at
     from users where id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

// Gọi Google API với access token; tự refresh nếu sắp hết hạn hoặc nhận 401,
// rồi thử lại MỘT lần. fn(accessToken) → { ok, status, data } (đã json()).
async function withFreshGoogleToken(userId, fn) {
  const row = await getGoogleRow(userId);
  if (!row || !row.google_access_token) return { ok: false, status: 410, data: { error: 'google-disconnected' } };

  let token = row.google_access_token;
  const expiresAt = row.google_token_expires_at ? new Date(row.google_token_expires_at).getTime() : 0;
  let refreshed = false;

  const run = async (tok) => {
    const res = await fn(tok);
    return res;
  };

  if (expiresAt && Date.now() > expiresAt - 60 * 1000) {
    const ref = await refreshAccessToken(userId, row.google_refresh_token);
    if (ref.ok) {
      token = ref.token;
      refreshed = true;
    } else {
      if (ref.disconnected) await clearGoogleTokens(userId);
      return { ok: false, status: 401, data: { error: 'google-disconnected' } };
    }
  }

  let res = await run(token);
  if (res.status === 401 && !refreshed) {
    const ref = await refreshAccessToken(userId, row.google_refresh_token);
    if (ref.ok) {
      token = ref.token;
      res = await run(token);
    } else {
      if (ref.disconnected) await clearGoogleTokens(userId);
      return { ok: false, status: 401, data: { error: 'google-disconnected' } };
    }
  }
  return res;
}

async function refreshAccessToken(userId, refreshToken) {
  if (!refreshToken || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return { ok: false, disconnected: false };
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) {
      return { ok: false, disconnected: r.status === 400 && (j.error === 'invalid_grant' || j.error === 'invalid_client') };
    }
    // Lưu token mới lên user (refresh token mới nếu Google cấp lại)
    const p = initDb();
    await p.query(
      `update users set google_access_token = $2,
         google_token_expires_at = now() + ($3 * interval '1 second'),
         google_refresh_token = coalesce($4, google_refresh_token)
       where id = $1`,
      [userId, j.access_token, j.expires_in || 3600, j.refresh_token || null]
    );
    return { ok: true, token: j.access_token, expiresIn: j.expires_in };
  } catch (e) {
    return { ok: false, disconnected: false };
  }
}

// ---- GET /api/calendar/connect?token=<jwt> → 302 Google OAuth (readonly) ----
router.get('/connect', (req, res) => {
  if (!GOOGLE_CLIENT_ID) return res.status(503).json({ error: 'google-not-configured' });
  const payload = verifyToken(String(req.query.token || ''));
  if (!payload || !payload.uid) return res.status(401).json({ error: 'invalid-token' });
  const state = crypto.randomBytes(16).toString('hex');
  calStates.set(state, { userId: payload.uid, created: Date.now() });
  const redirectUri = req.protocol + '://' + req.get('host') + '/api/calendar/callback';
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// ---- GET /api/calendar/callback?code&state → lưu token → redirect APP_URL?cal=ok ----
router.get('/callback', async (req, res) => {
  const fallback = APP_URL || '/';
  const withParam = (key) => fallback + (fallback.includes('?') ? '&' : '?') + key;
  try {
    const { code, state } = req.query;
    const st = state ? calStates.get(state) : null;
    if (!st) return res.redirect(withParam('cal=error=bad-state'));
    calStates.delete(state);
    if (!code) return res.redirect(withParam('cal=error=no-code'));
    const redirectUri = req.protocol + '://' + req.get('host') + '/api/calendar/callback';
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
    const j = await tok.json();
    if (!tok.ok || !j.access_token) return res.redirect(withParam('cal=error=token-exchange'));
    const p = initDb();
    await p.query(
      `update users set google_access_token = $2, google_refresh_token = $3,
         google_token_expires_at = now() + ($4 * interval '1 second'),
         google_scopes = $5, google_connected_at = now()
       where id = $1`,
      [st.userId, j.access_token, j.refresh_token || null, j.expires_in || 3600, OAUTH_SCOPES]
    );
    return res.redirect(withParam('cal=ok'));
  } catch (e) {
    return res.redirect(withParam('cal=error=server'));
  }
});

// ---- GET /api/calendar/status (Bearer) → { connected, write, calendars, fetchedAt } ----
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const row = await getGoogleRow(req.user.id);
    if (!row || !row.google_access_token) return res.json({ connected: false, write: false, calendars: [], fetchedAt: null });
    const cached = calListCache.get(req.user.id);
    if (cached && Date.now() - cached.fetchedAt < CAL_LIST_TTL_MS) {
      return res.json({ connected: true, write: false, calendars: cached.calendars, fetchedAt: asIso(cached.fetchedAt) });
    }
    const r = await withFreshGoogleToken(req.user.id, async (tok) => {
      const f = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50', {
        headers: { Authorization: 'Bearer ' + tok },
      });
      return { ok: f.ok, status: f.status, data: await f.json().catch(() => null) };
    });
    if (r.status === 410 || r.status === 401) return res.json({ connected: false, write: false, calendars: [], fetchedAt: null });
    const items = (r.data && Array.isArray(r.data.items)) ? r.data.items : [];
    const calendars = items
      .filter((c) => !c.deleted)
      .map((c) => ({ id: c.id, summary: c.summary || c.id, primary: !!c.primary }));
    calListCache.set(req.user.id, { fetchedAt: Date.now(), calendars });
    return res.json({ connected: true, write: false, calendars, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- GET /api/calendar/events?timeMin&timeMax (Bearer) → { events, errors } ----
// timeMin/timeMax: ISO string (RFC3339) — server giữ nguyên, client xử lý timezone.
router.get('/events', authMiddleware, async (req, res) => {
  try {
    const timeMin = String(req.query.timeMin || '');
    const timeMax = String(req.query.timeMax || '');
    if (!timeMin || !timeMax || isNaN(new Date(timeMin).getTime()) || isNaN(new Date(timeMax).getTime())) {
      return res.status(400).json({ error: 'invalid-range' });
    }
    const row = await getGoogleRow(req.user.id);
    if (!row || !row.google_access_token) return res.status(410).json({ error: 'google-disconnected' });
    let calendars = [];
    const cached = calListCache.get(req.user.id);
    if (cached && Date.now() - cached.fetchedAt < CAL_LIST_TTL_MS) {
      calendars = cached.calendars;
    } else {
      const r = await withFreshGoogleToken(req.user.id, async (tok) => {
        const f = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50', {
          headers: { Authorization: 'Bearer ' + tok },
        });
        return { ok: f.ok, status: f.status, data: await f.json().catch(() => null) };
      });
      if (r.status === 410 || r.status === 401) return res.status(410).json({ error: 'google-disconnected' });
      calendars = ((r.data && r.data.items) || []).filter((c) => !c.deleted).map((c) => ({ id: c.id, summary: c.summary || c.id, primary: !!c.primary }));
      calListCache.set(req.user.id, { fetchedAt: Date.now(), calendars });
    }

    const qs = `timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&maxResults=250`;
    const results = await Promise.all(calendars.map(async (cal) => {
      const r = await withFreshGoogleToken(req.user.id, async (tok) => {
        const f = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeCalendarId(cal.id)}/events?${qs}`, {
          headers: { Authorization: 'Bearer ' + tok },
        });
        return { ok: f.ok, status: f.status, data: await f.json().catch(() => null) };
      });
      return { cal, r };
    }));

    const events = [];
    const errors = [];
    results.forEach(({ cal, r }) => {
      if (r.status === 410 || r.status === 401) return;
      if (!r.ok || !r.data || !Array.isArray(r.data.items)) {
        errors.push({ calendarId: cal.id, error: 'fetch-failed' });
        return;
      }
      r.data.items.forEach((it) => events.push({ ...it, _calendarId: cal.id }));
    });
    return res.json({ events, errors, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// ---- POST /api/calendar/disconnect (Bearer) → xoá token + revoke best-effort ----
router.post('/disconnect', authMiddleware, async (req, res) => {
  try {
    const row = await getGoogleRow(req.user.id);
    if (row && row.google_access_token) {
      try {
        await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(row.google_access_token), { method: 'POST' });
      } catch (e) { /* best-effort */ }
    }
    await clearGoogleTokens(req.user.id);
    calListCache.delete(req.user.id);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'server-error' });
  }
});

// Dọn state cũ
setInterval(() => {
  const now = Date.now();
  calStates.forEach((v, k) => { if (now - v.created > STATE_TTL_MS) calStates.delete(k); });
}, 5 * 60 * 1000).unref();

module.exports = router;
