#!/usr/bin/env python3
from pathlib import Path
import json
import os
import re
import sys

# This helper may be copied to /tmp by the materializer workflow, so __file__
# cannot be trusted to locate the repository. Resolution order (first hit wins):
#   1. --repo-root=<path> CLI argument
#   2. GITHUB_WORKSPACE environment variable (set by GitHub Actions)
#   3. current working directory (documented invocation contract)
_root_arg = next(
    (a.split('=', 1)[1] for a in sys.argv[1:] if a.startswith('--repo-root=')),
    None,
)
ROOT = Path(
    _root_arg or os.environ.get('GITHUB_WORKSPACE') or Path.cwd()
).resolve()


def _read_lf(path):
    """Read UTF-8 and normalize every newline variant (CRLF, lone CR) to LF.
    Deterministic across OSes. Plain text-mode reads already collapse CRLF on    input, but stray lone-CR artifacts inside committed blobs must be folded    too, and write-back below must never re-translate to os.linesep — Windows    would emit CRLF and silently break byte-sensitive source-structure gates.
    """
    return (ROOT / path).read_bytes().decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')


def _write_lf(path, text):
    (ROOT / path).write_bytes(text.encode('utf-8'))


def read(path):
    return _read_lf(path)


def write(path, text):
    _write_lf(path, text)


def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise RuntimeError(f'expected text not found in {path}: {old[:120]!r}')
    if text.count(old) != 1:
        raise RuntimeError(f'expected exactly one match in {path}, found {text.count(old)}')
    write(path, text.replace(old, new, 1))


def sub_once(path, pattern, repl, flags=0):
    text = read(path)
    out, n = re.subn(pattern, repl, text, count=1, flags=flags)
    if n != 1:
        raise RuntimeError(f'expected one regex match in {path}, found {n}: {pattern[:120]!r}')
    write(path, out)


# 1) Canonical shared contracts: align with real browser payloads and make the
# nested security-relevant shapes explicit.
contracts_path = ROOT / 'shared' / 'ai-tool-contracts.json'
contracts = json.loads(contracts_path.read_text(encoding='utf-8'))
by_name = {c['name']: c for c in contracts}

get_tasks = by_name['get_tasks']
task_props = get_tasks['outputSchema']['properties']['tasks']['items']['properties']
task_props.clear()
task_props.update({
    'uid': {'type': 'string', 'maxLength': 128},
    'text': {'type': 'string', 'maxLength': 300},
    'done': {'type': 'boolean'},
    'deadline': {'type': ['string', 'null'], 'format': 'date'},
    'scheduledDate': {'type': ['string', 'null'], 'format': 'date'},
    'duration': {'type': ['number', 'null'], 'minimum': 1, 'maximum': 1440},
})
get_tasks['outputSchema']['properties']['total'] = {'type': 'number', 'minimum': 0}

get_projects = by_name['get_projects']
get_projects['outputSchema']['properties']['projects'] = {
    'type': 'array', 'maxItems': 20,
    'items': {
        'type': 'object',
        'properties': {
            'id': {'type': 'string', 'maxLength': 128},
            'title': {'type': 'string', 'maxLength': 200},
            'status': {'type': ['string', 'null'], 'maxLength': 80},
            'milestones': {
                'type': 'array', 'maxItems': 20,
                'items': {
                    'type': 'object',
                    'properties': {
                        'id': {'type': 'string', 'maxLength': 128},
                        'title': {'type': 'string', 'maxLength': 200},
                    },
                    'required': ['id', 'title'],
                    'additionalProperties': False,
                },
            },
        },
        'required': ['id', 'title', 'status', 'milestones'],
        'additionalProperties': False,
    },
}

get_free = by_name['get_free_time']
get_free['outputSchema'] = {
    'type': 'object',
    'properties': {
        'busy': {
            'type': 'array', 'maxItems': 100,
            'items': {
                'type': 'object',
                'properties': {
                    'date': {'type': 'string', 'format': 'date'},
                    'startMs': {'type': 'number'},
                    'endMs': {'type': 'number'},
                    'source': {'type': 'string', 'enum': ['gcal', 'taskflow']},
                },
                'required': ['date', 'startMs', 'endMs', 'source'],
                'additionalProperties': False,
            },
        },
        'startDate': {'type': 'string', 'format': 'date'},
        'daysCount': {'type': 'number', 'minimum': 1, 'maximum': 14},
    },
    'required': ['busy', 'startDate', 'daysCount'],
    'additionalProperties': False,
}

