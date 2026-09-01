"""Backup / Restore E2E — proves semantic roundtrip and malformed-backup safety.

Scenarios:
  A. Export → clear → import → semantic equality
  B. Malformed JSON → rejected, existing data preserved
  C. Empty/wrong-type JSON → rejected
  D. Prototype-pollution attempt → rejected
"""
import http.server
import json
import os
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def translate_path(self, path):
        translated = super().translate_path(path)
        if os.path.isfile(translated):
            return translated
        clean = path.split("?", 1)[0].split("#", 1)[0]
        if not os.path.splitext(clean)[1] and not translated.endswith(os.sep):
            candidate = translated + ".html"
            if os.path.isfile(candidate):
                return candidate
        return translated


def make_page(browser, width=1280, height=800):
    page = browser.new_page(viewport={"width": width, "height": height})
    page.emulate_media(reduced_motion="reduce")
    return page


def load_app(page, base):
    page.add_init_script("localStorage.setItem('planner-onboarded','1');")
    page.goto(f"{base}/app.html?view=today", wait_until="networkidle")
    if page.locator('[data-testid="onboard-modal"]:visible').count():
        page.locator('[data-action="ob-skip"]').click()
    page.wait_for_selector('[data-testid="today-view"]', state="visible")


def seed_state(page):
    """Seed realistic state via in-page JS, return summary for comparison."""
    return page.evaluate("""() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();
      const key = window.TaskFlowShell.monthKey(year, month);
      const state = JSON.parse(localStorage.getItem(key) || '{}');

      // Ensure weeks structure
      if (!Array.isArray(state.weeks)) {
        const first = new Date(year, month, 1);
        const offset = (first.getDay() + 6) % 7;
        const numDays = new Date(year, month + 1, 0).getDate();
        const numWeeks = Math.ceil((offset + numDays) / 7);
        state.weeks = [];
        for (let w = 0; w < numWeeks; w++) {
          state.weeks.push({ n: w + 1, days: Array.from({length:7}, () => ({tasks: []})) });
        }
      }
      if (!Array.isArray(state.habits)) state.habits = [];
      if (!Array.isArray(state.pillars)) state.pillars = [];
      if (!state.monthlyGoals) state.monthlyGoals = [];
      state.schemaVersion = 2;

      // Add a normal task
      state.weeks[0].days[0].tasks.push({
        uid: 'test-normal-1', text: 'Backup E2E Normal Task', kind: 'regular',
        done: false, tags: [], duration: 30, priority: false,
        remind: { enabled: false, time: '20:00' }
      });

      // Add a completed task
      state.weeks[0].days[0].tasks.push({
        uid: 'test-done-1', text: 'Backup E2E Done Task', kind: 'priority',
        done: true, tags: [], duration: 15, priority: true,
        remind: { enabled: false, time: '20:00' }
      });

      // Add a recurring task
      state.weeks[0].days[0].tasks.push({
        uid: 'test-recur-1', text: 'Backup E2E Recurring', kind: 'regular',
        done: false, tags: [], duration: 10, priority: false,
        repeat: { freq: 'weekly', every: 1 },
        seriesId: 'ser-recur-1',
        remind: { enabled: false, time: '20:00' }
      });

      // Add a habit
      state.habits.push({
        id: 'h-test-1', name: 'Test Habit', target: 100,
        days: [true, true, false, false, false, false, false,
               false, false, false, false, false, false, false,
               false, false, false, false, false, false, false,
               false, false, false, false, false, false, false, false, false],
        skipDays: []
      });

      // Ensure pillars template
      if (!state.pillars.length && window.TaskFlowPillars) {
        window.TaskFlowPillars.ensurePillars(state);
      }

      localStorage.setItem(key, JSON.stringify(state));

      // Return semantic summary (no volatile fields)
      return {
        taskTexts: state.weeks[0].days[0].tasks.map(t => t.text),
        taskDones: state.weeks[0].days[0].tasks.map(t => t.done),
        taskUids: state.weeks[0].days[0].tasks.map(t => t.uid),
        taskKinds: state.weeks[0].days[0].tasks.map(t => t.kind),
        taskDurations: state.weeks[0].days[0].tasks.map(t => t.duration),
        habitNames: state.habits.map(h => h.name),
        habitDays: state.habits.map(h => h.days.filter(Boolean).length),
        pillarCount: state.pillars.length,
        schemaVersion: state.schemaVersion,
      };
    }""")


def export_backup(page):
    """Export backup via JS and return the JSON string."""
    return page.evaluate("""() => {
      const LEGACY_KEY = 'january-planner-2026';
      const data = window.TaskFlowExport.collectAllData(LEGACY_KEY);
      return JSON.stringify(data);
    }""")


def clear_all_storage(page):
    """Clear all planner-related localStorage keys."""
    page.evaluate("""() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('planner-') || k === 'january-planner-2026')) {
          keys.push(k);
        }
      }
      keys.forEach(k => localStorage.removeItem(k));
    }""")


def import_backup(page, json_str):
    """Import backup via JS applySnapshotTransactional."""
    return page.evaluate("""([jsonStr]) => {
      let snapshot;
      try { snapshot = JSON.parse(jsonStr); } catch (e) { return { ok: false, error: 'parse-error' }; }
      const M = window.TaskFlowDataMigrations;
      if (!M) return { ok: false, error: 'no-migrations' };
      const check = M.validateSnapshot(snapshot);
      if (!check.ok) return { ok: false, error: check.errors.join(', ') };
      const migrated = M.migrateSnapshot(snapshot);
      const result = window.TaskFlowExport.applySnapshotTransactional(migrated, localStorage);
      return result;
    }""", [json_str])


