/**
 * P1 data-safety — ba lỗi "ngầm" tìm được trong audit 2026-09-22.
 *
 * 1. Ngày UTC trong tên file export (`toISOString().slice(0,10)`): export lúc 6h sáng
 *    ở VN (UTC+7) bị đặt tên bằng ngày HÔM QUA → nhầm khi cần phục hồi.
 * 2. Ngày UTC làm `baseDate` của kế hoạch ngày từ PDF: cùng lý do, chạy trước 07:00
 *    giờ VN thì cả roadmap/daily plan lệch một ngày.
 * 3. Lỗi ghi localStorage (hết dung lượng ~5 MB) bị nuốt im lặng: người dùng vẫn gõ
 *    tiếp rồi mất trắng khi reload. `storageSet` phải dọn slot sao lưu, ghi lại, và chỉ
 *    khi bó tay mới báo cho người dùng.
 *
 * Test ngày viết theo bất biến "theo giờ LOCAL" thay vì hằng số, nên đúng ở mọi múi giờ
 * (CI chạy cả UTC lẫn Asia/Ho_Chi_Minh). Test storage chạy js/util.js trong vm sandbox —
 * mảng trả về từ realm khác nên phải spread trước khi deepEqual (bài học của repo).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const UTIL_SRC = readFileSync(new URL('../js/util.js', import.meta.url), 'utf8');
const EXPORT_SRC = readFileSync(new URL('../js/export.js', import.meta.url), 'utf8');

/** 'YYYY-MM-DD' theo giờ local của tiến trình test (chuẩn để so sánh). */
const localISO = (d) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

const TZ_OFFSET_MIN = new Date().getTimezoneOffset(); // 0 khi ở UTC

/**
 * localStorage giả có "ngân sách byte": ghi vượt ngân sách → QuotaExceededError.
 * Nhờ vậy dọn slot sao lưu thật sự làm ghi lại được — đúng hành vi trình duyệt.
 */
function fakeStorage({ seed = {}, budget = Infinity } = {}) {
  const store = new Map(Object.entries(seed));
  const state = { writes: 0, throws: 0 };
  const size = () => Array.from(store.entries()).reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    store,
    state,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem(k, v) {
      state.writes++;
      const key = String(k);
      const val = String(v);
      const previous = store.has(key) ? key.length + store.get(key).length : 0;
      if (size() - previous + key.length + val.length > budget) {
        state.throws++;
        const e = new Error('quota exceeded (fake)');
        e.name = 'QuotaExceededError';
        throw e;
      }
      store.set(key, val);
    },
    removeItem: (k) => store.delete(k),
    key: (i) => Array.from(store.keys())[i] || null,
    get length() { return store.size; },
  };
}

/** Nạp js/util.js (UMD) vào sandbox với localStorage + UI/i18n giả. */
function loadUtil({ store = {}, budget = Infinity, withUi = true, withI18n = true } = {}) {
  const ls = fakeStorage({ seed: store, budget });
  const toasts = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {}, info() {} },
    JSON, Math, String, Number, Date, Object, Array,
    localStorage: ls,
  };
  if (withUi) sandbox.TaskFlowUI = { toast: (msg, kind, dur) => { toasts.push({ msg, kind, dur }); } };
  if (withI18n) sandbox.TaskFlowI18N = { t: (k) => (k === 'storageFullWarn' ? 'BỘ NHỚ ĐẦY (i18n)' : k) };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(UTIL_SRC, sandbox);
  return { util: sandbox.TaskFlowUtil, ls, toasts };
}

/* ============================ 1. Tên file export theo ngày LOCAL ============================ */