for name in ['generate_daily_plan', 'propose_create_task', 'propose_complete_task', 'propose_reschedule_task']:
    c = by_name[name]
    props = c['outputSchema'].setdefault('properties', {})
    props['ok'] = {'type': 'boolean'}
    props['proposal'] = props.get('proposal', {})
    props['code'] = {'type': 'string', 'maxLength': 80}
    props['status'] = {'type': 'number', 'minimum': 100, 'maximum': 599}
    props['message'] = {'type': 'string', 'maxLength': 400}
    if name == 'generate_daily_plan':
        props['meta'] = props.get('meta', {})
        props['_pendingCursor'] = props.get('_pendingCursor', {})
    c['outputSchema']['required'] = ['ok']
    c['outputSchema']['additionalProperties'] = False

contracts_path.write_bytes((json.dumps(contracts, ensure_ascii=False, indent=2) + '\n').encode('utf-8'))

# 2) Server contract module: remove dead duplicate schemas and make nullable
# unions continue through format/range validation.
sub_once(
    'server/ai-tool-contracts.js',
    r"// Serve as reference \(original inline definitions removed, loaded from shared/ai-tool-contracts\.json\)\nconst _unused = \[[\s\S]*?\n\];\n\n// ── Validation helpers",
    "// Canonical definitions live only in shared/ai-tool-contracts.json.\n\n// ── Validation helpers",
)
sub_once(
    'server/ai-tool-contracts.js',
    r"function _validDate\(s\) \{\n  return typeof s === 'string' && /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/\.test\(s\);\n\}",
    """function _validDate(s) {
  if (typeof s !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(s)) return false;
  const parts = s.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.getUTCFullYear() === parts[0] && d.getUTCMonth() + 1 === parts[1] && d.getUTCDate() === parts[2];
}""",
)
replace_once(
    'server/ai-tool-contracts.js',
    """  // Handle union types (e.g. ['string', 'null'])
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((t) => t === null && value === null || t === _jsType(value))) {
      errors.push('invalid-type: ' + path + ' (expected ' + schema.type.join('|') + ')');
    }
    return;
  }

  if (schema.type) {""",
    """  // Union types must still flow through format/range validation for the
  // concrete value type (except null, which has no further constraints).
  if (Array.isArray(schema.type)) {
    const actualType = _jsType(value);
    if (!schema.type.some((t) => t === actualType)) {
      errors.push('invalid-type: ' + path + ' (expected ' + schema.type.join('|') + ')');
      return;
    }
    if (actualType === 'null') return;
  } else if (schema.type) {""",
)
replace_once(
    'server/ai-tool-contracts.js',
    "if (schema.format === 'date' && !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) errors.push('invalid-date: ' + path);",
    "if (schema.format === 'date' && !_validDate(value)) errors.push('invalid-date: ' + path);",
)

# 3) Server Brain sanitizer: every returnsProposal tool keeps the canonical
# proposal envelope after validation instead of dropping it to {ok:true}.
replace_once(
    'server/ai.js',
    """  if (toolName === 'generate_daily_plan') {
    // Only pass through ok, proposal (if present), meta — strip internal fields
    return { ok: !!result.ok, proposal: result.proposal || null, meta: result.meta || null };
  }
  // Unknown tool: return minimal safe copy
  return { ok: !!result.ok };""",
    """  const toolContract = getContract(toolName);
  if (toolContract && toolContract.returnsProposal) {
    const out = { ok: !!result.ok };
    if (result.proposal && typeof result.proposal === 'object') out.proposal = result.proposal;
    if (result.meta && typeof result.meta === 'object') out.meta = result.meta;
    if (typeof result.code === 'string') out.code = result.code.slice(0, 80);
    if (typeof result.status === 'number') out.status = result.status;
    if (typeof result.message === 'string') out.message = result.message.slice(0, 400);
    return out;
  }
  // Unknown tool: return minimal safe copy
  return { ok: !!result.ok };""",
)

