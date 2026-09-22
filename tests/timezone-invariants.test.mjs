/**
 * Timezone invariants — khoá ở tầng CI lớp lỗi "giả định múi giờ" (audit 2026-09-22).
 *
 * Vì sao cần file riêng: các lỗi ngày-UTC (baseDate kế hoạch ngày, tên file export,
 * fmtDate của projects) KHÔNG lộ ra ở UTC+7. CI mặc định chạy UTC và có thêm một lượt
 * TZ=Asia/Ho_Chi_Minh — cả hai đều offset DƯƠNG, nên múi giờ ÂM (châu Mỹ) vẫn là vùng mù.
 * File này khoá lớp lỗi đó bằng ba tầng độc lập:
 *
 *   1. Guard tĩnh — quét js/*.js + sw.js: cấm suy ra 'YYYY-MM-DD' từ UTC
 *      (toISOString().slice(0,10)…), cấm new Date('YYYY-MM-DD') (spec = 00:00 UTC),
 *      cấm parse date-key thô; các hàm UTC của Date chỉ được dùng khi có marker `tz-utc-ok`.
 *   2. Sandbox "Date ảo" — chạy chính module thật trong vm với một Date đứng ở múi giờ
 *      cố định (New York UTC-4, Kiritimati UTC+14). Tầng này KHÔNG cần runner emulate
 *      được IANA zone, nên vẫn chạy đủ ở mọi nơi (kể cả shell Windows không truyền TZ).
 *   3. Probe tiến trình con với TZ thật — ground truth của Date implementation, chạy đủ
 *      trên CI Linux lẫn Windows (env truyền qua CreateProcess được Node honor; dấu `TZ=`
 *      của Git Bash/MSYS thì không, nên đừng "kiểm chứng" bằng shell kiểu đó). Tự skip
 *      nếu runner vì lý do nào đó không đổi được zone — khi đó tầng 2 đã phủ thay.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JS_DIR = new URL('../js/', import.meta.url);

/** Thời điểm dùng chung: 20:00Z — ở NY vẫn là 22/09, ở Kiritimati đã sang 23/09. */
const INSTANT = '2026-09-22T20:00:00Z';
const NY = -240; // America/New_York, tháng 9 (DST) = UTC-4
const KIR = 840; // Pacific/Kiritimati = UTC+14

/* ============================ 1. Guard tĩnh ============================ */