test('exportFileName: dùng ngày local, không phải ngày UTC', () => {
  const sandbox = { console, JSON, Math, String, Number, Date, Object, Array };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(EXPORT_SRC, sandbox);
  const { exportFileName } = sandbox.TaskFlowExport;
  assert.equal(typeof exportFileName, 'function', 'export.js phải export exportFileName');

  // Dựng từ thành phần local → luôn 2026-09-22 dù máy ở múi giờ nào
  assert.equal(exportFileName('taskflow-todoist-backup', new Date(2026, 8, 22, 6, 0)), 'taskflow-todoist-backup-2026-09-22');

  // Sát biên UTC: 20:00Z là 03:00 hôm sau ở VN → phải theo ngày local
  const nearBoundary = new Date('2026-09-22T20:00:00.000Z');
  assert.equal(exportFileName('p', nearBoundary), 'p-' + localISO(nearBoundary));
  if (TZ_OFFSET_MIN !== 0) {
    assert.notEqual(nearBoundary.toISOString().slice(0, 10), localISO(nearBoundary),
      'ca test phải thật sự lệch ngày giữa UTC và local');
  }
});

/* ============================ 2. baseDate kế hoạch ngày theo ngày LOCAL ============================ */

test('_migrateRecord: baseDate lấy theo ngày local (không dùng toISOString)', () => {
  const plan = require('../js/ai-document-daily-plan.js');
  assert.equal(typeof plan._migrateRecord, 'function', 'phải export _migrateRecord để test');

  const createdAt = '2026-09-22T20:00:00.000Z';
  const out = plan._migrateRecord({ id: 'r1', createdAt, cursor: { nextWeek: 0 } });
  assert.equal(out.baseDate, localISO(new Date(createdAt)), 'baseDate phải là ngày LOCAL của createdAt');
  if (TZ_OFFSET_MIN !== 0) {
    assert.notEqual(out.baseDate, createdAt.slice(0, 10), 'baseDate không được là ngày UTC (lỗi cũ)');
  }
  // Không có createdAt → fallback _today() (cũng local)
  assert.equal(plan._migrateRecord({ id: 'r2', cursor: {} }).baseDate, plan._today());
});

/* ============================ 3. Ghi localStorage khi hết dung lượng ============================ */

test('storageSet: ghi bình thường thì không dọn slot sao lưu', () => {
  const { util, ls } = loadUtil({ store: { 'planner-backup-0': 'x', 'planner-backup-1': 'y' } });
  const res = util.storageSet('planner-2026-9', '{"a":1}');
  assert.equal(res.ok, true);
  assert.deepEqual([...res.pruned], []);
  assert.equal(ls.getItem('planner-2026-9'), '{"a":1}');
  assert.equal(ls.getItem('planner-backup-0'), 'x', 'không được dọn khi vẫn còn chỗ');
});

test('storageSet: hết chỗ → dọn slot sao lưu rồi ghi lại được (không mất dữ liệu sống)', () => {
  const store = { 'planner-backup-0': 'b0', 'planner-backup-3': 'b3', 'planner-backup-idx': '4', 'planner-theme': 'dark' };
  const { util, ls } = loadUtil({ store, budget: 80 });
  const res = util.storageSet('planner-2026-9', '{"task":"quan trọng"}');
  assert.equal(res.ok, true, 'sau khi dọn slot phải ghi được');
  assert.deepEqual([...res.pruned].sort(), ['planner-backup-0', 'planner-backup-3'], 'dọn đúng các slot đang có');
  assert.equal(ls.getItem('planner-2026-9'), '{"task":"quan trọng"}');
  assert.equal(ls.getItem('planner-backup-0'), null);
  assert.equal(ls.getItem('planner-backup-idx'), null, 'con trỏ vòng xoay phải về 0');
  assert.equal(ls.getItem('planner-theme'), 'dark', 'không được xoá dữ liệu khác');
  assert.equal(util.storageHealth().failures, 0, 'ghi thành công thì không tính là thất bại');
});

test('storageSet: bó tay → trả ok:false + BÁO người dùng (không im lặng), throttle 30s', () => {
  const { util, ls, toasts } = loadUtil({ budget: 5 });
  const first = util.storageSet('planner-2026-9', '{"a":1}');
  assert.equal(first.ok, false, 'không ghi được thì phải nói thật là thất bại');
  assert.deepEqual([...first.pruned], [], 'không có slot nào để dọn');
  assert.equal(ls.getItem('planner-2026-9'), null);
  assert.equal(toasts.length, 1, 'phải toast cho người dùng biết');
  assert.equal(toasts[0].kind, 'error');
  assert.equal(toasts[0].msg, 'BỘ NHỚ ĐẦY (i18n)', 'ưu tiên chuỗi i18n khi có');
  assert.ok(toasts[0].dur >= 8000, 'thông báo mất dữ liệu phải đủ lâu để đọc');

  util.storageSet('planner-2026-9', '{"a":2}');
  assert.equal(toasts.length, 1, 'không spam toast trong 30 giây');
  assert.equal(util.storageHealth().failures, 2, 'nhưng vẫn đếm đủ số lần thất bại');
});