# 4) Browser Brain sanitizer emits exact canonical get_tasks/free-time shapes.
sub_once(
    'js/ai-brain-client.js',
    r"  function _sanitizeTasks\(result\) \{[\s\S]*?\n  \}\n\n  function _sanitizeProjects",
    """  function _sanitizeTasks(result) {
    var tasks = Array.isArray(result.tasks) ? result.tasks : [];
    var sanitized = tasks.slice(0, 60).map(function (t) {
      return {
        uid: typeof t.uid === 'string' ? t.uid.slice(0, 128) : '',
        text: typeof t.text === 'string' ? t.text.slice(0, 300) : '',
        done: !!t.done,
        deadline: typeof t.deadline === 'string' ? t.deadline : null,
        scheduledDate: typeof t.scheduledDate === 'string' ? t.scheduledDate : null,
        duration: typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : null,
      };
    });
    return { tasks: sanitized, total: typeof result.total === 'number' ? result.total : sanitized.length };
  }

  function _sanitizeProjects""",
)
sub_once(
    'js/ai-brain-client.js',
    r"  function _sanitizeFreeTime\(result\) \{[\s\S]*?\n  \}\n\n  /\* ---- Public API ---- \*/",
    """  function _sanitizeFreeTime(result) {
    var busy = Array.isArray(result.busy) ? result.busy.slice(0, 100) : [];
    return {
      busy: busy.map(function (b) {
        return {
          date: typeof b.date === 'string' ? b.date : '',
          startMs: typeof b.startMs === 'number' ? b.startMs : 0,
          endMs: typeof b.endMs === 'number' ? b.endMs : 0,
          source: b.source === 'taskflow' ? 'taskflow' : 'gcal',
        };
      }),
      startDate: typeof result.startDate === 'string' ? result.startDate : '',
      daysCount: typeof result.daysCount === 'number' ? result.daysCount : 0,
    };
  }

  /* ---- Public API ---- */""",
)