/** Suy ra ngày 'YYYY-MM-DD' từ UTC — lệch ngày với VN trước 07:00 (lỗi P1.1/P1.2). */
const RAW_DATE_RULES = [
  {
    id: 'UTC_DATE_KEY',
    re: /\.(?:toISOString|toJSON)\(\)\s*\.\s*(?:slice|substring|substr)\(\s*0\s*,\s*10\s*\)/,
    why: "suy ra ngày từ toISOString() là ngày UTC — dùng TaskFlowUtil.localISODate() hoặc getFullYear/getMonth/getDate",
  },
  {
    id: 'UTC_DATE_KEY',
    re: /\.(?:toISOString|toJSON)\(\)\s*\.\s*split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/,
    why: "suy ra ngày từ toISOString() là ngày UTC — dùng TaskFlowUtil.localISODate()",
  },
  {
    id: 'UTC_PARSED_LITERAL',
    re: /new\s+Date\(\s*['"]\d{4}-\d{2}-\d{2}['"]\s*\)/,
    why: "spec parse 'YYYY-MM-DD' thành 00:00 UTC → hiển thị lùi một ngày ở múi giờ âm",
  },
  {
    id: 'RAW_DATE_KEY_PARSE',
    re: /new\s+Date\(\s*(?:d|key|str|value|iso|s|date|dateKey|dateStr)\s*\)/,
    why: 'parse date-key thô — tách y/m/d rồi new Date(y, m-1, d) để giữ giờ local',
  },
];

/** Các hàm UTC của Date hợp lệ khi UTC là bắt buộc (ví dụ DTSTAMP của .ics) + có marker. */
const UTC_MARKER = 'tz-utc-ok';
const UTC_ONLY_RE = /\bgetUTC(?:FullYear|Month|Date|Hours|Minutes|Seconds)\s*\(|\bDate\.UTC\s*\(/;

/** Nguồn first-party chạy trong trình duyệt: js/*.js (bỏ .min) + service worker. */
function browserSources() {
  const files = readdirSync(JS_DIR)
    .filter((name) => name.endsWith('.js') && !name.endsWith('.min.js'))
    .map((name) => ({ name: 'js/' + name, src: readFileSync(new URL(name, JS_DIR), 'utf8') }));
  files.push({ name: 'sw.js', src: readFileSync(new URL('../sw.js', import.meta.url), 'utf8') });
  return files;
}

test('guard tĩnh: js/*.js + sw.js không suy ra ngày từ UTC', () => {
  const violations = [];
  for (const { name, src } of browserSources()) {
    src.split(/\r?\n/).forEach((line, i) => {
      for (const rule of RAW_DATE_RULES) {
        if (rule.re.test(line)) violations.push(`${name}:${i + 1} [${rule.id}] ${rule.why}\n      ${line.trim()}`);
      }
      if (UTC_ONLY_RE.test(line) && !line.includes(UTC_MARKER)) {
        violations.push(
          `${name}:${i + 1} [UTC_NEEDS_MARKER] giờ UTC trông như vô tình — nếu là cố ý, thêm comment \`${UTC_MARKER}: <lý do>\` trên chính dòng đó\n      ${line.trim()}`
        );
      }
    });
  }
  assert.deepEqual(violations, [], 'phát hiện cách xử lý ngày theo UTC trong source trình duyệt');
});

test('exportICS: DTSTAMP là UTC thật (getUTC* + hậu tố Z) và có marker tz-utc-ok', () => {
  const src = readFileSync(new URL('../js/export.js', import.meta.url), 'utf8');
  const line = src.split(/\r?\n/).find((l) => l.includes('const stamp ='));
  assert.ok(line, 'không tìm thấy dòng dựng DTSTAMP trong exportICS');
  assert.match(line, /getUTCFullYear\(\)/, 'DTSTAMP phải dựng từ getUTC* (giờ UTC thật)');
  assert.match(line, /\+\s*'Z';/, "DTSTAMP phải mang hậu tố 'Z' đúng với giá trị UTC");
  assert.match(line, new RegExp(UTC_MARKER), `cần marker ${UTC_MARKER} để guard tĩnh biết đây là UTC cố ý`);
});

/* ==================== 2. Sandbox "Date ảo" theo múi giờ ==================== */

/**
 * Date của một múi giờ cố định, không phụ thuộc TZ của runner.
 * Local getters = UTC getters của (instant + offset); UTC getters vẫn là giờ UTC thật.
 * Parse theo đúng spec: 'YYYY-MM-DD' = 00:00 UTC, 'YYYY-MM-DDTHH:mm' = giờ local.
 */
function zonedDate(offsetMinutes) {
  const Real = Date;
  const shifted = (ms) => new Real(ms + offsetMinutes * 60000);
  class ZonedDate extends Real {
    constructor(...args) {
      if (args.length === 0) {
        super(Real.now());
        return;
      }
      if (args.length === 1) {
        const [a] = args;
        if (typeof a === 'number' || a instanceof Real) {
          super(Number(a));
          return;
        }
        const s = String(a);
        const wall = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(s);
        super(
          wall
            ? Real.UTC(+wall[1], +wall[2] - 1, +wall[3], +wall[4], +wall[5], +(wall[6] || 0), +(wall[7] || 0)) -
                offsetMinutes * 60000
            : Real.parse(s)
        );
        return;
      }
      const [y, mo, d = 1, h = 0, mi = 0, sec = 0, ms = 0] = args;
      super(Real.UTC(y, mo, d, h, mi, sec, ms) - offsetMinutes * 60000);
    }
  }
  const pairs = [
    ['getFullYear', 'getUTCFullYear'],
    ['getMonth', 'getUTCMonth'],
    ['getDate', 'getUTCDate'],
    ['getDay', 'getUTCDay'],
    ['getHours', 'getUTCHours'],
    ['getMinutes', 'getUTCMinutes'],
    ['getSeconds', 'getUTCSeconds'],
    ['getMilliseconds', 'getUTCMilliseconds'],
  ];
  pairs.forEach(([local, utc]) => {
    ZonedDate.prototype[local] = function () {
      return Real.prototype[utc].call(shifted(Real.prototype.getTime.call(this)));
    };
  });
  return ZonedDate;
}

/** Nạp module thật (UMD) vào sandbox với Date đứng ở múi giờ cho trước. */
function loadZoned(relPath, offsetMinutes) {
  const sandbox = { console: { log() {}, warn() {}, error() {}, info() {} }, Date: zonedDate(offsetMinutes) };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../' + relPath, import.meta.url), 'utf8'), sandbox);
  return sandbox;
}

test('harness Date ảo: tự kiểm đúng ngữ nghĩa UTC vs local', () => {
  const box = loadZoned('js/util.js', NY);
  assert.equal(new box.Date('2026-09-22').getUTCDate(), 22, 'UTC getter phải là giờ UTC thật');
  assert.equal(new box.Date('2026-09-22').getDate(), 21, '00:00 UTC 22/09 ở NY là 21/09');
  assert.equal(new box.Date('2026-09-22T02:00:00Z').getHours(), 22, 'NY = UTC-4 → 02:00Z là 22:00 hôm trước');
  assert.equal(new box.Date(2026, 8, 22).toISOString(), new Date(Date.UTC(2026, 8, 22) + 240 * 60000).toISOString(), 'constructor (y,m,d) = giờ local');
});

test('fmtDate (projects-ui): date-key parse theo giờ local ở cả hai hướng offset', () => {
  const ny = loadZoned('js/projects-ui.js', NY);
  assert.equal(ny.TaskFlowProjectsUI.fmtDate('2026-09-22'), '22/09/2026', 'date-key phải giữ nguyên ngày ở UTC-4');
  assert.equal(ny.TaskFlowProjectsUI.fmtDate('2026-09-22T20:00:00Z'), '22/09/2026', 'timestamp ISO vẫn đổi theo giờ local');

  const kir = loadZoned('js/projects-ui.js', KIR);
  assert.equal(kir.TaskFlowProjectsUI.fmtDate('2026-09-22'), '22/09/2026', 'date-key phải giữ nguyên ngày ở UTC+14');
  assert.equal(kir.TaskFlowProjectsUI.fmtDate('2026-09-22T20:00:00Z'), '23/09/2026', 'UTC+14 → 20:00Z đã sang 23/09');
});

test('_migrateRecord (kế hoạch ngày): baseDate theo ngày local, không theo UTC', () => {
  const cases = [
    { label: 'UTC-4', off: NY, createdAt: '2026-09-22T02:00:00Z', expect: '2026-09-21' },
    { label: 'UTC+14', off: KIR, createdAt: '2026-09-22T20:00:00Z', expect: '2026-09-23' },
  ];
  for (const { label, off, createdAt, expect } of cases) {
    const box = loadZoned('js/ai-document-daily-plan.js', off);
    const out = box.TaskFlowDocumentDailyPlan._migrateRecord({ id: 'r1', createdAt, cursor: {} });
    assert.equal(out.baseDate, expect, `baseDate sai ở ${label}`);
    assert.notEqual(out.baseDate, createdAt.slice(0, 10), `ngày UTC (lỗi cũ) không được trùng ở ${label} — ca test phải phân biệt được`);
  }
});

test('exportFileName: ngày local ở cả hai hướng offset', () => {
  const ny = loadZoned('js/export.js', NY);
  assert.equal(ny.TaskFlowExport.exportFileName('p', new ny.Date(INSTANT)), 'p-2026-09-22');
  const kir = loadZoned('js/export.js', KIR);
  assert.equal(kir.TaskFlowExport.exportFileName('p', new kir.Date(INSTANT)), 'p-2026-09-23');
});

test('util.localISODate: chuẩn ngày local ở cả hai hướng offset', () => {
  const ny = loadZoned('js/util.js', NY);
  assert.equal(ny.TaskFlowUtil.localISODate(new ny.Date('2026-09-22T02:00:00Z')), '2026-09-21');
  const kir = loadZoned('js/util.js', KIR);
  assert.equal(kir.TaskFlowUtil.localISODate(new kir.Date(INSTANT)), '2026-09-23');
});

/* ============ 3. Probe tiến trình con với TZ thật (ground truth) ============ */

/** Chạy chính các hàm đã sửa trong tiến trình con, dưới TZ chỉ định. */
const PROBE = [
  "const util = require('./js/util.js');",
  "const exp = require('./js/export.js');",
  "const plan = require('./js/ai-document-daily-plan.js');",
  "const pui = require('./js/projects-ui.js');",
  "const instant = '" + INSTANT + "';",
  'process.stdout.write(JSON.stringify({',
  '  iso: util.localISODate(new Date(instant)),',
  "  name: exp.exportFileName('p', new Date(instant)),",
  "  fmt: pui.fmtDate('2026-09-22'),",
  "  base: plan._migrateRecord({ id: 'x', createdAt: instant, cursor: {} }).baseDate,",
  '}));',
].join('\n');

function runProbe(tz) {
  const env = tz ? { ...process.env, TZ: tz } : { ...process.env };
  return { ...JSON.parse(execFileSync(process.execPath, ['-e', PROBE], { cwd: ROOT, env, encoding: 'utf8' })) };
}

/** Runner có emulate được IANA zone không? (Windows: không — TZ bị bỏ qua.) */
function zoneUsable(tz, expectedOffsetMinutes) {
  try {
    const out = execFileSync(
      process.execPath,
      ['-e', 'process.stdout.write(String(new Date("2026-09-22T20:00:00Z").getTimezoneOffset()))'],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' }
    );
    return Number(out) === expectedOffsetMinutes;
  } catch (e) {
    return false;
  }
}

test('probe TZ: tiến trình con chạy đúng code hiện tại (kiểm tra plumbing)', () => {
  const util = require('../js/util.js');
  const exp = require('../js/export.js');
  const plan = require('../js/ai-document-daily-plan.js');
  const pui = require('../js/projects-ui.js');
  const expected = {
    iso: util.localISODate(new Date(INSTANT)),
    name: exp.exportFileName('p', new Date(INSTANT)),
    fmt: pui.fmtDate('2026-09-22'),
    base: plan._migrateRecord({ id: 'x', createdAt: INSTANT, cursor: {} }).baseDate,
  };
  assert.deepEqual(runProbe(null), expected, 'probe phải cho kết quả giống tiến trình test hiện tại');
  assert.equal(expected.fmt, '22/09/2026', 'date-key phải giữ nguyên ngày ở mọi múi giờ');
});

test('probe TZ: múi giờ ÂM — America/New_York', (t) => {
  if (!zoneUsable('America/New_York', 240)) return t.skip('runner này không đổi được IANA zone — tầng sandbox đã phủ');
  assert.deepEqual(runProbe('America/New_York'), {
    iso: '2026-09-22',
    name: 'p-2026-09-22',
    fmt: '22/09/2026',
    base: '2026-09-22',
  });
});

test('probe TZ: múi giờ DƯƠNG xa — Pacific/Kiritimati (UTC+14)', (t) => {
  if (!zoneUsable('Pacific/Kiritimati', -840)) return t.skip('runner này không đổi được IANA zone — tầng sandbox đã phủ');
  assert.deepEqual(runProbe('Pacific/Kiritimati'), {
    iso: '2026-09-23',
    name: 'p-2026-09-23',
    fmt: '22/09/2026',
    base: '2026-09-23',
  });
});

/* ============================ 4. Khoá CI ============================ */

test('CI: suite phải chạy ở cả UTC (mặc định) và một múi giờ không-UTC', () => {
  const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(ci, /run: node --test tests\/\*\.test\.mjs/, 'CI phải chạy suite mặc định (UTC trên runner GitHub)');
  assert.match(ci, /run: TZ=\S+ node --test tests\/\*\.test\.mjs/, 'CI phải giữ lượt chạy ở múi giờ không-UTC');
});