test('storageSet: thiếu i18n thì dùng câu tiếng Việt mặc định, không throw', () => {
  const { util, toasts } = loadUtil({ budget: 5, withI18n: false });
  const res = util.storageSet('planner-2026-9', '{}');
  assert.equal(res.ok, false, 'vẫn phải trả ok:false thay vì ném lỗi');
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].msg, /Bộ nhớ trình duyệt đã đầy/);
});

test('storageSet: không có UI thì vẫn không throw (app có thể chạy trước khi UI sẵn sàng)', () => {
  const { util } = loadUtil({ budget: 5, withUi: false });
  const res = util.storageSet('planner-2026-9', '{}');
  assert.equal(res.ok, false);
});

/* ============ 3b. Đường ghi trung tâm (js/storage.js) cũng phải có phòng vệ ============ */

/** Nạp js/util.js + js/storage.js cùng sandbox (đúng thứ tự script của app.html). */
function loadStorage({ store = {}, budget = Infinity, withUtil = true, withUi = true } = {}) {
  const ls = fakeStorage({ seed: store, budget });
  const toasts = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {}, info() {} },
    JSON, Math, String, Number, Date, Object, Array,
    localStorage: ls,
    Sync: { push() {} },
  };
  if (withUi) sandbox.TaskFlowUI = { toast: (msg) => { toasts.push(msg); } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (withUtil) vm.runInContext(UTIL_SRC, sandbox);
  vm.runInContext(readFileSync(new URL('../js/storage.js', import.meta.url), 'utf8'), sandbox);
  return { storage: sandbox.TaskFlowStorage, ls, toasts, sandbox };
}

test('saveMonthState: hết chỗ → dọn slot sao lưu rồi vẫn lưu được dữ liệu tháng', () => {
  const state = { schemaVersion: 2, habits: [], weeks: [] };
  // ngân sách 80 byte: ghi state (14+42 byte) không vừa khi còn 2 slot sao lưu (36 byte)
  const { storage, ls } = loadStorage({ store: { 'planner-backup-0': 'b0', 'planner-backup-2': 'b2' }, budget: 80 });
  assert.equal(storage.saveMonthState(2026, 8, state), true, 'phải lưu được sau khi dọn slot');
  assert.ok(ls.getItem('planner-2026-9'), 'state tháng phải có trong localStorage');
  assert.equal(ls.getItem('planner-backup-0'), null, 'slot sao lưu bị dọn để lấy chỗ');
});

test('saveMonthState: bó tay → trả false + báo người dùng (không nuốt lỗi)', () => {
  const { storage, toasts } = loadStorage({ budget: 5 });
  assert.equal(storage.saveMonthState(2026, 8, { habits: [] }), false, 'không ghi được phải nói thật');
  assert.equal(toasts.length, 1, 'phải báo cho người dùng biết dữ liệu chưa được lưu');
});

test('saveMonthState: thiếu js/util.js (thứ tự script sai) vẫn không throw', () => {
  const { storage } = loadStorage({ budget: 5, withUtil: false });
  assert.equal(storage.saveMonthState(2026, 8, { habits: [] }), false, 'fallback localStorage: false, không throw');
});