# 5) Browser tool registry consumes generated canonical contracts at runtime.
sub_once(
    'js/ai-tools.js',
    r"  function register\(tool\) \{[\s\S]*?\n  \}\n\n  function getTool",
    """  function _canonicalContract(name) {
    try {
      var contracts = null;
      if (typeof window !== 'undefined' && Array.isArray(window.TaskFlowAIToolContracts)) contracts = window.TaskFlowAIToolContracts;
      else if (typeof globalThis !== 'undefined' && Array.isArray(globalThis.TaskFlowAIToolContracts)) contracts = globalThis.TaskFlowAIToolContracts;
      if (!contracts) return null;
      for (var i = 0; i < contracts.length; i++) {
        if (contracts[i] && contracts[i].name === name) return contracts[i];
      }
    } catch (e) { /* fallback to implementation metadata */ }
    return null;
  }

  function register(tool) {
    if (!tool || typeof tool !== 'object') throw new Error('Tool must be an object');
    if (!tool.name || typeof tool.name !== 'string') throw new Error('Tool must have a name');
    if (_tools[tool.name]) throw new Error('Tool already registered: ' + tool.name);
    if (typeof tool.execute !== 'function') throw new Error('Tool must have an execute function');
    var canonical = _canonicalContract(tool.name);
    var effective = canonical ? Object.assign({}, canonical, { execute: tool.execute, requiredContext: tool.requiredContext || [] }) : tool;
    if (!effective.description || typeof effective.description !== 'string') throw new Error('Tool must have a description');
    if (!effective.category || typeof effective.category !== 'string') throw new Error('Tool must have a category');
    if (!effective.safety || typeof effective.safety !== 'string') throw new Error('Tool must have a safety level');
    _tools[effective.name] = {
      name: effective.name,
      description: effective.description,
      category: effective.category,
      safety: effective.safety,
      mutating: effective.safety !== SAFETY_READ,
      executionLocation: effective.executionLocation || 'client',
      returnsProposal: !!effective.returnsProposal,
      inputSchema: effective.inputSchema || null,
      outputSchema: effective.outputSchema || null,
      requiredContext: effective.requiredContext || [],
      execute: effective.execute,
    };
  }

  function getTool""",
)
replace_once(
    'js/ai-tools.js',
    """          if (t.deadline === today) return true;
          // Derive actual date from planner grid
          if (!t.deadline && t.day && typeof t.day === 'number' && t.week) {
            var gridDate = _gridDate(t.week, t.day);
            return gridDate === today;
          }
          return false;""",
    """          if (t.deadline === today) return true;
          return t.scheduledDate === today;""",
)
replace_once(
    'js/ai-tools.js',
    """          if (t.deadline && t.deadline > today) return true;
          // Include grid-scheduled future tasks
          if (!t.deadline && t.day && typeof t.day === 'number' && t.week) {
            var gDate = _gridDate(t.week, t.day);
            if (gDate && gDate > today) return true;
          }
          return false;""",
    """          if (t.deadline && t.deadline < today) return false;
          if (t.deadline && t.deadline > today) return true;
          return !!(t.scheduledDate && t.scheduledDate > today);""",
)
sub_once(
    'js/ai-tools.js',
    r"  register\(\{\n    name: 'get_free_time',[\s\S]*?\n  \}\);\n\n  /\* ---- Built-in PLANNING tools ---- \*/",
    """  register({
    name: 'get_free_time',
    description: 'Get free time slots from timeblocks for a date range.',
    category: 'read',
    safety: SAFETY_READ,
    inputSchema: {
      type: 'object',
      properties: { startDate: { type: 'string', format: 'date' }, daysCount: { type: 'number', minimum: 1, maximum: 14 } },
      additionalProperties: false,
    },
    requiredContext: [],
    execute: function (args) {
      var startDate = (args && args.startDate) || _localTodayIso();
      var daysCount = (args && typeof args.daysCount === 'number') ? args.daysCount : 7;
      var busy = [];
      var rangeDates = [];
      var rangeDateSet = Object.create(null);
      for (var dayOffset = 0; dayOffset < daysCount; dayOffset++) {
        var rangeDt = new Date(startDate + 'T00:00:00');
        rangeDt.setDate(rangeDt.getDate() + dayOffset);
        var rangeDs = rangeDt.getFullYear() + '-' + String(rangeDt.getMonth() + 1).padStart(2, '0') + '-' + String(rangeDt.getDate()).padStart(2, '0');
        rangeDates.push(rangeDs); rangeDateSet[rangeDs] = true;
      }
      try {
        if (window.TaskFlowGCal && window.TaskFlowGCal.loadCache && window.TaskFlowGCal.eventsForDate) {
          var cache = window.TaskFlowGCal.loadCache();
          var events = cache && Array.isArray(cache.events) ? cache.events : [];
          rangeDates.forEach(function (ds) {
            (window.TaskFlowGCal.eventsForDate(events, ds) || []).forEach(function (e) {
              if (!e || typeof e.startMs !== 'number' || typeof e.endMs !== 'number' || e.endMs <= e.startMs) return;
              busy.push({ date: ds, startMs: e.startMs, endMs: e.endMs, source: 'gcal' });
            });
          });
        }
      } catch (e) { /* offline */ }
      function timeBlockMs(date, hhmm) {
        if (typeof date !== 'string' || typeof hhmm !== 'string' || !/^\\d{2}:\\d{2}$/.test(hhmm)) return null;
        var dt = new Date(date + 'T' + hhmm + ':00');
        var ms = dt.getTime();
        return Number.isFinite(ms) ? ms : null;
      }
      try {
        var tbStore = null;
        if (window.TaskFlowTimeBlocks && typeof window.TaskFlowTimeBlocks.loadTimeBlocks === 'function') tbStore = window.TaskFlowTimeBlocks.loadTimeBlocks();
        else if (typeof loadTimeBlocksStore === 'function') tbStore = loadTimeBlocksStore();
        var blocks = tbStore && Array.isArray(tbStore.blocks) ? tbStore.blocks : [];
        blocks.forEach(function (tb) {
          if (!tb || tb.status === 'cancelled' || !rangeDateSet[tb.date]) return;
          var startMs = timeBlockMs(tb.date, tb.start); var endMs = timeBlockMs(tb.date, tb.end);
          if (startMs === null || endMs === null || endMs <= startMs) return;
          busy.push({ date: tb.date, startMs: startMs, endMs: endMs, source: 'taskflow' });
        });
      } catch (e) { /* */ }
      busy.sort(function (a, b) { return a.startMs - b.startMs; });
      return { busy: busy.slice(0, 100), startDate: startDate, daysCount: daysCount };
    },
  });

  /* ---- Built-in PLANNING tools ---- */""",
)

