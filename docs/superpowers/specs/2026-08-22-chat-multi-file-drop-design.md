# TaskFlow Chat Multi-file Drop Design

**Date:** 2026-08-22  
**Status:** Approved direction, pending written-spec review  
**Scope:** Fix the chatbot header icon collision and add multi-file selection and drag-and-drop for one assistant message.

## 1. Goals

- Keep the existing Focused Coach visual language and chat/history behavior.
- Render History, More, and Close as three distinct header controls with no overlap.
- Let a user attach images or supported documents by button selection or drag-and-drop.
- Support up to five files per message, with a 15 MB per-file limit and a 30 MB combined limit.
- Keep valid files when other dropped files are rejected, and explain every rejection.
- Send all accepted files with one prompt and receive one assistant response.

## 2. Non-goals

- No cloud file library or permanent file storage.
- No arbitrary file types beyond the existing JPEG, PNG, WebP, PDF, plain text, and Markdown allowlist.
- No more than five files in one message.
- No background upload before the user presses Send.
- No persistence of raw file bytes, object URLs, or extracted file content in chat history.

## 3. Header icon correction

The chat Close button currently reuses the global `.sync-close` class. That class is absolutely positioned for modal headers, so inside the chat flex header it overlaps the More button and makes the two sprite icons look like one malformed glyph.

The chat header will use a dedicated `.chat-close-btn` class. All three controls will remain normal flex children with:

- 36 px targets on desktop and 44 px targets on mobile;
- one 16 px local sprite icon per button;
- a 4-8 px visible gap;
- independent hover, focus-visible, active, and accessible-name states;
- no absolute positioning or duplicated text glyph.

The global `.sync-close` contract for other dialogs remains unchanged.

## 4. Attachment interaction

### 4.1 Entry points

- The existing `+` button opens a multi-select file picker.
- The user may drag files over the visible conversation workspace.
- On the first file drag entry, the conversation displays a drop overlay with the localized instruction "Thả tối đa 5 tệp vào đây".
- The overlay stays visible while the drag is inside the chat and disappears on drop, drag leave, Escape, or chat close.
- Dragging ordinary text or internal TaskFlow elements does not activate the file drop zone.

### 4.2 Queue behavior

The client stores an in-memory attachment queue for the current draft. A newly selected or dropped group is validated file by file and appended to the queue until the five-file or 30 MB combined limit is reached.

Each accepted file appears as a removable attachment card containing:

- image thumbnail for supported images, otherwise a type icon;
- safe text for filename;
- formatted size;
- remove button with an accessible name.

Duplicate files are identified by the stable draft tuple `name + size + lastModified` and are not added twice.

### 4.3 Partial acceptance

Validation is deterministic and preserves every valid file. Rejected files do not clear accepted files. The UI reports localized, per-file reasons:

- unsupported type;
- empty file;
- over 15 MB;
- duplicate;
- more than five files;
- adding the file would exceed 30 MB total.

One compact summary toast may group multiple rejection lines, but it must name each rejected file. The attachment list and Send button update immediately after validation.

## 5. Client architecture

The current single `_attachedFile` state becomes an array-backed draft queue, for example `_attachedFiles`. File object URLs are created only for accepted images and revoked when that file is removed, the draft is cleared, the account changes, or the chat runtime is disposed.

Pure helpers will own the rules so they can be tested without a browser:

- validate one file against the existing allowlist and 15 MB limit;
- merge a candidate group into the current queue;
- enforce five files and 30 MB total;
- return `{ accepted, rejected }` without mutating the input arrays;
- derive metadata safe for history and provider labels.

The existing file picker, drag-and-drop handler, attachment renderer, composer state, clear action, new-conversation action, and send lifecycle will consume this queue. Selecting the same file again remains possible because the hidden input is reset after every selection.

## 6. Request and server architecture

Both `/api/ai/file` and `/api/ai/file-agent` will accept repeated multipart fields named `files` while temporarily retaining the legacy singular `file` field for compatibility.

