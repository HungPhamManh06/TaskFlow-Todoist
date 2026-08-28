#!/usr/bin/env python3
"""Phase 12.1 E2E -- Canonical Task Mutation Layer

Scenario A -- Quick Add: valid UID, no ghost tasks
Scenario B -- Complete: done state persists
Scenario C -- Recurrence dedup: materializeRecurrence idempotent
Scenario D -- Move: UID preserved
Scenario E -- Atomic rollback: no half-state on failure
Scenario F -- normalizeTask UID: always produces valid UID

Usage: python scripts/e2e-task-mutations.py
"""
import http.server
import json
import mimetypes
import os
import socketserver
import sys
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

CLEAN_URLS = {
    '/app': 'app.html',
    '/privacy': 'privacy.html',
    '/terms': 'terms.html',
    '/data-and-security': 'data-and-security.html',
}

API_CALLS = []


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)

    def _send(self, body, ctype, status=200, extra=None):
        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/sw.js':
            self._send(b'/* SW stub */', 'application/javascript', 200)
            return
        if path == '/':
            path = '/app.html'
        clean = CLEAN_URLS.get(path, path.lstrip('/'))
        fpath = os.path.join(ROOT, clean)
        if not os.path.isfile(fpath):
            self._send(b'Not found', 'text/plain', 404)
            return
        ctype = mimetypes.guess_type(fpath)[0] or 'application/octet-stream'
        with open(fpath, 'rb') as f:
            data = f.read()
        self._send(data, ctype)

    def do_POST(self):
        path = urlsplit(self.path).path
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else b''
        API_CALLS.append({'path': path, 'body': body})
        if '/api/ai/' in path:
            self._send(json.dumps({'ok': True, 'reply': 'stub'}).encode(), 'application/json')
        else:
            self._send(json.dumps({'ok': True}).encode(), 'application/json')


def _start_server(port):
    httpd = socketserver.TCPServer(('127.0.0.1', port), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def _open_week_page(page, base):
    """Navigate to week view and wait for TaskStore to load."""
    page.goto(f"{base}/app.html?view=week", wait_until='networkidle')
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="week-view"]', state='visible', timeout=10000)
    # Wait for TaskStore to be available
    page.wait_for_function("() => window.TaskFlowTaskStore && window.TaskFlowTaskStore.create", timeout=10000)


def _seed_tasks(page, num_tasks=5):
    """Seed N tasks into today's day via localStorage init script."""
    page.add_init_script(f"""(() => {{
      localStorage.setItem('planner-onboarded', '1');
      if (localStorage.getItem('task-mut-seeded')) return;
      localStorage.setItem('task-mut-seeded', '1');
      const now = new Date();
      const year = now.getFullYear(), month = now.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      let state;
      try {{ state = JSON.parse(localStorage.getItem(key) || 'null'); }} catch (e) {{ state = null; }}
      if (!state) state = {{ version: 1, weeks: [], pillars: [], habits: [] }};
      state.monthKey = key; state.schemaVersion = 2;
      if (!Array.isArray(state.monthlyGoals)) state.monthlyGoals = [];
      if (!Array.isArray(state.habits)) state.habits = [];
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const numWeeks = Math.ceil((offset + daysInMonth) / 7);
      state.weeks = [];
      for (let w = 0; w < numWeeks; w++) {{
        const days = [];
        for (let d = 0; d < 7; d++) days.push({{ tasks: [] }});
        state.weeks.push({{ n: w + 1, goals: [], days }});
      }}
      const planStart = new Date(year, month, 1 - offset);
      const today = new Date(year, month, now.getDate());
      const delta = Math.floor((today - planStart) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      state.weeks[week].days[day].tasks = Array.from({{ length: {num_tasks} }}, (_, i) => ({{
        uid: 'mut-seed-' + (i + 1),
        kind: 'regular',
        done: false,
        text: 'Mutation Task ' + (i + 1),
        duration: 15 + (i * 5),
      }}));
      localStorage.setItem(key, JSON.stringify(state));
    }})()""")