# 6) Migration must return a new object for v1 so loadStore can detect and
# persist it; initial pending transaction exists only when proposal+roadmap do.
replace_once(
    'js/ai-document-daily-plan.js',
    """        var migrated = _migrateRecord(r);
        if (migrated !== r || (migrated && !migrated.baseDate)) changed = true;
        return migrated;""",
    """        var migrated = _migrateRecord(r);
        if (migrated !== r) changed = true;
        return migrated;""",
)
sub_once(
    'js/ai-document-daily-plan.js',
    r"  function _migrateRecord\(record\) \{[\s\S]*?\n  \}\n\n  function saveRoadmap",
    """  function _migrateRecord(record) {
    if (!record || typeof record !== 'object') return record;
    var cursor = record.cursor && typeof record.cursor === 'object' ? record.cursor : {};
    if (record.baseDate && cursor.lastAppliedDaysCount !== undefined && cursor.lastAppliedStartDate !== undefined) return record;
    var migrated = Object.assign({}, record);
    var nextWk = Number.isInteger(cursor.nextWeek) && cursor.nextWeek >= 0 ? cursor.nextWeek : 0;
    var parsedWindow = Number(cursor.lastDaysCount);
    var legacyWindowSize = Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 7;
    var lastStart = typeof cursor.lastStartDate === 'string' && cursor.lastStartDate ? cursor.lastStartDate : null;
    var baseDate;
    if (lastStart && nextWk > 0) baseDate = _addDays(lastStart, -((nextWk - 1) * legacyWindowSize));
    else if (lastStart) baseDate = lastStart;
    else if (record.createdAt) {
      var created = new Date(record.createdAt);
      baseDate = Number.isNaN(created.getTime()) ? _today() : created.toISOString().slice(0, 10);
    } else baseDate = _today();
    var cumulativeDays = nextWk * legacyWindowSize;
    migrated.baseDate = baseDate;
    migrated.cursor = {
      nextWeek: nextWk,
      lastAppliedStartDate: nextWk > 0 ? (lastStart || _addDays(baseDate, Math.max(0, cumulativeDays - legacyWindowSize))) : null,
      lastAppliedDaysCount: cumulativeDays,
    };
    migrated.updatedAt = record.updatedAt || Date.now();
    return migrated;
  }

  function saveRoadmap""",
)
sub_once(
    'js/ai-document-daily-plan.js',
    r"    // Create pending cursor for initial proposal — Apply must advance cursor\.\n    var initialDaysCount = \(json\.meta && typeof json\.meta\.daysGenerated === 'number'\) \? json\.meta\.daysGenerated : 7;\n    var proposalId = 'proposal_doc_' \+ Date\.now\(\) \+ '_' \+ Math\.random\(\)\.toString\(36\)\.slice\(2, 8\);\n    if \(json\.proposal && typeof json\.proposal === 'object'\) \{\n      json\.proposal\.id = proposalId;\n    \}\n    _pendingCursor = \{[\s\S]*?\n    _pendingCursorProposalId = proposalId;",
    """    // Create pending cursor for initial proposal — Apply must advance cursor.
    var initialDaysCount = (json.meta && typeof json.meta.daysGenerated === 'number') ? json.meta.daysGenerated : 7;
    if (roadmapId && json.proposal && typeof json.proposal === 'object') {
      var proposalId = (typeof json.proposal.id === 'string' && json.proposal.id) ? json.proposal.id : 'proposal_doc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      json.proposal.id = proposalId;
      _pendingCursor = {
        proposalId: proposalId, source: 'document-daily-plan', roadmapId: roadmapId,
        fromCursor: { nextWeek: 0, lastAppliedStartDate: null, lastAppliedDaysCount: 0 },
        toCursor: { nextWeek: 1, lastAppliedStartDate: baseDate, lastAppliedDaysCount: initialDaysCount },
        createdAt: Date.now(),
      };
      _pendingCursorProposalId = proposalId;
    } else {
      _pendingCursor = null; _pendingCursorProposalId = null;
    }""",
)

