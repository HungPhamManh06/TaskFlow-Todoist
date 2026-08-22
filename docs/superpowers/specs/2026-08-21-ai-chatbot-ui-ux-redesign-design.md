# TaskFlow AI Chatbot UI/UX Redesign

- Date: 2026-08-21
- Updated: 2026-08-22 after local conversation history and cancellable responses shipped in commit `1894d98`
- Status: Approved updated design, awaiting written-spec review
- Scope: Redesign the existing TaskFlow AI chatbot UI, local conversation history, and interaction experience without changing its backend API, consent model, storage limits, or confirm-before-write safety behavior.

## 1. Objective

Redesign the AI chatbot so it improves three qualities together:

1. Conversation readability: messages, system states, and proposed actions are easy to scan inside a compact surface.
2. Interaction speed: common questions, file attachment, sending, retrying, and closing require fewer steps.
3. Trust and transparency: users can see when TaskFlow data is used and no data-changing action occurs without review and confirmation.
4. Conversation continuity: users can return to locally stored conversations without losing sight of the current thread on desktop.

The assistant should feel like a calm, focused coach inside TaskFlow rather than a separate AI product or a decorative chat widget.

## 2. Approved direction

### 2.1 Container model

Use a refined popover on desktop. It remains quick to open, preserves the current floating entry point, and does not replace the user’s current TaskFlow context.

- Desktop closed-history target size: approximately 400 px wide and 560 px tall, constrained to the available viewport.
- Opening history expands the popover toward the left into an approximately 260 px history rail plus 400 px conversation column. The assistant remains anchored to its existing trigger and never overflows the safe viewport margin.
- Mobile behavior: a full-screen sheet that avoids keyboard overlap and gives the message list enough vertical space.
- The current floating assistant trigger remains the entry point.
- Opening moves focus into the chatbot. Closing with the close button, `Escape`, or an outside click restores focus to the trigger when appropriate.
- The chatbot and Pomodoro surfaces continue to be mutually exclusive so they do not overlap.

### 2.2 Visual character

Use the approved “Focused Coach” direction:

- Calm, structured, action-oriented, and integrated with TaskFlow.
- Reuse TaskFlow’s existing typeface, light/dark theme tokens, terracotta accent, neutral surfaces, border system, and control radii.
- Use green only for focus, availability, approval, or safe status. It is a semantic color, not a replacement brand accent.
- Avoid gradients, glass effects, ornamental AI imagery, oversized avatars, and purple AI styling.
- The signature element is a compact context strip below the header that communicates what the assistant is doing and which TaskFlow data it is using.

## 3. Information hierarchy

The compact popover is organized into five stable regions, with an adaptive history rail as a sixth region when requested:

1. Header
   - TaskFlow assistant mark and title.
   - Short availability or task status.
   - Secondary menu and close control.
   - Clear-conversation moves into the secondary menu to reduce accidental activation.
   - History remains a dedicated control. New conversation moves into the history rail header instead of competing with primary header actions.
2. Context strip
   - Shows a neutral default such as “Only uses data when the question requires it.”
   - Changes to a specific processing state such as “Reviewing open time slots.”
   - When context is sent, names the categories in use, for example “Using: Tasks · Schedule.”
   - Never claims access to a category that is not included in the current request.
3. Message log
   - Assistant messages use a quiet neutral surface.
   - User messages use the TaskFlow accent.
   - Message width, line length, spacing, and metadata support quick scanning.
   - Long assistant answers favor short paragraphs and simple list-like structure while remaining safely rendered as text.
4. Contextual actions
   - Initial state shows three high-value suggestions: plan today, view priority work, and summarize the week.
   - Suggestions disappear or become contextual actions after the first message.
   - Actions never repeat an action already presented inside an approval card.
5. Composer
   - Attachment, text entry, and send action form one visual unit.
   - Attached-file status appears directly above the composer.
