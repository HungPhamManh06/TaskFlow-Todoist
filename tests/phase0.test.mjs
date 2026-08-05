import test from 'node:test';
import assert from 'node:assert/strict';
import DeepLink from '../js/deeplink.js';

test('parse: không tham số', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html'), { view: null, year: null, month: null, week: null });
});

test('parse: view hợp lệ', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=year').view, 'year');
  assert.equal(DeepLink.parse('https://x.app/app.html?view=overview').view, 'overview');
  assert.equal(DeepLink.parse('https://x.app/app.html?view=week').view, 'week');
});

test('parse: view không hợp lệ → null', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=settings').view, null);
});

test('parse: view calendar hợp lệ (Phase 2.3)', () => {
  assert.equal(DeepLink.parse('https://x.app/app.html?view=calendar').view, 'calendar');
});

test('parse: m=YYYY-M hợp lệ', () => {
  const r = DeepLink.parse('https://x.app/app.html?m=2027-3');
  assert.equal(r.year, 2027);
  assert.equal(r.month, 2); // 0-based
});

test('parse: m ngoài phạm vi → null', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=2026-0'), { view: null, year: null, month: null, week: null });
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=2026-13'), { view: null, year: null, month: null, week: null });
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?m=1800-5'), { view: null, year: null, month: null, week: null });
});

test('parse: kết hợp view + m', () => {
  const r = DeepLink.parse('https://x.app/app.html?view=year&m=2026-12');
  assert.equal(r.view, 'year');
  assert.equal(r.year, 2026);
  assert.equal(r.month, 11);
});

test('parse: token OAuth bị bỏ qua', () => {
  assert.deepEqual(DeepLink.parse('https://x.app/app.html?token=abc123'), { view: null, year: null, month: null, week: null });
});

test('parse: chuỗi rỗng/null', () => {
  assert.deepEqual(DeepLink.parse(''), { view: null, year: null, month: null, week: null });
  assert.deepEqual(DeepLink.parse(null), { view: null, year: null, month: null, week: null });
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

test('sw.js: cache version bump lên >= v20', () => {
  const m = /const CACHE = 'taskflow-v(\d+)';/.exec(SW);
  assert.ok(m, 'không tìm thấy cache version');
  assert.ok(Number(m[1]) >= 20, `cache version ${m[1]} < 20`);
});

test('sw.js: APP_SHELL đủ js bắt buộc', () => {
  for (const f of ['./js/app.js', './js/sync.js', './js/api-config.js', './js/deeplink.js', './js/ui.js']) {
    assert.ok(SW.includes(f), `thiếu ${f} trong APP_SHELL`);
  }
});

test('app.html: không có tên file SW cũ', () => {
  const HTML = readFileSync(path.join(ROOT, 'app.html'), 'utf8');
  assert.ok(!/js\/app\.js\?v=29/.test(HTML), 'app.html vẫn trỏ js/app.js?v=29');
});

test('không còn copy Supabase trong app.js', () => {
  const APP = readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
  assert.ok(!/Supabase/.test(APP), 'app.js vẫn chứa "Supabase"');
});