# 7) Review runtime: correct source field and stricter full-success check.
replace_once('js/ai-agent-runtime.js',
    "const _cursorSource = _reviewState && _reviewState.source ? _reviewState.source : null;",
    "const _cursorSource = _reviewState && (_reviewState._source || _reviewState.source) ? (_reviewState._source || _reviewState.source) : null;")
replace_once('js/ai-agent-runtime.js',
    "var _allSucceeded = failed.length === 0 && skipped.length === 0;",
    "var _allSucceeded = failed.length === 0 && skipped.length === 0 && applied.length === selectedProposal.actions.length;")

# 8) Load generated contracts before AI lazy modules and precache it.
app = read('app.html')
script_tag = '  <script src="js/ai-tool-contracts.generated.min.js?v=1"></script>\n'
if script_tag not in app:
    marker = '  <script src="js/app.min.js?v=225"></script>'
    if marker not in app: raise RuntimeError('app.html app marker missing')
    app = app.replace(marker, script_tag + marker, 1)
    write('app.html', app)

sw = read('sw.js').replace("const CACHE = 'taskflow-v292';", "const CACHE = 'taskflow-v293';", 1)
asset = "  './js/ai-tool-contracts.generated.min.js',\n"
if asset not in sw:
    marker = "  './js/ai-tools.min.js',\n"
    if marker not in sw: raise RuntimeError('sw.js ai-tools marker missing')
    sw = sw.replace(marker, asset + marker, 1)
write('sw.js', sw)
for test_path in (ROOT / 'tests').glob('*.test.mjs'):
    raw = test_path.read_bytes()
    if b'taskflow-v292' in raw:
        # Byte-level swap: preserves each file's native line endings exactly.
        test_path.write_bytes(raw.replace(b'taskflow-v292', b'taskflow-v293'))

# 9) Make contract generation a real CI gate.
ci = read('.github/workflows/ci.yml')
check_step = """      - name: Canonical AI tool contracts up to date
        run: node scripts/generate-ai-tool-contracts.mjs --check

"""
if 'Canonical AI tool contracts up to date' not in ci:
    marker = '      - name: Minified assets up to date (P1.2 opt#1)\n'
    if marker not in ci: raise RuntimeError('CI minified-assets marker missing')
    write('.github/workflows/ci.yml', ci.replace(marker, check_step + marker, 1))