6. Conversation history
   - Desktop history opens as a persistent left rail while the current conversation remains visible.
   - The rail contains a sticky heading, a clear “New conversation” action, grouped conversations, and a destructive clear-all action at the bottom.
   - Each conversation shows its title, last-updated time, and message count. The active item uses a quiet accent-tinted surface and a non-color-only active marker.
   - Per-conversation deletion lives in that item's secondary action instead of an always-visible destructive icon.

## 4. Interaction behavior

### 4.1 Initial state

- Replace the long welcome and persistent privacy paragraph with one short prompt: “What do you want to finish before the end of today?”
- Show no more than three initial suggestions.
- Keep detailed privacy and consent information available from the secondary menu.

### 4.2 Composer

- Replace the single-line text input with an auto-growing textarea.
- The textarea grows to a small bounded maximum and then scrolls internally.
- `Enter` sends a non-empty message.
- `Shift+Enter` inserts a newline.
- While a request is in flight, prevent duplicate submission. Preserve the user’s draft or submitted content so a failed request can be retried.
- The send control has an accessible label and a disabled state when there is nothing to send.
- While a response is active, the send control becomes a clearly labeled stop control without changing the composer's geometry.

### 4.3 Conversation history

- Preserve the shipped local-only, account-scoped history model from commit `1894d98`.
- Opening history on desktop expands the popover into two columns. Closing history collapses it without closing the assistant.
- Selecting another conversation keeps the history rail open, renders that conversation in the right column, and preserves a draft and sensible scroll position for the conversation being left.
- On mobile, history replaces the conversation body as a full-width child view with a visible back action. It never attempts a compressed two-column layout.
- `Escape` closes history before it closes the assistant. Focus moves into the history view when opened and returns to the history trigger when closed.
- A new empty conversation is not persisted until its first user message, preventing accidental empty history entries.
- Deleting the active conversation selects the most recently updated remaining conversation. When none remain, the assistant returns to its welcome state.
- Clear-all remains explicitly confirmed and communicates that the operation cannot be undone.
- The rail explains “Stored on this device” and never implies cloud synchronization.

### 4.4 File attachment

- Preserve the current accepted file types, validation, upload behavior, and abort behavior.
- Show filename, readable size, preview when applicable, processing state, and remove control in a compact row above the composer.
- File-specific prompt suggestions remain available but must not crowd the main message log.
- Removing a file clears its preview, object URL, pending request, and input value as the current logic does.

### 4.5 Processing and response

- Replace the generic pulsing text with a compact activity indicator and a specific label when the client knows the task, such as “Reviewing open time slots.”
- Use `aria-live="polite"` for status and new assistant output without announcing every animation frame.
- Scroll only when the user is already near the bottom; do not force-scroll a user who is reading an earlier response.
- Render AI text without injecting raw HTML.
- Stopping a response removes the activity state, retains the submitted user message, restores the composer, and never persists an incomplete assistant response.

### 4.6 Data transparency

- Keep consent and data selection rules unchanged.
- The context strip reflects the actual categories included in the request.
- Reflection and Mood remain sensitive, independently controlled categories: both default to OFF and are sent only after explicit user opt-in through the existing consent store.
- Detailed consent settings stay available through the assistant’s secondary menu.
- Data-use labels are descriptive, not promotional, and remain visible while the relevant answer or proposal is being generated.

### 4.7 Confirm-before-write

- Preserve the existing proposal, clarification, granular review, explanation, and confirm-before-write flows.
- Proposal cards use the same spacing, typography, and radius system as the redesigned chatbot.
- Each proposal states the intended change before presenting approval controls.
- Primary approval uses semantic success styling. Editing or cancelling remains lower emphasis.
- No task, schedule, project, or other user data is mutated before explicit confirmation.

### 4.8 Errors and recovery

- Keep the failed user message in the conversation.
- Show exactly one localized error block at the failure location.
- Explain the recoverable next step and place “Retry” inside the block.
- A retry reuses the failed message without inserting a duplicate user bubble.
- File errors, authentication requirements, unavailable AI configuration, network failures, and invalid responses remain distinct states.
- Error states state that no TaskFlow data was changed when that reassurance is relevant.

## 5. Responsive behavior

### Desktop

