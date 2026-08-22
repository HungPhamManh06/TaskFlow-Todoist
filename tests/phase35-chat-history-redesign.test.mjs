import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const APP_JS = read('js/app.js');

test('both lazy chat chains load local history before chat', () => {
  for (const name of ['function runLazyChat', 'function preloadLazyChat']) {
    const start = APP_JS.indexOf(name);
    const end = APP_JS.indexOf('\n}', start) + 2;
    const body = APP_JS.slice(start, end);
    const history = body.indexOf("ensureLazyModule('js/chat-history.min.js')");
    const chat = body.indexOf("ensureLazyModule('js/chat.min.js')");
    assert.ok(history >= 0, `${name} must load chat history`);
    assert.ok(chat > history, `${name} must load history before chat`);
  }
});
