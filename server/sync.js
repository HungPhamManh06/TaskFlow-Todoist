/* Sync API: đọc/ghi planner_state của riêng từng user (Bearer JWT). */
'use strict';
const express = require('express');
const { initDb } = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

// ---- GET /api/sync → [{key, data, updated_at}] (toàn bộ dữ liệu user) ----
router.get('/', async (req, res) => {
  try {
    const p = initDb();
    const r = await p.query(
      'select key, data, updated_at from planner_state where user_id = $1',
      [req.user.id]
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// ---- POST /api/sync {key, data} → upsert 1 key ----
router.post('/', async (req, res) => {
  try {
    const key = String(req.body.key || '').trim();
    if (!key) return res.status(400).json({ error: 'no-key' });
    const data = req.body.data === undefined ? {} : req.body.data;
    const p = initDb();
    const r = await p.query(
      `insert into planner_state (user_id, key, data)
       values ($1, $2, $3::jsonb)
       on conflict (user_id, key)
       do update set data = excluded.data, updated_at = now()
       returning updated_at`,
      [req.user.id, key, JSON.stringify(data)]
    );
    res.json({ updated_at: r.rows[0].updated_at });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

// ---- POST /api/sync/clear → xoá toàn bộ dữ liệu user ----
router.post('/clear', async (req, res) => {
  try {
    const p = initDb();
    await p.query('delete from planner_state where user_id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'server-error' });
  }
});

module.exports = router;