def scenario_a_quick_add(page, base, errors):
    """Quick Add creates exactly one task with valid UID."""
    _seed_tasks(page, 3)
    _open_week_page(page, base)

    # Quick Add
    add_btn = page.locator('[data-action="shell-add-task"]')
    add_btn.first.scroll_into_view_if_needed()
    add_btn.first.click()
    page.wait_for_selector('[data-testid="quick-add"]:visible', state='visible')
    page.locator('#quickAddInput').fill('E2E Mutation Task')
    page.locator('#quickAddDur').fill('20')
    page.locator('[data-action="quickadd-do"]').click()
    page.wait_for_selector('[data-testid="quick-add"]:visible', state='detached')
    page.wait_for_timeout(500)

    # Verify task appears in DOM
    matched = page.locator('.task-row', has_text='E2E Mutation Task')
    assert matched.count() == 1, f"Expected exactly 1 'E2E Mutation Task' row, got {matched.count()}"

    # Verify data has valid UIDs
    data_check = page.evaluate("""(() => {
      const n = new Date();
      const year = n.getFullYear(), month = n.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const planStart = new Date(year, month, 1 - offset);
      const delta = Math.floor((n - planStart) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      const tasks = state.weeks[week].days[day].tasks;
      const ghostTasks = tasks.filter(t => !t.uid);
      return { total: tasks.length, ghosts: ghostTasks.length };
    })()""")
    assert data_check['ghosts'] == 0, f"Found {data_check['ghosts']} ghost tasks (uid=null)"
    assert data_check['total'] == 4, f"Expected 4 tasks in data, got {data_check['total']}"
    print("  PASS Scenario A")


def scenario_b_complete(page, base, errors):
    """Complete toggles done state and persists."""
    _seed_tasks(page, 2)
    _open_week_page(page, base)

    # Complete first task via checkbox
    first_check = page.locator('[data-action="task"]').first
    first_check.scroll_into_view_if_needed()
    first_check.click()
    page.wait_for_timeout(500)

    # Verify done state in data
    done_check = page.evaluate("""(() => {
      const n = new Date();
      const year = n.getFullYear(), month = n.getMonth();
      const key = 'planner-' + year + '-' + (month + 1);
      const state = JSON.parse(localStorage.getItem(key) || 'null');
      const first = new Date(year, month, 1);
      const offset = (first.getDay() + 6) % 7;
      const planStart = new Date(year, month, 1 - offset);
      const delta = Math.floor((n - planStart) / 86400000);
      const week = Math.floor(delta / 7), day = delta % 7;
      const tasks = state.weeks[week].days[day].tasks;
      return tasks.map(t => ({ uid: t.uid, done: t.done }));
    })()""")
    done_count = sum(1 for t in done_check if t['done'])
    assert done_count == 1, f"Expected exactly 1 completed task, got {done_count}"
    print("  PASS Scenario B")


def scenario_c_repeat_carry(page, base, errors):
    """Verify materializeRecurrence dedup via TaskStore API in browser."""
    _seed_tasks(page, 1)
    _open_week_page(page, base)

    dedup_check = page.evaluate("""(() => {
      const TTS = window.TaskFlowTaskStore;
      if (!TTS || !TTS.materializeRecurrence) return { error: 'TaskStore missing' };
      const source = TTS.normalizeTask({ text: 'Recurring Test', repeat: { freq: 'daily', every: 1 } });
      const arr = [];
      const first = TTS.materializeRecurrence(source, arr, { operationId: 'test-1' });
      if (!first) return { error: 'first materialize failed' };
      const second = TTS.materializeRecurrence(source, arr, { operationId: 'test-1' });
      const third = TTS.materializeRecurrence(source, arr, { operationId: 'test-2' });
      return {
        firstOk: !!first,
        secondSkipped: second === null || second === undefined,
        thirdSkipped: third === null || third === undefined,
        totalInArray: arr.length,
      };
    })()""")
    assert dedup_check.get('firstOk') == True, f"First materialize must succeed: {dedup_check}"
    assert dedup_check.get('secondSkipped') == True, f"Duplicate operationId must be skipped: {dedup_check}"
    assert dedup_check.get('thirdSkipped') == True, f"Same series must be skipped: {dedup_check}"
    assert dedup_check.get('totalInArray') == 1, f"Expected exactly 1 task, got {dedup_check.get('totalInArray')}"
    print("  PASS Scenario C")


def scenario_d_move(page, base, errors):
    """Verify move preserves UID and creates no duplicates."""
    _seed_tasks(page, 2)
    _open_week_page(page, base)

    move_check = page.evaluate("""(() => {
      const TTS = window.TaskFlowTaskStore;
      if (!TTS || !TTS.move) return { error: 'TaskStore missing' };
      const src = [{ uid: 'm1', text: 'Move Me', done: false }];
      const dst = [];
      const result = TTS.move(src, dst, 0);
      return {
        ok: result.ok,
        srcLen: src.length,
        dstLen: dst.length,
        uidPreserved: result.task && result.task.uid === 'm1',
        textPreserved: result.task && result.task.text === 'Move Me',
      };
    })()""")
    assert move_check.get('ok') == True, f"Move must succeed: {move_check}"
    assert move_check.get('srcLen') == 0, f"Source must be empty after move: {move_check}"
    assert move_check.get('dstLen') == 1, f"Destination must have 1 task: {move_check}"
    assert move_check.get('uidPreserved') == True, f"UID must be preserved: {move_check}"
    assert move_check.get('textPreserved') == True, f"Text must be preserved: {move_check}"
    print("  PASS Scenario D")


