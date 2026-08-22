# Chat Multi-file Drag and Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the overlapping chatbot header controls and let users attach or drag up to five images/documents into one message, with a 15 MB per-file and 30 MB combined limit, partial acceptance, one request, and one assistant response.

**Architecture:** Replace the chat-specific close-button positioning hook, then model attachments as an in-memory client queue rendered as removable chips. Send the frozen queue as repeated multipart fields to a shared server parser used by both file routes. Keep only bounded attachment metadata in local chat history, and preserve the existing singular request/response fields during migration.

**Tech Stack:** Static HTML/CSS, vanilla JavaScript modules, Express, Busboy, Node test runner, Python/Playwright release checks.

## Global Constraints

- Work only in `C:\Users\hungv\Downloads\todoist\.worktrees\ai-chat-history-ui-redesign-v2`; preserve unrelated changes.
- Follow `docs/superpowers/specs/2026-08-22-chat-multi-file-drop-design.md` as the approved source of truth.
- Accept JPEG, PNG, WebP, PDF, plain text, and Markdown only.
- Enforce at most 5 accepted files, 15 MB per file, and 30 MB total. Reject only the invalid candidates; retain valid queued files.
- Never persist file bytes, extracted text, object URLs, or base64 payloads in local history.
- Treat uploaded document contents as untrusted data, not instructions.
- Keep legacy multipart field `file`, response property `file`, and singular history `attachment` readable during migration.
- Do not mutate the queue while a request is in flight. Clear it only after success; retain it after error or Stop.
- Use test-first RED/GREEN/refactor cycles and make the focused commit at the end of each task.

---

### Task 1: Repair Header Controls and Add the Accessible Drop-zone Shell

**Files:**
- Modify: `app.html`
- Modify: `css/styles.css`
- Modify: `js/i18n.js`
- Create: `tests/phase36-chat-multi-file-drop.test.mjs`

- [ ] **Step 1: Write failing structural and copy tests**

Add source-contract tests that require:

```js
test('chat header uses an in-flow close control', () => {
  assert.match(html, /id="chat-close"[^>]*class="[^"]*chat-close-btn/);
  assert.doesNotMatch(html, /id="chat-close"[^>]*sync-close/);
  assert.match(css, /\.chat-close-btn\s*\{/);
});

test('composer exposes a multi-file picker and drop status', () => {
  assert.match(html, /id="chat-file-input"[^>]*multiple/);
  assert.match(html, /id="chat-drop-status"[^>]*role="status"[^>]*aria-live="polite"/);
});
```

Also assert Vietnamese and English keys exist for: drop prompt, choose files, remove file, accepted count, duplicate, unsupported type, too large, too many files, and total too large.

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `node --test tests/phase36-chat-multi-file-drop.test.mjs`

Expected: FAIL because `.chat-close-btn`, `multiple`, the drop status, and copy keys do not exist.

- [ ] **Step 3: Implement the static shell**

In `app.html`:

```html
<button id="chat-close" class="chat-icon-btn chat-close-btn" type="button" aria-label="Đóng trợ lý">
  <svg aria-hidden="true"><use href="#icon-close"></use></svg>
</button>
<input id="chat-file-input" type="file" multiple hidden
  accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/markdown,.md" />
<div id="chat-drop-status" class="chat-drop-status" role="status" aria-live="polite"></div>
```

Keep `.sync-close` untouched for other dialogs. Style `.chat-close-btn` as a normal flex item with no absolute positioning. Add a non-blocking drop overlay inside the chat panel, visible only under `[data-drop-active="true"]`, and ensure the composer remains visible.

- [ ] **Step 4: Add bilingual UI strings**

Use the existing i18n namespace and interpolation convention. Copy should state the exact limits: “Tối đa 5 tệp, 15 MB mỗi tệp, tổng 30 MB.” Error text names only rejected files and reasons.

- [ ] **Step 5: Run focused tests and commit**

Run: `node --test tests/phase36-chat-multi-file-drop.test.mjs`

Expected: PASS.

Commit:

