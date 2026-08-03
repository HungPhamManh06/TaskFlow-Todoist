/* TaskFlow-Todoist backend — entry point.
   Render: Web Service, build: npm install, start: npm start.
   Env: DATABASE_URL (Postgres), JWT_SECRET, GOOGLE_CLIENT_ID/SECRET, APP_URL.
   Chạy local không cần DB: `node index.js` tự dùng Postgres ảo (pg-mem). */
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { ensureSchema } = require('./db');
const auth = require('./auth');
const sync = require('./sync');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Rate limit cho login/signup: chống brute-force, mỗi IP tối đa 10 lần / 15 phút.
// Mount trực tiếp lên từng route (không dùng app.use('/api/auth') vì req.path lúc đó
// là tương đối theo mount — khiến limiter bị skip nhầm).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too-many-requests' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'taskflow-backend' }));
app.use('/api/auth', auth.router);
app.use('/api/sync', sync);

const PORT = process.env.PORT || 4000;

if (require.main === module) {
  ensureSchema()
    .then(() => {
      app.listen(PORT, () => console.log('taskflow-backend listening on :' + PORT));
    })
    .catch((e) => {
      console.error('DB init failed:', e.message);
      process.exit(1);
    });
}

module.exports = { app, ensureSchema };