- Anchor the popover to the existing assistant entry point.
- Keep a safe margin from viewport edges.
- Constrain message history within the popover and keep the composer visible.
- Avoid covering primary navigation when the viewport becomes narrow.
- Expand history toward the available left side. If the two-column width does not fit, use the same single-view history presentation as mobile.

### Mobile

- Present the chatbot as a full-screen sheet above the app navigation.
- Use dynamic viewport sizing so the software keyboard does not hide the composer.
- Respect safe-area insets.
- Keep header and composer stable while the message log owns vertical scrolling.
- Controls meet a minimum 44 px touch target where applicable.
- History becomes a full-width child view with its own sticky header and back action.

## 6. Accessibility

- Give the chatbot surface dialog/popover semantics appropriate to its presentation and connect the trigger with `aria-controls` and `aria-expanded`.
- Preserve a logical reading and tab order: header actions, messages and embedded actions, suggestions, attachment, textarea, send.
- Give the history rail or child view an accessible name, expose its open state on the trigger, and move focus predictably on open, close, conversation selection, and deletion.
- Use visible focus indicators derived from TaskFlow tokens.
- Do not rely on color alone for availability, data use, success, warning, or error.
- Meet WCAG AA contrast for text, placeholders, controls, focus rings, and message bubbles in light and dark modes.
- Respect `prefers-reduced-motion`; status remains understandable without animation.
- Ensure icon-only controls have localized accessible names.

## 7. Technical design

### 7.1 Files and boundaries

- `app.html`: revise the chatbot structure and static labels while preserving all existing IDs and action hooks. Any unavoidable hook change must be called out explicitly in the implementation plan and updated in the same change across dispatchers and tests.
- `css/styles.css`: canonical source for the chatbot shell, history, message, state, proposal-card, attachment, composer, and responsive rules.
- `css/styles-critical.css` and `css/styles-deferred.css`: regenerate from `css/styles.css` through `scripts/split-critical-css.py`; do not hand-edit the generated split files.
- `css/styles-critical.min.css` and `css/styles-deferred.min.css`: regenerate through the repository’s existing minification process after splitting the canonical source.
- `js/chat.js`: update focused interaction logic for the textarea, status rendering, contextual actions, scroll behavior, and retry presentation.
- `js/chat-history.js`: preserve the existing account isolation, retention, capacity, safe-deserialization, and no-file-bytes contracts. Extend only when the approved draft-preservation behavior cannot be implemented cleanly in `js/chat.js`.
- `js/chat.min.js`: regenerate from the canonical source through the repository’s existing asset process.
- `js/chat-history.min.js`: regenerate if and only if `js/chat-history.js` changes.
- `js/app.js`: change only the open/close, focus, keyboard, or dispatcher integration that cannot remain encapsulated in `js/chat.js`.
- `js/app.min.js`: regenerate if and only if `js/app.js` changes.
- Translation dictionaries: add or revise Vietnamese and English strings for the new labels and states.
- Tests: extend existing chatbot/frontend regression tests rather than creating a separate test architecture.
- `sw.js`: update the existing offline asset manifest only when generated chatbot asset URLs change.

Backend AI files and API contracts are outside this redesign. The abort propagation already shipped in `1894d98` remains unchanged. Existing local changes in `js/ai-roadmap.js`, `server/ai-roadmap-validator.js`, and `server/ai.js` must remain untouched and uncommitted as part of this work.

### 7.2 Rendering units

Keep the implementation framework-free and split UI logic into small functions with one responsibility:

- Render or update the header status.
- Render the data-use context strip from actual request context.
- Render initial and contextual action suggestions.
- Render the typing/activity state.
- Render one localized error and retry action.
- Render and clear attached-file state.
- Manage composer value, height, keyboard behavior, and disabled state.
- Preserve scroll position and scroll to the latest message only when appropriate.
- Render, open, close, and group the adaptive history rail.
- Restore the current conversation, its draft, and its scroll position without persisting empty conversations.

These functions may remain inside the existing lazy-loaded `TaskFlowChat` module unless extraction materially improves clarity. The redesign must not add an eager boot dependency.