```powershell
git add app.html css/styles.css js/i18n.js tests/phase36-chat-multi-file-drop.test.mjs
git commit -m "fix(chat): separate header controls and add drop shell"
```

### Task 2: Build the Pure Attachment Queue Rules

**Files:**
- Modify: `js/chat.js`
- Modify: `tests/phase36-chat-multi-file-drop.test.mjs`

- [ ] **Step 1: Add failing table-driven queue tests**

Cover exported/test-visible pure helpers with plain file-like objects:

```js
const limits = {
  maxFiles: 5,
  maxFileBytes: 15 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024
};
const result = mergeAttachmentCandidates(current, candidates, limits);
assert.deepEqual(result.files.map(file => file.name), ['valid.png', 'notes.md']);
assert.deepEqual(result.rejected.map(item => item.code), ['unsupported-type']);
```

Test these independent cases: accepted types, case-insensitive `.md` fallback, duplicate tuple `name + size + lastModified`, per-file size, file-count limit, total-size limit, and a mixed batch that keeps valid candidates in input order.

- [ ] **Step 2: Run and confirm RED**

Run: `node --test tests/phase36-chat-multi-file-drop.test.mjs`

Expected: FAIL because the queue helpers and constants are absent.

- [ ] **Step 3: Implement deterministic helpers**

Introduce:

```js
const _FILE_MAX_FILES = 5;
const _FILE_MAX_BYTES = 15 * 1024 * 1024;
const _FILE_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

function _fileKey(file) {
  return `${file.name}\u0000${file.size}\u0000${file.lastModified || 0}`;
}

function _mergeAttachmentCandidates(current, candidates) {
  // Return { files: newArray, rejected: [{ name, code }] } without mutation.
}
```

Validation order must be stable: duplicate, unsupported type, per-file size, file count, then combined size. Existing queued files always win over new candidates.

- [ ] **Step 4: Run focused tests and commit**

Run: `node --test tests/phase36-chat-multi-file-drop.test.mjs`

Expected: PASS.

Commit:

```powershell
git add js/chat.js tests/phase36-chat-multi-file-drop.test.mjs
git commit -m "feat(chat): add bounded attachment queue rules"
```

### Task 3: Wire Picker, Drag/drop, Chips, and Request Lifecycle

**Files:**
- Modify: `app.html`
- Modify: `css/styles.css`
- Modify: `js/chat.js`
- Modify: `tests/phase36-chat-multi-file-drop.test.mjs`
- Modify: `scripts/e2e-frontend.py`

- [ ] **Step 1: Add failing client lifecycle tests**

Require an `_attachedFiles` array, object-URL map, repeated multipart `files`, drag-depth protection, removal by stable key, and frozen request snapshots. Assert `_sendWithFile` contains:

```js
const requestFiles = _attachedFiles.slice();
requestFiles.forEach(file => formData.append('files', file, file.name));
```

Add browser coverage that opens chat, injects two synthetic files through the input, removes one chip, sends the remaining file, and verifies the intercepted multipart request contains the retained filename exactly once.

- [ ] **Step 2: Run the focused unit test and confirm RED**

Run: `node --test tests/phase36-chat-multi-file-drop.test.mjs`

Expected: FAIL on single-file state and missing repeated multipart behavior.

- [ ] **Step 3: Replace single-file state with a queue**

Implement these responsibilities:

```js
let _attachedFiles = [];
const _fileObjectUrls = new Map();

function _renderFileCards() {}
function _removeAttachedFile(fileKey) {}
function _clearFileAttachments() {}
function _announceRejectedFiles(rejected) {}
```

Render compact image thumbnails and generic document chips with filename, readable size, and an individually labelled remove button. Revoke each object URL on removal, success, or teardown.

- [ ] **Step 4: Implement picker and drop interaction**

Use `dragenter`/`dragleave` depth counting so child transitions do not flash the overlay. Ignore non-file drags by checking `event.dataTransfer.types`. Prevent navigation only for file drags over the panel. On drop or input change, run the same merge helper, render accepted files, announce rejections, and reset `input.value` so selecting the same file again works after removal.

