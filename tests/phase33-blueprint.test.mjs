// TaskFlow — V2 final hardening: render.yaml Blueprint safety test.
// Verifies the Render Blueprint represents the REAL production environment
// (Vercel frontend + Render backend) without committing any secret values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RENDER = readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');

const PROD_APP_URL = 'https://taskflow-todoist.vercel.app/app';
const PROD_CALLBACK = 'https://todoist-m3c7.onrender.com/api/calendar/callback';

test('render.yaml: APP_URL points to the real Vercel app', () => {
  assert.ok(RENDER.includes(`value: ${PROD_APP_URL}`),
    'render.yaml phải khai báo APP_URL = https://taskflow-todoist.vercel.app/app');
});

test('render.yaml: old GitHub Pages production APP_URL is absent', () => {
  assert.ok(!RENDER.includes('hungphammanh06.github.io'),
    'render.yaml không được còn URL GitHub Pages cũ');
});

test('render.yaml: GOOGLE_REDIRECT_URI matches the production Render callback', () => {
  assert.ok(RENDER.includes(`value: ${PROD_CALLBACK}`),
    'render.yaml phải khai báo GOOGLE_REDIRECT_URI = https://todoist-m3c7.onrender.com/api/calendar/callback');
});

test('render.yaml: Google OAuth secrets are declared but never committed', () => {
  // sync: false = giá trị nhập tay trên Render — không có value trong repo.
  assert.ok(RENDER.includes('- key: GOOGLE_CLIENT_ID\n        sync: false'),
    'GOOGLE_CLIENT_ID phải được khai báo dạng sync: false');
  assert.ok(RENDER.includes('- key: GOOGLE_CLIENT_SECRET\n        sync: false'),
    'GOOGLE_CLIENT_SECRET phải được khai báo dạng sync: false');
  const secretKeys = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
  for (const key of secretKeys) {
    assert.ok(!new RegExp(`${key}\\s*[:=]\\s*[A-Za-z0-9._-]{8,}`).test(RENDER),
      `không được có giá trị ${key} trong render.yaml`);
  }
});

test('render.yaml: JWT_SECRET is generated, not committed', () => {
  assert.ok(RENDER.includes('- key: JWT_SECRET\n        generateValue: true'),
    'JWT_SECRET phải dùng generateValue: true (Render tự sinh)');
  assert.ok(!/JWT_SECRET\s*[:=]\s*["']?[A-Za-z0-9]{16,}/.test(RENDER),
    'không được có JWT_SECRET giá trị thật trong render.yaml');
});

test('render.yaml: DATABASE_URL comes from the Blueprint database, no credentials', () => {
  assert.ok(RENDER.includes('- key: DATABASE_URL\n        fromDatabase:'),
    'DATABASE_URL phải lấy từ fromDatabase của Blueprint');
  assert.ok(!/postgres(ql)?:\/\/[^#\s]+/.test(RENDER),
    'không được có connection string postgres trong render.yaml');
});

test('render.yaml: AI runtime variables are declared with the backend defaults', () => {
  assert.ok(RENDER.includes('- key: AI_API_KEY\n        sync: false'),
    'AI_API_KEY phải được khai báo dạng sync: false (secret)');
  assert.ok(RENDER.includes('- key: AI_API_URL\n        value: https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'),
    'AI_API_URL phải khớp default của server/ai.js (Gemini OpenAI-compatible)');
  assert.ok(RENDER.includes('- key: AI_MODEL\n        value: gemini-3.6-flash'),
    'AI_MODEL phải khớp default của server/ai.js (gemini-3.6-flash)');
  assert.ok(RENDER.includes('- key: AI_TIMEOUT_MS\n        value: "60000"'),
    'AI_TIMEOUT_MS phải khớp default của server/ai.js (60000)');
});

test('render.yaml: no committed secret values at all', () => {
  // Scan chung: không secret rõ ràng lọt vào Blueprint.
  const leakPatterns = [
    /AIza[0-9A-Za-z_-]{20,}/,          // Google API key
    /AKIA[0-9A-Z]{16}/,                // AWS access key
    /sk-[A-Za-z0-9]{20,}/,             // OpenAI-style key
    /AI_API_KEY\s*[:=]\s*["']?[^\s"'#]{12,}/,
    /GOOGLE_CLIENT_SECRET\s*[:=]\s*["']?[^\s"'#]{8,}/,
    /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  ];
  for (const re of leakPatterns) {
    assert.ok(!re.test(RENDER), `render.yaml có dấu hiệu secret: ${re}`);
  }
});
