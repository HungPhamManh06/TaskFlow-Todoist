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
const { getBuildSha } = require('./ai-provider');

const app = express();

// ---- CORS giới hạn: chỉ cho phép frontend của TaskFlow + localhost dev ----
// Mở rộng qua env ALLOWED_ORIGINS (comma-separated) nếu deploy frontend ở domain khác.
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([
  'https://hungphammanh06.github.io', // GitHub Pages
  'https://taskflow-todoist.vercel.app', // Vercel
  'http://localhost:3000', 'http://localhost:5000', 'http://localhost:8000',
  'http://127.0.0.1:3000', 'http://127.0.0.1:5000', 'http://127.0.0.1:8000',
  ...EXTRA_ORIGINS,
]);
function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const h = new URL(origin).hostname;
    // Preview deploys của Vercel/GitHub Pages có subdomain ngẫu nhiên — cho phép theo họ
    return h.endsWith('.vercel.app') || h.endsWith('.github.io') ||
      h === 'localhost' || h === '127.0.0.1';
  } catch (e) { return false; }
}
app.use(cors({
  origin: (origin, cb) => cb(null, originAllowed(origin)),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));
app.use(express.json({ limit: '2mb' }));

// ---- Security headers tối thiểu cho API backend ----
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

// Rate limit cho login/signup: chống brute-force, mỗi IP tối đa 10 lần / 15 phút.
// Mount trực tiếp lên từng route (không dùng app.use('/api/auth') vì req.path lúc đó
// là tương đối theo mount — khiến limiter bị skip nhầm).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  // Mặc định 10 lần / 15 phút (bảo mật prod). Test harness có thể nới qua env
  // (AUTH_RATE_LIMIT_MAX) để suite chạy nhiều tài khoản mà không chạm giới hạn.
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too-many-requests' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'taskflow-backend', version: getBuildSha() }));
app.use('/api/auth', auth.router);
app.use('/api/sync', sync);
app.use('/api/calendar', require('./gcal'));
// V2.0 — AI Copilot (optional): proxy LLM, AI chỉ đọc context tối thiểu; mọi ghi
// state vẫn qua client validation + Apply pipeline. Env: AI_API_KEY, AI_API_URL,
// AI_MODEL, AI_TIMEOUT_MS. Thiếu key → /api/ai/plan trả 503 → client fallback
// về planner quy tắc (V1.3) — AI không bao giờ bắt buộc.
app.use('/api/ai', require('./ai').router);

module.exports = { app };

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