test('guard tĩnh: không còn đường ghi state tháng nào nuốt lỗi quota', () => {
  const appSrc = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(appSrc, /try \{ localStorage\.setItem\(monthKey\(PLAN_YEAR, PLAN_MONTH\)/,
    'state tháng phải ghi qua storageSet để hết dung lượng còn báo được');
  const storageSrc = readFileSync(new URL('../js/storage.js', import.meta.url), 'utf8');
  assert.match(storageSrc, /util\.storageSet\(key, JSON\.stringify\(s\)\)/, 'saveMonthState phải đi qua storageSet');
});

/* ====== 3c. Đường capture Inbox (js/inbox.js) — cùng lớp, đường ghi hay dùng nhất ====== */

/** Nạp js/util.js + js/inbox.js cùng sandbox (đúng thứ tự script của app.html). */
function loadInbox({ store = {}, budget = Infinity, withUtil = true, withUi = true } = {}) {
  const ls = fakeStorage({ seed: store, budget });
  const toasts = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {}, info() {} },
    JSON, Math, String, Number, Date, Object, Array,
    localStorage: ls,
    Sync: { push() {} },
  };
  if (withUi) sandbox.TaskFlowUI = { toast: (msg) => { toasts.push(msg); } };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (withUtil) vm.runInContext(UTIL_SRC, sandbox);
  vm.runInContext(readFileSync(new URL('../js/inbox.js', import.meta.url), 'utf8'), sandbox);
  return { inbox: sandbox.TaskFlowInbox, ls, toasts };
}

/** Payload dùng chữ ASCII để ngân sách byte tính được chính xác (không phụ thuộc Unicode). */
const INBOX_ITEM = [{ uid: 'u1', text: 'Call A', done: false }];

test('saveInbox: hết chỗ → dọn slot sao lưu rồi vẫn lưu được item vừa capture', () => {
  // 2 slot (18 byte mỗi cái) + payload (57 byte) = 93 > ngân sách 80; sau khi dọn còn 57 → vừa.
  const { inbox, ls } = loadInbox({ store: { 'planner-backup-0': 'b0', 'planner-backup-1': 'b1' }, budget: 80 });
  const res = inbox.saveInbox(INBOX_ITEM);
  assert.equal(res && res.ok, true, 'phải lưu được sau khi dọn slot sao lưu');
  assert.equal(JSON.parse(ls.getItem('planner-inbox')).length, 1, 'item vừa capture phải nằm trong localStorage');
  assert.equal(ls.getItem('planner-backup-0'), null, 'slot sao lưu bị dọn để lấy chỗ');
});

test('saveInbox: bó tay → trả ok:false + BÁO người dùng (không nuốt lỗi quota)', () => {
  const { inbox, toasts } = loadInbox({ budget: 5 });
  const res = inbox.saveInbox(INBOX_ITEM);
  assert.equal(res.ok, false, 'không ghi được phải nói thật');
  assert.equal(toasts.length, 1, 'phải báo để người dùng biết item chưa được lưu');
});

test('saveInbox: thiếu js/util.js (thứ tự script sai) vẫn không throw', () => {
  const { inbox, ls } = loadInbox({ withUtil: false });
  assert.doesNotThrow(() => inbox.saveInbox(INBOX_ITEM));
  assert.ok(ls.getItem('planner-inbox'), 'fallback localStorage vẫn ghi được');
});

test('guard tĩnh: saveInbox không còn nuốt lỗi quota', () => {
  const src = readFileSync(new URL('../js/inbox.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /try \{ localStorage\.setItem\(INBOX_KEY, JSON\.stringify\(inbox\)\)/,
    'saveInbox phải ghi qua storageSet để hết dung lượng còn báo được');
  assert.match(src, /util\.storageSet\(INBOX_KEY, payload\)/, 'saveInbox phải đi qua storageSet');
});

test('pruneBackups: chỉ xoá planner-backup-* và con trỏ', () => {
  const { util, ls } = loadUtil({
    store: { 'planner-backup-0': 'b0', 'planner-backup-6': 'b6', 'planner-2026-9': 'keep', 'planner-token': 'tok' },
  });
  const removed = util.pruneBackups();
  assert.deepEqual([...removed].sort(), ['planner-backup-0', 'planner-backup-6']);
  assert.equal(ls.getItem('planner-2026-9'), 'keep');
  assert.equal(ls.getItem('planner-token'), 'tok', 'không được đụng vào phiên đăng nhập');
});
