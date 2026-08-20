// TaskFlow — V1.5 Quick Capture tests.
// Sanitization (untrusted share/URL payload), composeTaskText, captureFromUrl,
// plus production wiring (script tag, manifest share_target, SW cache).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const QC = (await import('../js/quickcapture.js')).default || (await import('../js/quickcapture.js'));

const APP = readFileSync('app.html', 'utf8');
const SW = readFileSync('sw.js', 'utf8');
const MANIFEST = readFileSync('manifest.json', 'utf8');

test('sanitizeText: strips control chars, CR, trims, caps length', () => {
  assert.equal(QC.sanitizeText(null), '');
  assert.equal(QC.sanitizeText(undefined), '');
  assert.equal(QC.sanitizeText(123), '123');
  assert.equal(QC.sanitizeText('  hello  '), 'hello');
  assert.equal(QC.sanitizeText('a\u0000b\u0007c'), 'abc');          // NUL + bell
  assert.equal(QC.sanitizeText('a\r\nb'), 'a\nb');                   // CR stripped, LF kept
  assert.equal(QC.sanitizeText('\u007fDEL'), 'DEL');                 // DEL stripped
  const long = 'x'.repeat(QC.MAX_TEXT_LEN + 500);
  assert.equal(QC.sanitizeText(long).length, QC.MAX_TEXT_LEN);
});

test('sanitizeUrl: only http/https, blocks dangerous schemes and control chars', () => {
  assert.equal(QC.sanitizeUrl(null), '');
  assert.equal(QC.sanitizeUrl(''), '');
  assert.equal(QC.sanitizeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(QC.sanitizeUrl('http://example.com'), 'http://example.com');
  assert.equal(QC.sanitizeUrl('javascript:alert(1)'), '');
  assert.equal(QC.sanitizeUrl('data:text/html,<script>1</script>'), '');
  assert.equal(QC.sanitizeUrl('vbscript:msgbox(1)'), '');
  assert.equal(QC.sanitizeUrl('file:///etc/passwd'), '');
  assert.equal(QC.sanitizeUrl('HTTPS://EXAMPLE.COM'), 'HTTPS://EXAMPLE.COM'); // case-insensitive scheme check
  assert.equal(QC.sanitizeUrl('https://ex.com/\u0000x'), '');        // control char inside
});

test('composeTaskText: text primary, title fallback, url appended separately', () => {
  assert.equal(QC.composeTaskText(null), '');
  assert.equal(QC.composeTaskText({}), '');
  assert.equal(QC.composeTaskText({ text: 'Read article' }), 'Read article');
  assert.equal(QC.composeTaskText({ title: 'Share' }), 'Share');     // text empty → title
  assert.equal(QC.composeTaskText({ text: 'Read', url: 'https://ex.com/a' }), 'Read\nhttps://ex.com/a');
  assert.equal(QC.composeTaskText({ title: 'T', text: 'Body', url: 'javascript:x' }), 'Body'); // bad url dropped
  assert.equal(QC.composeTaskText({ text: 'A\u0000B', url: 'https://e.com' }), 'AB\nhttps://e.com'); // control char stripped
});

test('captureFromUrl: reads title/text/url, null when empty', () => {
  const c = QC.captureFromUrl('https://taskflow.local/app?title=T&text=Body&url=https%3A%2F%2Fe.com%2Fx');
  assert.deepEqual(c, { title: 'T', text: 'Body', url: 'https://e.com/x' });
  assert.equal(QC.captureFromUrl('https://taskflow.local/app?quick=1'), null);
  assert.equal(QC.captureFromUrl('not a url'), null);                // invalid → null
  const onlyUrl = QC.captureFromUrl('https://taskflow.local/app?url=https%3A%2F%2Fe.com');
  assert.deepEqual(onlyUrl, { title: '', text: '', url: 'https://e.com' });
});

test('wiring: script tag + SW precache + manifest share_target + deeplink carries params', () => {
  assert.ok(APP.includes('js/quickcapture.min.js?v=1'), 'app.html loads quickcapture.min.js');
  assert.ok(APP.includes('js/deeplink.min.js?v=7'), 'deeplink bumped to v7');
  assert.ok(SW.includes('taskflow-v250'), 'SW cache bumped');
  assert.ok(SW.includes('./js/quickcapture.min.js'), 'SW precaches quickcapture');
  const st = JSON.parse(MANIFEST).share_target;
  assert.ok(st && st.action === './app' && st.method === 'GET', 'manifest declares GET share_target');
  assert.deepEqual(st.params, { title: 'title', text: 'text', url: 'url' });
  const DEEPLINK = readFileSync('js/deeplink.js', 'utf8');
  assert.ok(DEEPLINK.includes('out.text ='), 'deeplink parses text param');
  assert.ok(DEEPLINK.includes('out.url ='), 'deeplink parses url param');
  const APPJS = readFileSync('js/app.js', 'utf8');
  assert.ok(APPJS.includes('window.__quickAddCapture'), 'app.js stashes capture payload');
  assert.ok(APPJS.includes('TaskFlowQuickCapture.composeTaskText'), 'app.js composes task text via module');
});