### 7.3 Data flow

1. The user opens the chatbot; the lazy module chain loads as it does today.
2. The user enters text or attaches a valid file.
3. The client determines the required intent and allowed context through existing logic.
4. The context strip displays only the context categories included in the request.
5. The client appends the user message once and renders the processing state.
6. The existing AI or agent request runs.
7. The client replaces processing with a safe text response, clarification card, or proposal review.
8. Proposed writes remain pending until the user explicitly approves them.
9. Failures replace processing with one retryable error block and retain the failed input.
10. Completed user and assistant messages persist through the existing local history module; stopped or partial assistant output does not.
11. Switching conversations loads only the selected account-scoped record and never crosses account boundaries.

### 7.4 Existing storage contracts

- Up to 30 conversations per account scope.
- Up to 60 messages per conversation.
- Up to 1 MB of serialized local history.
- Conversations older than 90 days are removed by the existing retention behavior.
- Raw attachment bytes are never stored; only safe attachment metadata may be retained.
- The redesign does not add server storage, synchronization, export, or recovery for chat history.

## 8. Non-goals

- No new AI provider, model, endpoint, database table, or server contract.
- No cloud synchronization, server database, cross-device recovery, or account export for conversation history.
- No history search, pinning, folders, bulk selection, or manual rename UI.
- No full-page desktop AI workspace.
- No voice input, streaming-token protocol, generated images, or web search.
- No change to current consent permissions or data-retention policy.
- No unrelated redesign of Pomodoro, navigation, account, or other TaskFlow surfaces.

## 9. Verification

### Automated coverage

- Existing chatbot API, agent, file, consent, and frontend tests remain passing.
- Add regression coverage for:
  - Open, close, `Escape`, outside click, and focus restoration.
  - Textarea `Enter` and `Shift+Enter` behavior.
  - Empty and in-flight send states.
  - Send-to-stop transition, abort cleanup, and no persistence of partial assistant output.
  - History open, collapse, conversation selection, new conversation, per-item deletion, and clear-all confirmation.
  - Account isolation, 30-conversation/60-message/1-MB bounds, 90-day retention, and no raw file bytes.
  - Desktop two-column fallback to the single-view history presentation when space is constrained.
  - Draft and scroll restoration while switching conversations without creating empty records.
  - Actual data categories shown in the context strip.
  - Initial suggestions and contextual action visibility.
  - Typing/activity cleanup after success and failure.
  - Retry without a duplicate user message.
  - File selection, validation, removal, loading, and failure.
  - Confirmation cards preserving explicit approval.
  - Lazy loading and required release asset parity.

### Browser verification

- Desktop light and dark themes at common and narrow widths.
- Mobile light and dark themes with the software-keyboard layout approximated or exercised.
- Long answer, long user message, long filename, and translated English strings.
- Keyboard-only operation, visible focus, screen-reader names, and live-region behavior.
- Reduced-motion behavior.
- No collision with navigation, Pomodoro, viewport edges, or safe-area insets.
- Core chat path: open → send → stop or answer → open history → switch conversation → start a new conversation → retry/error → attach file → proposal preview → close and restore focus.

## 10. Acceptance criteria

The redesign is complete when:

- The approved compact popover and full-screen mobile sheet match the Focused Coach direction.
- Desktop history expands into the approved two-column layout without hiding the current conversation; mobile history uses a clear single-view child screen.
- Local-history limits, account isolation, retention, and no-file-bytes behavior remain unchanged and are described truthfully in the UI.
- Users can scan messages and proposed actions without the current privacy paragraph or suggestion grid dominating the viewport.
- The UI truthfully identifies TaskFlow data categories used for a request.
- Sending, multiline entry, attachment, retry, and close/focus flows work with mouse, touch, and keyboard.
- AI proposals remain reviewable and require explicit confirmation.
- Success, processing, empty, guest, configuration, file, and error states are visually coherent in both themes.
- Relevant automated tests and browser smoke checks pass.
- Generated/minified assets match their source files.
- Unrelated local changes are preserved and excluded from the redesign commit.