def scenario_e_atomic_rollback(page, base, errors):
    """Verify TaskStore atomicTransaction rollback."""
    _seed_tasks(page, 1)
    _open_week_page(page, base)

    result = page.evaluate("""(() => {
      const TTS = window.TaskFlowTaskStore;
      if (!TTS || !TTS.atomicTransaction) return { error: 'TaskStore missing or no atomicTransaction' };
      const arr = [];
      const ok = TTS.atomicTransaction([arr], () => {
        TTS.create(arr, { text: 'Atomic A' });
        TTS.create(arr, { text: 'Atomic B' });
      });
      const countAfterOk = arr.length;
      const fail = TTS.atomicTransaction([arr], () => {
        TTS.create(arr, { text: 'Atomic C' });
        throw new Error('test-rollback');
      });
      const countAfterFail = arr.length;
      return {
        okSuccess: ok.ok,
        countAfterOk: countAfterOk,
        okFail: fail.ok,
        countAfterFail: countAfterFail,
        error: fail.error,
      };
    })()""")

    assert result.get('okSuccess') == True, f"atomicTransaction success failed: {result}"
    assert result.get('countAfterOk') == 2, f"Expected 2 tasks after success, got {result.get('countAfterOk')}"
    assert result.get('okFail') == False, f"atomicTransaction should return ok:false on error"
    assert result.get('countAfterFail') == 2, \
        f"Expected 2 tasks after rollback (no half-state), got {result.get('countAfterFail')}"
    print("  PASS Scenario E")


def scenario_f_normalize_uid(page, base, errors):
    """Every task from normalizeTask has a valid UID."""
    _seed_tasks(page, 1)
    _open_week_page(page, base)

    result = page.evaluate("""(() => {
      const TTS = window.TaskFlowTaskStore;
      if (!TTS || !TTS.normalizeTask) return { error: 'TaskStore missing' };
      const t1 = TTS.normalizeTask({ text: 'minimal' });
      const t2 = TTS.normalizeTask({});
      const t3 = TTS.normalizeTask({ uid: 'my-uid', text: 'with uid' });
      const t4 = TTS.normalizeTask(null);
      return {
        t1hasUid: !!t1.uid,
        t2hasUid: !!t2.uid,
        t3hasUid: !!t3.uid,
        t3sameUid: t3.uid === 'my-uid',
        t4isNull: t4 === null,
      };
    })()""")

    assert result.get('error') is None, f"TaskStore error: {result}"
    assert result.get('t1hasUid') == True, "Minimal input must produce valid UID"
    assert result.get('t2hasUid') == True, "Empty input must produce valid UID"
    assert result.get('t3hasUid') == True, "Input with uid must preserve it"
    assert result.get('t3sameUid') == True, "Supplied uid must be preserved"
    assert result.get('t4isNull') == True, "null input must return null"
    print("  PASS Scenario F")


def main():
    PORT = 18888
    httpd = _start_server(PORT)
    base = f'http://127.0.0.1:{PORT}'
    errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)

            for name, fn in [
                ("A -- Quick Add", scenario_a_quick_add),
                ("B -- Complete", scenario_b_complete),
                ("C -- Recurrence dedup", scenario_c_repeat_carry),
                ("D -- Move", scenario_d_move),
                ("E -- Atomic rollback", scenario_e_atomic_rollback),
                ("F -- normalizeTask UID", scenario_f_normalize_uid),
            ]:
                print(f"Scenario {name}")
                page = browser.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                try:
                    fn(page, base, errors)
                except AssertionError as e:
                    print(f"  FAIL Scenario {name}: {e}")
                    sys.exit(1)
                finally:
                    page.close()

            browser.close()

        if errors:
            print(f"\nWARN Page errors ({len(errors)}):")
            for e in errors[:5]:
                print(f"  {e}")

        print("\nALL task mutation E2E scenarios passed")

    except AssertionError as e:
        print(f"\nE2E FAILED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\nE2E ERROR: {e}")
        sys.exit(1)
    finally:
        httpd.shutdown()


if __name__ == '__main__':
    main()