- [ ] **Step 5: Implement safe send-state behavior**

Freeze `requestFiles` at send start, disable add/remove controls while in flight, and send one multipart request. A successful response clears the same queue and object URLs. Network/provider errors and Stop restore controls but retain the queue for retry. Do not duplicate the user bubble on retry.

- [ ] **Step 6: Run focused unit and browser tests**

Run:

```powershell
node --test tests/phase36-chat-multi-file-drop.test.mjs
python scripts/e2e-frontend.py --browser chromium
```

Expected: PASS, including keyboard removal and the no-file-drag regression.

- [ ] **Step 7: Commit**

```powershell
git add app.html css/styles.css js/chat.js tests/phase36-chat-multi-file-drop.test.mjs scripts/e2e-frontend.py
git commit -m "feat(chat): support multi-file picker and drag drop"
```

### Task 4: Migrate Chat History to Bounded Attachment Metadata Arrays

**Files:**
- Modify: `js/chat-history.js`
- Modify: `js/chat.js`
- Modify: `tests/phase-chat-history-stop.test.mjs`
- Modify: `tests/phase36-chat-multi-file-drop.test.mjs`

- [ ] **Step 1: Write failing compatibility tests**

Add tests for new messages with five `attachments`, old messages containing only `attachment`, malformed/oversized arrays, and serialized output. Require normalized metadata only:

```js
{
  name: 'plan.pdf',
  type: 'application/pdf',
  size: 925000
}
```

Assert fields such as `buffer`, `text`, `data`, `url`, and `objectUrl` are dropped.

- [ ] **Step 2: Run and confirm RED**

Run:

```powershell
node --test tests/phase-chat-history-stop.test.mjs
node --test tests/phase36-chat-multi-file-drop.test.mjs
```

Expected: FAIL because history only preserves singular `attachment`.

- [ ] **Step 3: Implement normalization and backward reads**

Add a bounded `normalizeAttachments(message)` that:

- maps legacy `attachment` to a one-element array;
- accepts at most five records;
- copies only `name`, `type`, and finite non-negative `size`;
- excludes invalid entries;
- writes `attachments` for new records while continuing to read legacy data.

Update message rendering to show every normalized attachment and update `js/chat.js` to pass metadata from the frozen request queue to history.

- [ ] **Step 4: Run tests and commit**

Run the two commands from Step 2; expected PASS.

Commit:

```powershell
git add js/chat-history.js js/chat.js tests/phase-chat-history-stop.test.mjs tests/phase36-chat-multi-file-drop.test.mjs
git commit -m "feat(chat): persist bounded attachment metadata"
```

### Task 5: Add a Shared Secure Multipart Batch Parser

**Files:**
- Modify: `server/ai.js`
- Create: `tests/phase36-chat-multi-file-backend.test.mjs`
- Modify: `tests/phase6c3-backend-file-hotfix.test.mjs`
- Modify: `tests/phase6c4-provider-error-path.test.mjs`

- [ ] **Step 1: Add failing parser and validation tests**

Test exported/test-visible helpers and source contracts for:

- repeated `files` and legacy `file` fields;
- maximum 5 accepted files;
- 15 MB per-file and 30 MB total limits;
- partial rejection with stable `{ name, code }` records;
- filename sanitization and MIME/signature validation;
- one parser shared by `/file` and `/file-agent`;
- client abort, rate limit, concurrency guard, and provider error mapping remain present.

- [ ] **Step 2: Run backend-focused tests and confirm RED**

Run:

```powershell
node --test tests/phase36-chat-multi-file-backend.test.mjs
node --test tests/phase6c3-backend-file-hotfix.test.mjs tests/phase6c4-provider-error-path.test.mjs
```

Expected: new suite FAILS on `{ files: 1 }` and singular buffer state; regressions continue to pass.

- [ ] **Step 3: Extract the shared parser**

Introduce:

