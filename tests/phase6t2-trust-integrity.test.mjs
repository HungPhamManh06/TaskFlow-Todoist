/**
 * Phase 6T.2 — Final Review/Edit & Undo Integrity Tests
 *
 * Deterministic, no live Gemini calls.
 * Tests ai-review fixes (date validation, reschedule contract, Chinese text fix),
 * edit flow contracts, and TimeBlock undo integration.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const review = require('../js/ai-review.js');

// ====================================================================
// 1. STRICT DATE VALIDATION
// ====================================================================

describe('6T.2: Strict date validation', () => {
  it('rejects 2026-02-30', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2026-02-30' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('rejects 2026-04-31', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2026-04-31' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('rejects 2026-13-01', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2026-13-01' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('rejects 2026-00-10', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2026-00-10' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('accepts leap day 2028-02-29', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2028-02-29' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, true);
  });

  it('rejects 2026-02-29 (non-leap)', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2026-02-29' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('rejects 2019-01-01 (before 2020)', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2019-01-01' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-date'));
  });

  it('accepts 2099-12-31', () => {
    const r = review.validateReviewDraft(
      { editedFields: { date: '2099-12-31' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '10:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, true);
  });
});

// ====================================================================
// 2. RESCHEDULE EDIT CONTRACT
// ====================================================================

describe('6T.2: Reschedule edit contract', () => {
  it('reschedule_task editable fields are ["option"] only', () => {
    const fields = review.getEditableFields({ type: 'reschedule_task' });
    assert.deepEqual(fields, ['option']);
  });

  it('schedule_task editable fields are date/start/duration', () => {
    const fields = review.getEditableFields({ type: 'schedule_task' });
    assert.deepEqual(fields, ['date', 'start', 'duration']);
  });

  it('next_action is non-editable', () => {
    const fields = review.getEditableFields({ type: 'next_action' });
    assert.deepEqual(fields, []);
  });

  it('unknown type is non-editable', () => {
    const fields = review.getEditableFields({ type: 'create_task' });
    assert.deepEqual(fields, []);
  });

  it('patchAction patches reschedule option correctly', () => {
    const action = { type: 'reschedule_task', id: 'a1', taskUid: 't1', option: 'tomorrow' };
    const patched = review.patchAction(action, { option: 'inbox' });
    assert.equal(patched.option, 'inbox');
    assert.equal(patched.taskUid, 't1');
    assert.equal(patched.id, 'a1');
  });

  it('patchAction rejects unknown reschedule option', () => {
    const action = { type: 'reschedule_task', id: 'a1', taskUid: 't1', option: 'tomorrow' };
    const patched = review.patchAction(action, { option: 'unknown-option' });
    assert.equal(patched.option, 'tomorrow'); // unchanged
  });

  it('patchAction clones (does not mutate original)', () => {
    const action = { type: 'reschedule_task', id: 'a1', taskUid: 't1', option: 'tomorrow' };
    const patched = review.patchAction(action, { option: 'inbox' });
    assert.equal(action.option, 'tomorrow'); // original unchanged
    assert.notEqual(action, patched);
  });

  it('validateReviewDraft rejects unknown reschedule option', () => {
    const r = review.validateReviewDraft(
      { editedFields: { option: 'unknown' } },
      { type: 'reschedule_task', taskUid: 't1', option: 'tomorrow' },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-reschedule-option'));
  });

  it('validateReviewDraft accepts valid reschedule options', () => {
    for (const opt of ['tomorrow', 'this-week', 'inbox']) {
      const r = review.validateReviewDraft(
        { editedFields: { option: opt } },
        { type: 'reschedule_task', taskUid: 't1', option: 'tomorrow' },
        { tasks: [], timeblocks: [] }
      );
      assert.equal(r.ok, true, `option ${opt} should be valid`);
    }
  });
});

// ====================================================================
// 3. SCHEDULE EDIT CONTRACT
// ====================================================================

describe('6T.2: Schedule edit contract', () => {
  it('patchAction patches date correctly', () => {
    const action = { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 };
    const patched = review.patchAction(action, { date: '2026-08-21' });
    assert.equal(patched.date, '2026-08-21');
    assert.equal(patched.start, '09:00');
  });

  it('patchAction patches start correctly', () => {
    const action = { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 };
    const patched = review.patchAction(action, { start: '10:30' });
    assert.equal(patched.start, '10:30');
    assert.equal(patched.date, '2026-08-20');
  });

  it('patchAction patches duration correctly', () => {
    const action = { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 };
    const patched = review.patchAction(action, { duration: '45' });
    assert.equal(patched.duration, 45);
  });

  it('invalid time rejected', () => {
    const r = review.validateReviewDraft(
      { editedFields: { start: '25:00' } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-start'));
  });

  it('duration 0 rejected', () => {
    const r = review.validateReviewDraft(
      { editedFields: { duration: 0 } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-duration'));
  });

  it('duration > 480 rejected', () => {
    const r = review.validateReviewDraft(
      { editedFields: { duration: 481 } },
      { type: 'schedule_task', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 },
      { tasks: [], timeblocks: [] }
    );
    assert.equal(r.ok, false);
    assert.ok(r.errors.includes('invalid-duration'));
  });
});

// ====================================================================
// 4. ERROR COPY — NO CHINESE TEXT
// ====================================================================

describe('6T.2: Error copy', () => {
  it('Vietnamese ai-provider-unavailable contains no Chinese characters', () => {
    const msg = review.friendlyError('ai-provider-unavailable', 'vi');
    // Check for common Chinese character ranges
    assert.ok(!/[\u4e00-\u9fff]/.test(msg), 'VI error contains Chinese characters: ' + msg);
    assert.ok(msg.includes('AI'), 'VI error should mention AI');
  });

  it('English ai-provider-unavailable is clean', () => {
    const msg = review.friendlyError('ai-provider-unavailable', 'en');
    assert.ok(!/[\u4e00-\u9fff]/.test(msg), 'EN error contains Chinese characters');
    assert.ok(msg.includes('planner'), 'EN error should mention planner');
  });

  it('all VI error messages contain no Chinese characters', () => {
    const codes = ['ai-not-configured', 'ai-timeout', 'ai-rate-limited', 'ai-provider-unavailable',
      'ai-provider-auth', 'ai-provider-forbidden', 'ai-provider-bad-request', 'ai-invalid-response',
      'ai-validation-failed', 'ai-context-invalid', 'network', 'default'];
    for (const code of codes) {
      const msg = review.friendlyError(code, 'vi');
      assert.ok(!/[\u4e00-\u9fff]/.test(msg), `${code} VI contains Chinese: ${msg}`);
    }
  });
});

// ====================================================================
// 5. REVIEW MODEL INTEGRITY
// ====================================================================

describe('6T.2: Review model integrity', () => {
  it('buildReview produces correct structure', () => {
    const proposal = {
      summary: 'Plan your day',
      actions: [
        { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-22', start: '10:00', duration: 45 },
        { type: 'reschedule_task', id: 'a2', taskUid: 't2', option: 'tomorrow' },
        { type: 'next_action', id: 'a3', text: 'Check email' },
      ]
    };
    const canonical = {
      tasks: [{ uid: 't1', text: 'Write report' }, { uid: 't2', text: 'Review PR' }],
      timeblocks: []
    };
    const r = review.buildReview(proposal, canonical, { lang: 'en' });
    assert.equal(r.version, 1);
    assert.equal(r.actions.length, 3);
    assert.equal(r.actions[0].type, 'schedule_task');
    assert.equal(r.actions[0].label, 'Write report');
    assert.equal(r.actions[0].editableFields.length, 3);
    assert.equal(r.actions[1].type, 'reschedule_task');
    assert.equal(r.actions[1].editableFields.length, 1);
    assert.equal(r.actions[1].editableFields[0], 'option');
    assert.equal(r.actions[2].type, 'next_action');
    assert.equal(r.actions[2].editableFields.length, 0);
  });

  it('buildReview shows before/after for schedule', () => {
    const proposal = {
      summary: 'Plan',
      actions: [{ type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-22', start: '10:00', duration: 45 }]
    };
    const canonical = {
      tasks: [{ uid: 't1', text: 'Task' }],
      timeblocks: [{ taskUid: 't1', date: '2026-08-20', start: '09:00', end: '09:45', status: 'planned' }]
    };
    const r = review.buildReview(proposal, canonical, { lang: 'en' });
    assert.ok(r.actions[0].before.lines.length > 0, 'should have before lines');
    assert.ok(r.actions[0].after.lines.length > 0, 'should have after lines');
  });

  it('buildReview shows option label for reschedule', () => {
    const proposal = {
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', id: 'a1', taskUid: 't1', option: 'inbox' }]
    };
    const canonical = { tasks: [{ uid: 't1', text: 'Task' }], timeblocks: [] };
    const r = review.buildReview(proposal, canonical, { lang: 'en' });
    assert.ok(r.actions[0].after.lines.some(l => l.includes('Inbox')), 'should show Inbox label');
  });

  it('unknown reschedule option does not crash', () => {
    const proposal = {
      summary: 'Plan',
      actions: [{ type: 'reschedule_task', id: 'a1', taskUid: 't1', option: 'custom-thing' }]
    };
    const canonical = { tasks: [{ uid: 't1', text: 'Task' }], timeblocks: [] };
    const r = review.buildReview(proposal, canonical, { lang: 'vi' });
    assert.equal(r.actions.length, 1);
  });
});

// ====================================================================
// 6. PROPOSAL IMMUTABILITY
// ====================================================================

describe('6T.2: Proposal immutability', () => {
  it('patchAction does not mutate original', () => {
    const original = { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 };
    const originalCopy = JSON.parse(JSON.stringify(original));
    review.patchAction(original, { date: '2026-08-21', start: '10:00', duration: 45 });
    assert.deepEqual(original, originalCopy, 'original must remain unchanged');
  });

  it('patchAction returns deep clone', () => {
    const action = { type: 'schedule_task', id: 'a1', taskUid: 't1', date: '2026-08-20', start: '09:00', duration: 60 };
    const patched = review.patchAction(action, { date: '2026-08-21' });
    patched.id = 'changed';
    assert.equal(action.id, 'a1', 'original id must not change');
  });
});

// ====================================================================
// 7. RESCHEDULE_OPTIONS EXPORT
// ====================================================================

describe('6T.2: RESCHEDULE_OPTIONS exported', () => {
  it('exports correct options', () => {
    assert.deepEqual(review.RESCHEDULE_OPTIONS, ['tomorrow', 'this-week', 'inbox']);
  });
});

// ====================================================================
// 8. PRODUCTION APP.HTML — EDIT BUTTON EXISTS
// ====================================================================

describe('6T.2: Production edit support', () => {
  const APP = readFileSync('app.html', 'utf8');

  it('ai-review.min.js loaded in production', () => {
    assert.ok(APP.includes('js/ai-review.min.js'), 'ai-review.min.js should be in app.html');
  });

  it('ai-edit field uses data-edit-field in preview', () => {
    const aiJS = readFileSync('js/ai.js', 'utf8');
    assert.ok(aiJS.includes('data-action="ai-edit-field"'), 'preview should generate edit field inputs with data-action');
    assert.ok(aiJS.includes('data-action="ai-edit"'), 'preview should generate edit toggle button');
  });
});

// ====================================================================
// 9. SNAPSHOT INTEGRITY (source inspection)
// ====================================================================

describe('6T.2: Snapshot integrity (source)', () => {
  const appJS = readFileSync('js/app.js', 'utf8');

  it('snapshotAll includes timeblocks', () => {
    assert.ok(appJS.includes('timeblocks: tb'), 'snapshotAll should include timeblocks field');
    assert.ok(appJS.includes('loadTimeBlocksStore()'), 'snapshotAll should load TimeBlocks');
  });

  it('applySnapshot restores timeblocks', () => {
    assert.ok(appJS.includes('snap.timeblocks'), 'applySnapshot should check snap.timeblocks');
    assert.ok(appJS.includes('saveTimeBlocksStore(snap.timeblocks)'), 'applySnapshot should restore TimeBlocks');
  });

  it('aiApply uses _aiDraft (edited draft)', () => {
    assert.ok(appJS.includes('const proposalToApply = _aiDraft || last.proposal'), 'aiApply should use edited draft');
  });

  it('aiApply has preflight reference check', () => {
    assert.ok(appJS.includes('preflightMissing'), 'aiApply should preflight-check references');
  });

  it('aiApply revalidates before mutation', () => {
    assert.ok(appJS.includes('validateProposalLocal(proposalToApply'), 'aiApply should revalidate');
  });

  it('ai-cancel clears _aiDraft', () => {
    assert.ok(appJS.includes('_aiDraft = null'), 'cancel should clear draft');
  });

  it('ai-run resets _aiDraft', () => {
    assert.ok(appJS.includes('_aiDraft = null') && appJS.includes('_aiDraft = JSON.parse'), 'run should reset and set draft');
  });
});

// ====================================================================
// 10. VI I18N EDIT STRINGS
// ====================================================================

describe('6T.2: i18n edit strings', () => {
  const I18N = readFileSync('js/i18n.js', 'utf8');

  it('has aiEdit in VI', () => {
    assert.ok(I18N.includes("aiEdit: 'Sửa'"), 'VI aiEdit missing');
  });

  it('has aiEdit in EN', () => {
    assert.ok(I18N.includes("aiEdit: 'Edit'"), 'EN aiEdit missing');
  });

  it('has aiDone in VI', () => {
    assert.ok(I18N.includes("aiDone: 'Xong'"), 'VI aiDone missing');
  });

  it('has aiEditBlocked in VI', () => {
    assert.ok(I18N.includes("aiEditBlocked:"), 'VI aiEditBlocked missing');
  });
});

// ====================================================================
// 11. ERROR PRIVACY
// ====================================================================

describe('6T.2: Error privacy', () => {
  it('no raw provider content in error messages', () => {
    const codes = ['ai-not-configured', 'ai-timeout', 'ai-rate-limited', 'ai-provider-unavailable',
      'ai-provider-auth', 'ai-validation-failed', 'network', 'default'];
    for (const code of codes) {
      const vi = review.friendlyError(code, 'vi');
      const en = review.friendlyError(code, 'en');
      assert.ok(!vi.includes('API_KEY') && !vi.includes('system_prompt'), `VI ${code} leaks sensitive data`);
      assert.ok(!en.includes('API_KEY') && !en.includes('system_prompt'), `EN ${code} leaks sensitive data`);
    }
  });
});

// ====================================================================
// 12. BUILD REVIEW EDGE CASES
// ====================================================================

describe('6T.2: Build review edge cases', () => {
  it('handles null proposal', () => {
    const r = review.buildReview(null, { tasks: [], timeblocks: [] }, {});
    assert.equal(r.actions.length, 0);
  });

  it('handles empty actions', () => {
    const r = review.buildReview({ summary: '', actions: [] }, { tasks: [], timeblocks: [] }, {});
    assert.equal(r.actions.length, 0);
  });

  it('handles unknown action type gracefully', () => {
    const r = review.buildReview(
      { summary: '', actions: [{ type: 'unknown_type', id: 'x' }] },
      { tasks: [], timeblocks: [] },
      {}
    );
    assert.equal(r.actions.length, 1);
    assert.equal(r.actions[0].editableFields.length, 0);
  });

  it('handles missing task label', () => {
    const r = review.buildReview(
      { summary: '', actions: [{ type: 'schedule_task', id: 'a1', taskUid: 'missing', date: '2026-08-22', start: '10:00', duration: 60 }] },
      { tasks: [], timeblocks: [] },
      { lang: 'en' }
    );
    assert.equal(r.actions[0].label, 'Task'); // fallback
  });
});

console.log('Phase 6T.2 tests loaded successfully.');