Server limits:

- at most five file parts;
- at most 15 MB for each file;
- at most 30 MB across all file bytes;
- existing MIME, magic-byte, filename, authentication, rate-limit, concurrency, timeout, and prompt-injection protections remain active for every file.

The multipart parser will collect bounded file records instead of one global buffer. Each file is validated independently. If at least one file is valid, processing continues and the response includes accepted-file metadata plus rejected-file metadata. If none are valid, the route returns the existing safe file error shape extended with per-file details.

Accepted content is extracted independently and wrapped in clearly separated, untrusted document boundaries. The provider receives one combined request containing the user's prompt and the bounded extracted/image inputs for all accepted files, then returns one answer or one proposal. The server does not write uploaded bytes to disk or a database.

## 7. History and privacy

One user message represents the prompt and all accepted attachments. Chat history stores only allowlisted metadata for each attachment:

- safe filename;
- MIME type;
- byte size.

Raw bytes, base64, object URLs, extracted text, local paths, and rejected-file details are not persisted. Existing account-scoped history bounds remain unchanged. A stopped, failed, or stale response never persists an assistant message.

## 8. Responsive and accessible presentation

- Desktop attachment cards wrap within the 400 px conversation column without horizontal overflow.
- Expanded 660 px history mode does not shrink or overlap header controls.
- Mobile keeps 44 px targets and safe-area composer padding.
- The drop overlay uses text, border, and icon rather than color alone.
- Drop-state changes are announced through a polite live region.
- Keyboard-only users retain full parity through the multi-select button and per-file remove buttons.
- Reduced-motion mode removes overlay animation without removing state feedback.
- Vietnamese and English copy is provided for instructions, limits, rejection reasons, counts, and removal labels.

## 9. Error and cancellation behavior

- Offline, guest, authentication, validation, timeout, provider, and abort paths restore the composer and preserve the draft queue when retry is useful.
- Starting a send freezes the attachment queue as that request's immutable snapshot. Attachment removal and additional drops are disabled while it is in flight.
- A successful response clears the queue and revokes its object URLs. An error or user Stop keeps the same queue available for retry.
- Retry reuses the same user bubble and request snapshot without duplicating history.
- User Stop aborts the single batch request and does not persist partial assistant output.
- Server responses never echo raw file content in errors or logs.

## 10. Testing and release verification

### Unit and contract tests

- queue merge, duplicate handling, partial acceptance, five-file cap, per-file 15 MB cap, and 30 MB total cap;
- object URL creation/revocation and clear/new/account-change cleanup;
- safe metadata persistence with no raw bytes;
- multipart parser compatibility for legacy `file` and repeated `files`;
- independent MIME/magic-byte validation and bounded extraction;
- combined provider request and one-response semantics;
- header controls use three non-positioned buttons and one icon each.

### Browser tests

- picker selects multiple mixed files;
- repeated drops append accepted files;
- partial rejection leaves valid cards intact;
- drag overlay enter/leave/drop behavior;
- remove one file, clear all, send, Stop, and retry;
- Vietnamese/English, light/dark, reduced motion;
- compact desktop, expanded history, constrained desktop, and mobile sheet;
- no header overlap or horizontal overflow;
- focus-visible, accessible names, live announcements, and minimum mobile targets.

### Release checks

- regenerate readable split CSS and all changed minified siblings;
- bump changed asset query versions and service-worker cache once;
- run the complete Node, server, browser, accessibility, offline, smoke, minified-parity, and critical-CSS matrices;
- confirm no environment files, databases, raw uploads, screenshots, or transient artifacts are staged.

## 11. Acceptance criteria

The work is complete when a user can add up to five supported files through either picker or drag-and-drop, see and remove each file, receive precise partial-rejection feedback, send the accepted group in one request, and receive one assistant response. The three header icons remain distinct at every supported viewport, privacy/history guarantees remain intact, and the full release matrix passes.