```js
const AI_FILE_MAX_FILES = 5;
const AI_FILE_MAX_TOTAL_BYTES = 30 * 1024 * 1024;

async function parseAiFileMultipart(req) {
  // => { message, taskflowContext, files, rejectedFiles }
}

function validateUploadedFileRecord(record) {
  // => { ok, file } or { ok: false, rejection }
}
```

Busboy must receive `req.headers`, allow enough incoming parts to report excess candidates, stop buffering a part once truncated, and never trust the claimed MIME alone. Accept only field names `file` and `files`; discard unknown file fields. Apply combined bytes incrementally and retain earlier valid files when a later candidate exceeds a limit.

- [ ] **Step 4: Preserve safe failure semantics**

Malformed multipart remains a request-level 400. Candidate-specific failures populate `rejectedFiles`. If zero valid files remain, return the existing file-validation error plus rejection details. Do not log contents or expose buffers/base64 in responses.

- [ ] **Step 5: Run focused tests and commit**

Run all commands from Step 2; expected PASS.

Commit:

```powershell
git add server/ai.js tests/phase36-chat-multi-file-backend.test.mjs tests/phase6c3-backend-file-hotfix.test.mjs tests/phase6c4-provider-error-path.test.mjs
git commit -m "feat(ai): parse secure multi-file uploads"
```

### Task 6: Compose One Multimodal `/file` Request and Compatible Response

**Files:**
- Modify: `server/ai.js`
- Modify: `tests/phase36-chat-multi-file-backend.test.mjs`
- Modify: `tests/phase6c-file-understanding.test.mjs`

- [ ] **Step 1: Write failing mixed-batch tests**

Test an image plus Markdown batch, two text documents, and partial rejection. Require:

```js
{
  file: acceptedFiles[0],
  files: acceptedFiles,
  rejectedFiles
}
```

Assert no raw contents are returned and only one provider call is made.

- [ ] **Step 2: Run and confirm RED**

Run:

```powershell
node --test tests/phase36-chat-multi-file-backend.test.mjs
node --test tests/phase6c-file-understanding.test.mjs
```

Expected: FAIL because `/file` consumes only one upload.

- [ ] **Step 3: Build bounded combined provider content**

Implement a helper that creates one user message:

- prepend the user's prompt once;
- wrap each extracted document in explicit filename-delimited “untrusted document data” boundaries;
- append each image as its own `image_url` content part;
- preserve input order;
- cap total extracted text across the entire batch at `AI_FILE_MAX_TEXT_CHARS`, distributing the remaining budget in order and recording truncation without failing the batch.

Keep the legacy string content path when the batch contains no images if required by the current provider adapter.

- [ ] **Step 4: Return compatible metadata**

Return `files` and `rejectedFiles`; retain `file` as the first accepted metadata object. The assistant reply remains singular.

- [ ] **Step 5: Run tests and commit**

Run the two commands from Step 2; expected PASS.

Commit:

```powershell
git add server/ai.js tests/phase36-chat-multi-file-backend.test.mjs tests/phase6c-file-understanding.test.mjs
git commit -m "feat(ai): analyze mixed file batches in one response"
```

### Task 7: Extend `/file-agent` to One Structured Batch Proposal

**Files:**
- Modify: `server/ai.js`
- Modify: `tests/phase36-chat-multi-file-backend.test.mjs`
- Modify: `tests/phase6d-file-agent-proposals.test.mjs`
- Modify: `tests/file-agent-structured-import.test.mjs`
- Modify: `docs/qa/ai-file-agent.md`

- [ ] **Step 1: Add failing structured-batch tests**

Cover two task-bearing documents and a mixed valid/rejected batch. Assert one provider invocation, one validated proposal result, stable file order in the prompt, the existing allowlist/dependency validation, and compatible `file` plus new `files` response metadata.

- [ ] **Step 2: Run and confirm RED**

Run:

```powershell
node --test tests/phase36-chat-multi-file-backend.test.mjs
node --test tests/phase6d-file-agent-proposals.test.mjs tests/file-agent-structured-import.test.mjs
```

Expected: FAIL only for the new batch contract.

- [ ] **Step 3: Reuse parser and bounded content builder**

