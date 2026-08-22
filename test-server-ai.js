'use strict';
/* Test backend AI Planning Copilot (V3.3 — Gemini diagnostics).
   Chạy backend thật (pg-mem). Không gọi LLM thật: stub global fetch để kiểm tra
   proxy pipeline (auth → sanitize → schema validation → referential → upstream
   json_schema + reasoning_effort=low → parse hardening → validate → latency
   → safe upstream-status mapping).
   AI_API_KEY phải set TRƯỚC khi require server/index (ai.js đọc env lúc load).
   AI_TIMEOUT_MS=500 để test timeout nhanh; mặc định production là 60000. */
process.env.AI_API_KEY = 'test-ai-key';
process.env.AI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
process.env.AI_MODEL = 'gemini-3.6-flash';
process.env.AI_TIMEOUT_MS = '500';
process.env.AUTH_RATE_LIMIT_MAX = '1000'; // tránh rate limiter signup khi chạy nhiều suite liên tiếp

const assert = require('assert');
const { app, ensureSchema } = require('./server/index');
const { validateProposal, sanitizeContext, buildPrompt, parseProposalContent } = require('./server/ai');

const realFetch = globalThis.fetch;
const AI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

async function signup(base, username) {
  const r = await fetch(base + '/api/auth/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: 'Pass123456!' }),
  });
  const j = await r.json();
  assert.strictEqual(r.status, 201, 'signup phải thành công');
  assert.ok(j.token, 'phải trả token');
  return j.token;
}

const goodContext = {
  kind: 'plan_day',
  lang: 'vi',
  today: '2026-08-20',
  tasks: [
    { uid: 't1', text: 'Task A', duration: 60, priority: 0, done: false },
    { uid: 't2', text: 'Task B', duration: 30, priority: 0, done: false },
  ],
  projects: [{ id: 'proj1', title: 'P', status: 'active', milestones: 0, progress: 0 }],
  milestones: [],
  timeblocks: [],
  habits: [],
  busy: [],
  overdue: [],
  allowSensitive: false,
};

function plan(token, base, ctx) {
  return fetch(base + '/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ kind: 'plan_day', context: ctx || goodContext }),
  });
}