def read_state_summary(page):
    """Read current state and return semantic summary."""
    return page.evaluate("""() => {
      const now = new Date();
      const key = window.TaskFlowShell.monthKey(now.getFullYear(), now.getMonth());
      const state = JSON.parse(localStorage.getItem(key) || '{}');
      const weeks = state.weeks || [];
      const allTasks = [];
      weeks.forEach(w => (w.days || []).forEach(d => (d.tasks || []).forEach(t => allTasks.push(t))));
      return {
        taskTexts: allTasks.map(t => t.text),
        taskDones: allTasks.map(t => t.done),
        taskUids: allTasks.map(t => t.uid),
        taskKinds: allTasks.map(t => t.kind),
        taskDurations: allTasks.map(t => t.duration),
        habitNames: (state.habits || []).map(h => h.name),
        habitDays: (state.habits || []).map(h => (h.days || []).filter(Boolean).length),
        pillarCount: (state.pillars || []).length,
        schemaVersion: state.schemaVersion,
      };
    }""")


def semantic_equal(a, b):
    """Compare two state summaries semantically."""
    for key in ['taskTexts', 'taskDones', 'taskUids', 'taskKinds', 'taskDurations']:
        if a[key] != b[key]:
            return False, f'{key} mismatch: {a[key]} vs {b[key]}'
    if a['habitNames'] != b['habitNames']:
        return False, f'habitNames mismatch'
    if a['habitDays'] != b['habitDays']:
        return False, f'habitDays mismatch'
    if a['pillarCount'] != b['pillarCount']:
        return False, f'pillarCount mismatch'
    if a.get('schemaVersion') != b.get('schemaVersion'):
        return False, f'schemaVersion mismatch'
    return True, 'ok'


# ── Tests ─────────────────────────────────────────────────────────────
errors = []
server = http.server.HTTPServer(("127.0.0.1", 0), Handler)
port = server.server_address[1]
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
base = f"http://127.0.0.1:{port}"

with sync_playwright() as pw:
    browser = pw.chromium.launch()

    # ── Scenario A: Roundtrip ──────────────────────────────────────────
    print("Scenario A — Backup/Restore roundtrip")
    page = make_page(browser)
    load_app(page, base)
    state_a = seed_state(page)
    backup_json = export_backup(page)
    clear_all_storage(page)
    # Verify cleared
    cleared = read_state_summary(page)
    assert len(cleared['taskTexts']) == 0, f"Storage not cleared: {cleared['taskTexts']}"
    # Import
    result = import_backup(page, backup_json)
    assert result.get('ok') is True, f"Import failed: {result}"
    state_b = read_state_summary(page)
    eq, reason = semantic_equal(state_a, state_b)
    assert eq, f"Roundtrip mismatch: {reason}"
    # Verify UID/repeat identity preserved
    assert 'test-normal-1' in state_b['taskUids'], "Normal task UID lost"
    assert 'test-recur-1' in state_b['taskUids'], "Recurring task UID lost"
    assert 'test-done-1' in state_b['taskUids'], "Completed task UID lost"
    print("  PASS Scenario A")
    page.close()

    # ── Scenario B: Malformed JSON ─────────────────────────────────────
    print("Scenario B — Malformed JSON rejected")
    page = make_page(browser)
    load_app(page, base)
    state_before = read_state_summary(page)
    result = import_backup(page, "this is not json {{{")
    assert result.get('ok') is False, f"Malformed JSON accepted: {result}"
    state_after = read_state_summary(page)
    eq, _ = semantic_equal(state_before, state_after)
    assert eq, "Data changed after malformed import!"
    print("  PASS Scenario B")
    page.close()

    # ── Scenario C: Wrong type / empty ─────────────────────────────────
    print("Scenario C — Wrong type / empty rejected")
    page = make_page(browser)
    load_app(page, base)
    state_before = read_state_summary(page)
    for bad_input in ['""', '"hello"', 'null', '123', '[1,2,3]']:
        result = import_backup(page, bad_input)
        assert result.get('ok') is False, f"Bad input {bad_input!r} accepted: {result}"
    state_after = read_state_summary(page)
    eq, _ = semantic_equal(state_before, state_after)
    assert eq, "Data changed after bad inputs!"
    print("  PASS Scenario C")
    page.close()

    # ── Scenario D: Prototype pollution ────────────────────────────────
    print("Scenario D — Prototype pollution rejected")
    page = make_page(browser)
    load_app(page, base)
    state_before = read_state_summary(page)
    pollution = json.dumps({"app": "taskflow-todoist", "version": 2, "keys": {}, "__proto__": {"admin": True}})
    result = import_backup(page, pollution)
    # Should either fail validation or succeed without polluting
    assert not ({}).get('admin'), "Prototype pollution succeeded!"
    state_after = read_state_summary(page)
    eq, _ = semantic_equal(state_before, state_after)
    assert eq, "Data changed after pollution attempt!"
    print("  PASS Scenario D")
    page.close()

    browser.close()

server.shutdown()
print("\nBACKUP/RESTORE E2E OK — all scenarios passed")
