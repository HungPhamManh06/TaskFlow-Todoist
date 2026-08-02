'use strict';
/* Test logic đồng bộ js/sync.js bằng Node — mock localStorage + supabase client */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mockLocalStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
    _store: store
  };
}

function makeFakeSupabase(serverData) {
  const upserts = [];
  const client = {
    auth: {
      async getSession() { return { data: { session: null }, error: null }; },
      async signInAnonymously() { return { data: { session: { user: { id: 'anon-1' } } }, error: null }; },
      async signOut() { return { error: null }; }
    },
    from() {
      return {
        async select() {
          const rows = Array.from(serverData.entries()).map(([key, v]) => ({ key, data: v.data, updated_at: v.updated_at }));
          return { data: rows, error: null };
        },
        upsert(row) {
          upserts.push(row);
          return {
            select: async () => {
              const updated_at = new Date(Date.now() + upserts.length * 1000).toISOString();
              serverData.set(row.key, { data: row.data, updated_at });
              return { data: [{ updated_at }], error: null };
            }
          };
        },
        delete() {
          return { eq: async () => { serverData.clear(); return { data: [], error: null }; } };
        }
      };
    },
    _upserts: upserts
  };
  return client;
}

function loadSync() {
  const code = fs.readFileSync('js/sync.js', 'utf8');
  vm.runInThisContext(code, { filename: 'sync.js' });
  return global.window.Sync;
}

async function main() {
  // ---- TEST 1: chưa cấu hình → status 'off', push no-op ----
  {
    global.localStorage = mockLocalStorage({ 'planner-2026-1': '{"monthlyGoals":[]}' });
    global.window = { supabase: { createClient: () => { throw new Error('should not create client'); } } };
    global.SUPABASE_CONFIG = { url: '', anonKey: '' };
    const Sync = loadSync();
    await Sync.init();
    assert.strictEqual(Sync.getStatus(), 'off');
    Sync.push('planner-2026-1'); // không throw
    await sleep(30);
    console.log('TEST 1 OK — no config → status off, push no-op');
  }

  // ---- TEST 2: có config → pull remote mới hơn + migrate key local chưa có trên cloud ----
  {
    const server = new Map([
      ['planner-2026-1', { data: { monthlyGoals: [{ id: 'g0', done: true }] }, updated_at: new Date(Date.now() + 200000).toISOString() }]
    ]);
    global.localStorage = mockLocalStorage({
      'planner-2026-1': '{"monthlyGoals":[],"old":true}', // local cũ hơn remote
      'planner-2026-2': '{"monthlyGoals":[{"id":"h","done":false}]}', // chỉ có local → migrate
      'planner-sync-meta': '{"x":1}' // key meta phải bị loại trừ
    });
    const client = makeFakeSupabase(server);
    global.window = { supabase: { createClient: () => client } };
    global.SUPABASE_CONFIG = { url: 'https://x.supabase.co', anonKey: 'k', pushDebounceMs: 5 };
    const Sync = loadSync();
    await Sync.init();
    assert.strictEqual(Sync.getStatus(), 'ready');
    // remote mới hơn được ghi vào localStorage
    const local1 = JSON.parse(global.localStorage.getItem('planner-2026-1'));
    assert.strictEqual(local1.monthlyGoals[0].done, true, 'remote pull phải ghi đè local cũ');
    await sleep(60); // chờ debounce flush migration
    const pushedKeys = client._upserts.map((r) => r.key);
    assert.ok(pushedKeys.includes('planner-2026-2'), 'migrate phải đẩy key chỉ có local');
    assert.ok(!pushedKeys.includes('planner-sync-meta'), 'không được đẩy key meta');
    assert.ok(!pushedKeys.includes('planner-2026-1'), 'key vừa pull từ remote không được đẩy lại');
    console.log('TEST 2 OK — pull + migrate + loại trừ meta');
  }

  // ---- TEST 3: push sau khi đổi dữ liệu → upsert giá trị mới (debounce) ----
  {
    const server = new Map();
    global.localStorage = mockLocalStorage({ 'planner-2026-3': '{"monthlyGoals":[]}' });
    const client = makeFakeSupabase(server);
    global.window = { supabase: { createClient: () => client } };
    global.SUPABASE_CONFIG = { url: 'https://x.supabase.co', anonKey: 'k', pushDebounceMs: 5 };
    const Sync = loadSync();
    await Sync.init();
    global.localStorage.setItem('planner-2026-3', '{"monthlyGoals":[{"id":"g9","done":true}]}');
    Sync.push('planner-2026-3');
    await sleep(60);
    const last = client._upserts.filter((r) => r.key === 'planner-2026-3').pop();
    assert.ok(last && last.data.monthlyGoals[0].done === true, 'upsert phải có dữ liệu mới');
    console.log('TEST 3 OK — push đẩy giá trị mới lên cloud');
  }

  // ---- TEST 4: clearAll xoá toàn bộ remote ----
  {
    const server = new Map([['planner-2026-4', { data: {}, updated_at: new Date().toISOString() }]]);
    global.localStorage = mockLocalStorage({ 'planner-2026-4': '{}' });
    const client = makeFakeSupabase(server);
    global.window = { supabase: { createClient: () => client } };
    global.SUPABASE_CONFIG = { url: 'https://x.supabase.co', anonKey: 'k', pushDebounceMs: 5 };
    const Sync = loadSync();
    await Sync.init();
    await Sync.clearAll();
    assert.strictEqual(server.size, 0, 'clearAll phải xoá hết row remote');
    console.log('TEST 4 OK — clearAll');
  }

  console.log('\n✅ Tất cả 4 test sync đều PASS');
}

main().catch((e) => { console.error('❌ TEST FAIL:', e); process.exit(1); });