# 10) Executable regression tests for the exact production regressions.
(ROOT / 'tests' / 'phase6-2-hotfix-regressions.test.mjs').write_bytes((r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const contracts = require(join(ROOT, 'server', 'ai-tool-contracts.js'));

test('get_tasks canonical output accepts nullables and rejects extra nested fields', () => {
  const valid = { tasks: [{ uid:'task-1', text:'GPIO', done:false, deadline:null, scheduledDate:'2026-08-25', duration:null }], total:1 };
  assert.equal(contracts.validateToolResult('get_tasks', valid).ok, true);
  assert.equal(contracts.validateToolResult('get_tasks', { ...valid, tasks:[{ ...valid.tasks[0], password:'secret' }] }).ok, false);
});

test('proposal result envelope preserves success and permits safe failure', () => {
  assert.equal(contracts.validateToolResult('propose_complete_task', { ok:true, proposal:{ summary:'done', actions:[] } }).ok, true);
  assert.equal(contracts.validateToolResult('propose_complete_task', { ok:false, code:'stale-task' }).ok, true);
});

test('invalid calendar dates are rejected by deep result validator', () => {
  const result = contracts.validateToolResult('get_free_time', { busy:[{ date:'2026-99-99', startMs:1, endMs:2, source:'gcal' }], startDate:'2026-08-24', daysCount:1 });
  assert.equal(result.ok, false);
});

test('browser task sanitizer emits exact canonical fields including scheduledDate', () => {
  const brainClient = require(join(ROOT, 'js', 'ai-brain-client.js'));
  const out = brainClient._sanitizeToolResult('get_tasks', { tasks:[{ uid:'task-1', text:'GPIO', done:false, deadline:null, scheduledDate:'2026-08-25', duration:null, priority:1, projectId:'p1', password:'secret' }], total:1 });
  assert.deepEqual(Object.keys(out.tasks[0]).sort(), ['deadline','done','duration','scheduledDate','text','uid'].sort());
  assert.equal(contracts.validateToolResult('get_tasks', out).ok, true);
});

test('generated browser contracts drive propose_create_task argument validation', () => {
  globalThis.window = globalThis;
  globalThis.TaskFlowAIToolContracts = require(join(ROOT, 'js', 'ai-tool-contracts.generated.js'));
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-tools.js'))];
  const tools = require(join(ROOT, 'js', 'ai-tools.js'));
  assert.ok(tools.getTool('propose_create_task').inputSchema.properties.projectId);
  assert.equal(tools.validateArgs('propose_create_task', { text:'API', projectId:'p1' }).ok, true);
});

test('get_free_time reads canonical TaskFlowTimeBlocks blocks store', async () => {
  globalThis.window = globalThis;
  globalThis.TaskFlowAIToolContracts = require(join(ROOT, 'js', 'ai-tool-contracts.generated.js'));
  globalThis.TaskFlowGCal = null;
  globalThis.TaskFlowTimeBlocks = { loadTimeBlocks: () => ({ version:1, blocks:[
    { id:'b1', date:'2026-08-25', start:'09:00', end:'10:00', status:'planned' },
    { id:'b2', date:'2026-08-25', start:'11:00', end:'12:00', status:'cancelled' },
  ] }) };
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-tools.js'))];
  const tools = require(join(ROOT, 'js', 'ai-tools.js'));
  const result = await tools.getTool('get_free_time').execute({ startDate:'2026-08-25', daysCount:1 });
  assert.equal(result.busy.length, 1);
  assert.equal(result.busy[0].source, 'taskflow');
  assert.equal(contracts.validateToolResult('get_free_time', result).ok, true);
});

test('legacy roadmap migration persists and is idempotent', () => {
  const store = new Map();
  globalThis.window = globalThis; globalThis.Sync = { getUserId: () => 'hotfix-user' };
  globalThis.localStorage = { getItem:k => store.has(k) ? store.get(k) : null, setItem:(k,v) => store.set(k,String(v)), removeItem:k => store.delete(k) };
  delete require.cache[require.resolve(join(ROOT, 'js', 'ai-document-daily-plan.js'))];
  const planner = require(join(ROOT, 'js', 'ai-document-daily-plan.js'));
  const key = 'taskflow-document-roadmaps:hotfix-user';
  store.set(key, JSON.stringify({ version:1, activeRoadmapId:'r1', roadmaps:[{ id:'r1', createdAt:new Date('2026-08-01T00:00:00Z').getTime(), cursor:{ nextWeek:3, lastStartDate:'2026-09-15', lastDaysCount:7 }, roadmap:{ title:'Embedded', totalWeeks:40 } }] }));
  const first = planner.loadStore();
  assert.equal(first.version, 2); assert.equal(first.roadmaps[0].baseDate, '2026-09-01'); assert.equal(first.roadmaps[0].cursor.lastAppliedDaysCount, 21);
  const persisted = JSON.parse(store.get(key)); assert.equal(persisted.version, 2); assert.equal(persisted.roadmaps[0].baseDate, '2026-09-01');
  const before = store.get(key); planner.loadStore(); assert.equal(store.get(key), before);
});

test('CI contract gate and generated browser boot asset are present', () => {
  const ci = readFileSync(join(ROOT,'.github','workflows','ci.yml'),'utf8');
  const html = readFileSync(join(ROOT,'app.html'),'utf8');
  const sw = readFileSync(join(ROOT,'sw.js'),'utf8');
  assert.match(ci,/generate-ai-tool-contracts\.mjs --check/); assert.match(html,/ai-tool-contracts\.generated\.min\.js\?v=1/); assert.match(sw,/ai-tool-contracts\.generated\.min\.js/);
});
''').encode('utf-8'))

print('Phase 6.2 direct hotfix patches applied.')
