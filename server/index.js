/* TaskFlow-Todoist backend — entry point.
   Render: Web Service, build: npm install, start: npm start.
   Env: DATABASE_URL (Postgres), JWT_SECRET, GOOGLE_CLIENT_ID/SECRET, APP_URL.
   Chạy local không cần DB: `node index.js` tự dùng Postgres ảo (pg-mem). */
'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ensureSchema } = require('./db');
const auth = require('./auth');
const sync = require('./sync');

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

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