Replace route-local upload state with `parseAiFileMultipart(req)`. Feed all accepted documents into one structured extraction prompt, preserving untrusted-data boundaries and the aggregate text cap. Images may be sent as image parts when the configured provider supports the same existing image path; otherwise reject that candidate with the established unsupported-for-agent reason while retaining supported documents.

- [ ] **Step 4: Preserve proposal safety**

Run the existing `validateFileAgentProposal` once over the combined result. Preserve action allowlists, dependency checks, auth, rate/concurrency limits, abort signals, timeout handling, and no-action behavior.

- [ ] **Step 5: Update QA documentation, run tests, and commit**

Document picker and drag/drop, exact limits, partial acceptance, and a manual mixed-batch scenario in `docs/qa/ai-file-agent.md`.

Run the commands from Step 2; expected PASS.

Commit:

```powershell
git add server/ai.js tests/phase36-chat-multi-file-backend.test.mjs tests/phase6d-file-agent-proposals.test.mjs tests/file-agent-structured-import.test.mjs docs/qa/ai-file-agent.md
git commit -m "feat(ai): create structured proposals from file batches"
```

### Task 8: Regenerate Release Assets and Verify the Complete Experience

**Files:**
- Modify generated siblings under: `css/`, `js/`
- Modify: `app.html` asset version pins
- Modify: `sw.js`
- Modify: `scripts/e2e-a11y.py`
- Modify: `scripts/e2e-offline.py` if cache assertions require it

- [ ] **Step 1: Extend accessibility coverage before regeneration**

Add checks that header controls have separate hit targets, each remove button has the filename in its accessible name, the drop overlay is not announced repeatedly, rejection feedback uses the polite live region, and the feature works using the picker without drag/drop.

- [ ] **Step 2: Run accessibility coverage and confirm the new assertions RED if wiring is incomplete**

Run: `python scripts/e2e-a11y.py --browser chromium`

Expected before final wiring/regeneration: new assertions expose any remaining label, focus, or generated-asset mismatch.

- [ ] **Step 3: Generate split CSS and minified siblings**

Run:

```powershell
python scripts/split-critical-css.py
python scripts/minify.py
```

Inspect `git diff --stat` and `git diff --check`. Ensure only expected source/generated assets changed.

- [ ] **Step 4: Bump all affected asset pins once**

Update matching `app.html` query versions and increment the service-worker cache name. Keep source, minified siblings, HTML pins, and cache entries synchronized.

- [ ] **Step 5: Run the focused and full verification matrix**

```powershell
node --test tests/phase36-chat-multi-file-drop.test.mjs tests/phase36-chat-multi-file-backend.test.mjs
node --test tests/*.test.mjs
python scripts/minify.py --check
python scripts/verify-critical-css.py
python scripts/check-release-assets.py
python scripts/e2e-smoke.py --browser chromium
python scripts/e2e-frontend.py --browser chromium
python scripts/e2e-a11y.py --browser chromium
python scripts/e2e-offline.py
```

Expected: every command exits 0. In the browser test, verify two simultaneous attachments, partial rejection, successful send, retained queue after simulated failure/Stop, and no header overlap at desktop and mobile widths.

- [ ] **Step 6: Manually inspect the running preview**

Open `http://127.0.0.1:4310/app.html?view=today&m=2026-08`, then verify:

- clock, overflow, and close controls are distinct and clickable;
- dragging files over child elements does not flicker the overlay;
- five accepted chips fit without covering the input/send control;
- the sixth file and a batch over 30 MB produce named rejection messages without deleting valid chips;
- Vietnamese and English copy fit at 375 px and desktop widths.

- [ ] **Step 7: Commit generated assets and final verification changes**

```powershell
git add app.html sw.js css js scripts/e2e-a11y.py scripts/e2e-offline.py
git commit -m "build(chat): refresh multi-file release assets"
```

- [ ] **Step 8: Final clean-worktree audit**

Run:

```powershell
git status --short
git log --oneline -10
```

Expected: clean worktree and the eight scoped implementation commits after the design/plan commits. Do not push or merge unless the user separately requests publication.