async function main() {
  await ensureSchema();
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  const base = 'http://127.0.0.1:' + port;

  // ---------- TEST 1: /api/ai/plan cần Bearer token ----------
  {
    const res = await plan('', base);
    assert.strictEqual(res.status, 401, 'thiếu token → 401');
    console.log('TEST 1 OK — /api/ai/plan yêu cầu auth');
  }

  // ---------- TEST 2: kind không hợp lệ → 400 ----------
  {
    const token = await signup(base, 'aiuser1');
    const res = await fetch(base + '/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ kind: 'not-a-kind', context: { ...goodContext, kind: 'not-a-kind' } }),
    });
    assert.strictEqual(res.status, 400, 'kind sai → 400');
    const j = await res.json();
    assert.strictEqual(j.error, 'invalid-kind');
    console.log('TEST 2 OK — kind ngoài allowlist → 400');
  }

  // ---------- TEST 3: sanitizeContext — strip unknown keys, caps, reflection gating ----------
  {
    const { ctx } = sanitizeContext({
      kind: 'plan_day', lang: 'en', today: '2026-08-20',
      evil: 'drop-me',
      tasks: Array.from({ length: 100 }, (_, i) => ({ uid: 'u' + i, text: 'x'.repeat(500), secret: 'leak' })),
      reflections: [{ date: '2026-08-01', text: 'private' }],
      mood: [{ date: '2026-08-01', value: 3 }],
    });
    assert.ok(!('evil' in ctx), 'key ngoài allowlist bị bỏ');
    assert.strictEqual(ctx.tasks.length, 60, 'tasks bị cap 60');
    assert.ok(ctx.tasks.every((t) => !('secret' in t)), 'field ngoài allowlist bị strip');
    assert.ok(ctx.tasks.every((t) => t.text.length <= 160), 'text bị cap 160');
    assert.ok(!('reflections' in ctx), 'reflection bị bỏ khi allowSensitive !== true');
    assert.ok(!('mood' in ctx), 'mood bị bỏ khi allowSensitive !== true');

    const { ctx: s2 } = sanitizeContext({
      kind: 'plan_day', today: '2026-08-20', allowSensitive: true,
      reflections: [{ date: '2026-08-01', text: 'hello', junk: 1 }],
      mood: [{ date: '2026-08-01', value: 4, junk: 1 }],
    });
    assert.strictEqual(s2.reflections.length, 1, 'allowSensitive → reflections giữ');
    assert.ok(!('junk' in s2.reflections[0]), 'reflection strip field lạ');
    assert.strictEqual(s2.mood[0].value, 4, 'mood giữ value');
    console.log('TEST 3 OK — sanitizeContext: allowlist + caps + gating reflection/mood');
  }

  // ---------- TEST 4: validateProposal — schema + referential ----------
  {
    const refs = { taskUids: new Set(['t1', 't2']), projectIds: new Set(['proj1']), milestoneIds: new Set() };
    const ok = validateProposal({
      summary: 'Plan',
      actions: [
        { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 },
        { type: 'next_action', text: 'Do X' },
        { type: 'reschedule_task', taskUid: 't2', option: 'tomorrow' },
      ],
    }, refs);
    assert.strictEqual(ok.ok, true, 'proposal hợp lệ phải pass: ' + JSON.stringify(ok.errors));

    const bad = validateProposal({
      summary: 'x',
      actions: [
        { type: 'schedule_task', taskUid: 'ghost', date: '2026-08-20', start: '09:00', duration: 60 },
        { type: 'schedule_task', taskUid: 't1', date: '2026-13-40', start: '25:00', duration: 9999 },
        { type: 'teleport', taskUid: 't1' },
        { type: 'reschedule_task', taskUid: 't1', option: 'mars' },
        { type: 'next_action', text: '' },
      ],
    }, refs);
    assert.strictEqual(bad.ok, false, 'proposal sai phải fail');
    assert.ok(bad.errors.some((e) => e.includes('unknown-task')), 'task ảo bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('invalid-date')), 'ngày roll-over bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('invalid-start')), 'giờ sai bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('invalid-duration')), 'duration sai bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('unknown-type')), 'action lạ bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('invalid-option')), 'option sai bị bắt');
    assert.ok(bad.errors.some((e) => e.includes('text-invalid')), 'next_action rỗng bị bắt');
    console.log('TEST 4 OK — validateProposal: schema + referential chặt');
  }

  // ---------- TEST 5: buildPrompt — VI/EN + context JSON, không lộ key lạ ----------
  {
    const { ctx } = sanitizeContext(goodContext);
    const p = buildPrompt(ctx);
    assert.ok(p.user.includes('Lập kế hoạch hôm nay'), 'VI label cho plan_day');
    assert.ok(p.user.includes('"tasks"'), 'context JSON có tasks');
    assert.ok(!p.user.includes('evil'), 'prompt không chứa key lạ');
    const { ctx: c2 } = sanitizeContext({ ...goodContext, lang: 'en', kind: 'next_actions' });
    const p2 = buildPrompt(c2);
    assert.ok(p2.user.includes('Suggest next actions'), 'EN label cho next_actions');
    console.log('TEST 5 OK — buildPrompt VI/EN + chỉ context đã sanitize');
  }

  // ---------- TEST 6: upstream OK → trả proposal đã validate; request đúng Gemini ----------
  {
    const token = await signup(base, 'aiuser2');
    let upstreamUrl = null;
    let upstreamOpts = null;
    let upstreamBody = null;
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      upstreamUrl = String(url);
      upstreamOpts = opts;
      upstreamBody = JSON.parse(opts.body);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: 'Hôm nay: 2 việc.',
          actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 }],
        }) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 200, 'upstream OK → 200');
    const j = await res.json();
    assert.strictEqual(j.ok, true);
    assert.strictEqual(j.proposal.actions[0].taskUid, 't1');
    assert.ok(!('meta' in j), 'không có meta khi không debug (không mở rộng API surface)');
    // Request upstream phải đúng Gemini OpenAI-compatible endpoint + Bearer key + model
    assert.strictEqual(upstreamUrl, AI_URL, 'gọi đúng Gemini endpoint');
    assert.strictEqual(upstreamOpts.headers.Authorization, 'Bearer test-ai-key', 'Bearer = AI_API_KEY');
    assert.strictEqual(upstreamBody.model, 'gemini-3.6-flash', 'model = gemini-3.6-flash');
    // Phase 6U: reasoning_effort removed from unified provider gateway
    // (provider handles thinking config internally; not sent by client)
    // Structured output: json_schema (không phải json_object) + schema TaskFlow
    assert.strictEqual(upstreamBody.response_format.type, 'json_schema', 'response_format là json_schema');
    const js = upstreamBody.response_format.json_schema;
    assert.ok(js && js.name === 'taskflow_response', 'json_schema.name = taskflow_response');
    assert.strictEqual(js.strict, true, 'json_schema.strict = true');
    assert.strictEqual(js.schema.type, 'object', 'schema gốc là object');
    assert.strictEqual(js.schema.required.join(','), 'summary,actions', 'schema required summary+actions');
    assert.ok(js.schema.properties.actions.maxItems === 10, 'actions maxItems 10');
    assert.ok(js.schema.properties.actions.items.properties.type.enum.includes('schedule_task'), 'enum đủ action type');
    assert.ok(!('oneOf' in js.schema.properties.actions.items), 'không dùng oneOf (ngoài subset Gemini)');
    // Gemini 3.x deprecated sampling params — KHÔNG được gửi
    assert.ok(!('temperature' in upstreamBody), 'không gửi temperature (deprecated)');
    assert.ok(!('top_p' in upstreamBody) && !('top_k' in upstreamBody), 'không gửi top_p/top_k');
    assert.strictEqual(upstreamBody.max_tokens, 1200, 'max_tokens giữ nguyên');
    assert.strictEqual(upstreamBody.messages.length, 2, 'system + user');
    // Context gửi lên upstream đã sanitize (không chứa field lạ / reflection)
    const sent = upstreamBody.messages[1].content;
    assert.ok(sent.includes('"tasks"'), 'upstream nhận context JSON');
    assert.ok(!sent.includes('secret'), 'upstream không nhận field lạ');
    console.log('TEST 6 OK — Gemini json_schema structured output, không sampling param, proposal hợp lệ');
  }

  // ---------- TEST 6c: latency — mock đáp ứng 100ms và 400ms (< timeout 500ms) → success ----------
  {
    const delayStub = (ms) => async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      await new Promise((r) => setTimeout(r, ms));
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: 'Plan nhanh.',
          actions: [{ type: 'next_action', text: 'X' }],
        }) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const token = await signup(base, 'aiuser2c');
    for (const [label, ms] of [['TEST A: 100ms', 100], ['TEST B: 400ms (< timeout)', 400]]) {
      globalThis.fetch = delayStub(ms);
      const t0 = Date.now();
      const res = await plan(token, base);
      const elapsed = Date.now() - t0;
      globalThis.fetch = realFetch;
      assert.strictEqual(res.status, 200, label + ' → success');
      const j = await res.json();
      assert.strictEqual(j.ok, true, label + ' → proposal hợp lệ');
      assert.ok(elapsed >= ms, label + ' thật sự chờ upstream');
      console.log(label + ' OK — latency=' + elapsed + 'ms (upstream ' + ms + 'ms)');
    }
    // Meta debug: chỉ khi ?debug=1
    globalThis.fetch = delayStub(50);
    const resDbg = await fetch(base + '/api/ai/plan?debug=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ kind: 'plan_day', context: goodContext }),
    });
    globalThis.fetch = realFetch;
    assert.strictEqual(resDbg.status, 200, 'debug=1 vẫn success');
    const jDbg = await resDbg.json();
    assert.ok(jDbg.meta && jDbg.meta.provider === 'gemini', 'meta.provider = gemini');
    assert.strictEqual(jDbg.meta.model, 'gemini-3.6-flash', 'meta.model');
    assert.ok(typeof jDbg.meta.latencyMs === 'number' && jDbg.meta.latencyMs >= 0, 'meta.latencyMs số');
    assert.ok(!('usage' in jDbg.meta), 'meta không lộ token usage');
    console.log('TEST 6c OK — meta chỉ khi ?debug=1: provider/model/latencyMs, không token usage');
  }

  // ---------- TEST 6b: parseProposalContent — whitespace + fence markdown + reject lạ ----------
  {
    const valid = { summary: 'P', actions: [{ type: 'next_action', text: 'X' }] };
    assert.deepStrictEqual(parseProposalContent('  ' + JSON.stringify(valid) + '  '), valid, 'khoảng trắng thừa OK');
    assert.deepStrictEqual(parseProposalContent('```json\n' + JSON.stringify(valid) + '\n```'), valid, 'fence json OK');
    assert.deepStrictEqual(parseProposalContent('```\n' + JSON.stringify(valid) + '\n```'), valid, 'fence trần OK');
    assert.strictEqual(parseProposalContent('{bad json'), null, 'JSON hỏng → null');
    assert.strictEqual(parseProposalContent('```json\n' + JSON.stringify(valid) + '\n```\ntrailing'), null, 'fence + text thừa → null');
    assert.strictEqual(parseProposalContent('   '), null, 'rỗng → null');
    assert.strictEqual(parseProposalContent(null), null, 'non-string → null');
    console.log('TEST 6b OK — parser phòng thủ: whitespace + 1 fence markdown, reject mọi thứ khác');
  }

  // ---------- TEST 7: upstream trả JSON hỏng → 422 ai-invalid-response + details ----------
  {
    const token = await signup(base, 'aiuser3');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{not json' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    // Phase 6U: /plan route maps all non-429 provider errors to 502
    assert.strictEqual(res.status, 502, 'JSON hỏng → 502');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-invalid-response');
    assert.ok(Array.isArray(j.details) && j.details.includes('parse-failed'), 'details nêu parse-failed');
    assert.ok(!JSON.stringify(j).includes('{not'), 'không echo nội dung upstream');
    console.log('TEST 7 OK — output không parse được → 502 ai-invalid-response [parse-failed]');
  }

  // ---------- TEST 8: upstream trả content rỗng → 422 ai-invalid-response + details ----------
  {
    const token = await signup(base, 'aiuser4');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    // Phase 6U: /plan route maps all non-429 provider errors to 502
    assert.strictEqual(res.status, 502, 'content rỗng → 502');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-invalid-response');
    assert.ok(Array.isArray(j.details) && j.details.includes('empty-content'), 'details nêu empty-content');
    console.log('TEST 8 OK — content rỗng → 422 ai-invalid-response [empty-content]');
  }

  // ---------- TEST 8b: upstream trả JSON bọc fence markdown → vẫn chấp nhận ----------
  {
    const token = await signup(base, 'aiuser4b');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify({
          summary: 'Plan có fence.',
          actions: [{ type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 }],
        }) + '\n```' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 200, 'fence markdown → vẫn 200');
    const j = await res.json();
    assert.strictEqual(j.ok, true, 'proposal chấp nhận');
    assert.strictEqual(j.proposal.actions[0].taskUid, 't1');
    console.log('TEST 8b OK — JSON bọc ```json fence được strip và áp dụng');
  }

  // ---------- TEST 9: upstream JSON hợp lệ nhưng sai schema/ref → 422 ai-validation-failed ----------
  {
    const token = await signup(base, 'aiuser5');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: 'Plan sai',
          actions: [
            { type: 'schedule_task', taskUid: 'ghost', date: '2026-08-20', start: '09:00', duration: 60 },
            { type: 'schedule_task', taskUid: 't1', date: '2026-13-40', start: '25:00', duration: 9999 },
          ],
        }) } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 422, 'proposal vi phạm schema/ref → 422');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-validation-failed', 'mã lỗi ai-validation-failed');
    assert.ok(Array.isArray(j.details) && j.details.length > 0, 'details chứa lý do');
    assert.ok(j.details.some((e) => e.includes('unknown-task')), 'details nêu task ảo');
    assert.ok(j.details.some((e) => e.includes('invalid-date')), 'details nêu ngày sai');
    console.log('TEST 9 OK — schema/ref sai → 422 ai-validation-failed + details');
  }

  // ---------- TEST 10: upstream 429 → 429 ai-rate-limited ----------
  {
    const token = await signup(base, 'aiuser6');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 429, 'upstream 429 → 429');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-rate-limited');
    assert.ok(Array.isArray(j.details) && j.details.includes('upstream-429'), 'details = upstream-429');
    assert.ok(!JSON.stringify(j).includes('rate limited'), 'không lộ body upstream');
    console.log('TEST 10 OK — upstream 429 → 429 ai-rate-limited [upstream-429]');
  }

  // ---------- TEST 10b: map HTTP 400/401/403/404 → mã chẩn đoán an toàn ----------
  {
    const token = await signup(base, 'aiuser6b');
    const cases = [
      [400, 'ai-provider-bad-request'],
      [401, 'ai-provider-auth'],
      [403, 'ai-provider-forbidden'],
      [404, 'ai-provider-not-found'],
    ];
    for (const [status, code] of cases) {
      globalThis.fetch = async (url, opts) => {
        if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
        return new Response(JSON.stringify({ error: { message: 'secret provider detail ' + status } }), { status });
      };
      const res = await plan(token, base);
      globalThis.fetch = realFetch;
      assert.strictEqual(res.status, 502, 'upstream ' + status + ' → 502');
      const j = await res.json();
      assert.strictEqual(j.error, code, 'upstream ' + status + ' → ' + code);
      assert.ok(Array.isArray(j.details) && j.details.includes('upstream-' + status), 'details = upstream-' + status);
      assert.ok(!JSON.stringify(j).includes('secret provider detail'), 'KHÔNG lộ body upstream');
      assert.ok(!JSON.stringify(j).includes('Bearer') && !JSON.stringify(j).includes('AI_API'), 'KHÔNG lộ key/auth');
      console.log('TEST 10b OK — upstream ' + status + ' → ' + code + ' [upstream-' + status + '], không lộ body');
    }
  }

  // ---------- TEST 11: upstream 500 → 502 ai-provider-unavailable ----------
  {
    const token = await signup(base, 'aiuser7');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Response(JSON.stringify({ error: 'boom' }), { status: 500 });
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 502, 'upstream 500 → 502');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-provider-unavailable');
    assert.ok(Array.isArray(j.details) && j.details.includes('upstream-500'), 'details = upstream-500');
    assert.ok(!JSON.stringify(j).includes('boom'), 'không lộ lỗi upstream thô');
    console.log('TEST 11 OK — upstream 500 → 502 ai-provider-unavailable [upstream-500], không lộ chi tiết');
  }

  // ---------- TEST 12: upstream network fail → 502 ai-provider-unavailable ----------
  {
    const token = await signup(base, 'aiuser8');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      throw new Error('boom');
    };
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    assert.strictEqual(res.status, 502, 'network fail → 502');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-provider-unavailable');
    console.log('TEST 12 OK — upstream network fail → 502 ai-provider-unavailable');
  }

  // ---------- TEST 13: upstream treo quá AI_TIMEOUT_MS → 504 ai-timeout ----------
  {
    const token = await signup(base, 'aiuser9');
    globalThis.fetch = async (url, opts) => {
      if (!String(url).includes('/chat/completions')) return realFetch(url, opts);
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    };
    const t0 = Date.now();
    const res = await plan(token, base);
    globalThis.fetch = realFetch;
    // Phase 6U: /plan route maps all non-429 provider errors to 502
    assert.strictEqual(res.status, 502, 'quá hạn timeout → 502');
    // Phase 6U: MIN_TIMEOUT_MS = 5000, so 500 gets clamped to 5000
    assert.ok(Date.now() - t0 < 12000, 'timeout phải nhanh (MIN_TIMEOUT_MS=5000)');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-timeout');
    console.log('TEST 13 OK (TEST C) — upstream vượt timeout → 502 ai-timeout (AbortController)');
  }

  console.log('\nALL SERVER AI TESTS PASS');
  server.close();

  // ---------- TEST 14: AI_API_KEY rỗng → 503 ai-not-configured ----------
  // Require lại ai.js trong cùng process với env đã xoá (ai.js đọc key lúc load).
  {
    const savedKey = process.env.AI_API_KEY;
    process.env.AI_API_KEY = '';
    delete require.cache[require.resolve('./server/ai')];
    const express = require('./server/node_modules/express');
    const app2 = express();
    app2.use(express.json());
    app2.use('/api/ai', require('./server/ai').router);
    process.env.AI_API_KEY = savedKey;
    const s2 = await new Promise((resolve) => {
      const srv = app2.listen(0, () => resolve(srv));
    });
    const base2 = 'http://127.0.0.1:' + s2.address().port;
    // Mint token trực tiếp bằng dev secret (auth.router không nằm trong app2).
    const jwt = require('./server/node_modules/jsonwebtoken');
    const token = jwt.sign({ uid: 999, uname: 'aiuser10' }, 'dev-only-secret-pgmem-local');
    const res = await fetch(base2 + '/api/ai/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ kind: 'plan_day', context: goodContext }),
    });
    assert.strictEqual(res.status, 503, 'thiếu AI_API_KEY → 503');
    const j = await res.json();
    assert.strictEqual(j.error, 'ai-not-configured');
    s2.close();
    console.log('TEST 14 OK — thiếu AI_API_KEY → 503 ai-not-configured (fallback planner quy tắc)');
  }

  console.log('\nALL SERVER AI TESTS PASS (incl. not-configured)');
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});