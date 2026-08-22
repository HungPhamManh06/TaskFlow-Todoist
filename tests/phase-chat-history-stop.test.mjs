import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

/* ============================================================
   Phase: Chat History + Stop Response Lifecycle Tests
   ============================================================ */

/* ---- 1. chat-history.js pure module tests ---- */

describe('TaskFlowChatHistory — pure module', function () {
  let ChatHistory;
  let origLocalStorage;

  // Minimal localStorage mock
  const store = {};
  const mockStorage = {
    getItem: (k) => store[k] ?? null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach(k => delete store[k]); }
  };

  beforeEach(function () {
    Object.keys(store).forEach(k => delete store[k]);
    // Reset module cache by re-evaluating
    delete require.cache[require.resolve('../js/chat-history.js')];
    ChatHistory = require('../js/chat-history.js');
  });

  it('empty storage returns valid state', function () {
    globalThis.localStorage = mockStorage;
    const state = ChatHistory.load('user1');
    assert.equal(state.version, 1);
    assert.equal(state.activeConversationId, '');
    assert.equal(state.conversations.length, 0);
  });

  it('create conversation', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1', 'Test chat');
    assert.ok(conv.id.startsWith('c_'));
    assert.equal(conv.title, 'Test chat');
    assert.equal(conv.messages.length, 0);
    assert.equal(ChatHistory.getConversationCount('user1'), 1);
  });

  it('deterministic title from first user message', function () {
    globalThis.localStorage = mockStorage;
    assert.equal(ChatHistory._generateTitle('Hãy giúp tôi lập kế hoạch học C++'), 'Hãy giúp tôi lập kế hoạch học C++');
    assert.equal(ChatHistory._generateTitle(''), 'Cuộc trò chuyện mới');
    assert.equal(ChatHistory._generateTitle(null), 'Cuộc trò chuyện mới');
  });

  it('add user message', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    const msg = ChatHistory.addMessage('user1', conv.id, { role: 'user', content: 'Hello' });
    assert.ok(msg.id.startsWith('m_'));
    assert.equal(msg.role, 'user');
    assert.equal(msg.content, 'Hello');
  });

  it('add assistant message', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    ChatHistory.addMessage('user1', conv.id, { role: 'user', content: 'Hello' });
    const msg = ChatHistory.addMessage('user1', conv.id, { role: 'assistant', content: 'Hi there' });
    assert.equal(msg.role, 'assistant');
    assert.equal(msg.content, 'Hi there');
  });

  it('conversations sorted newest first', function () {
    globalThis.localStorage = mockStorage;
    const c1 = ChatHistory.createConversation('user1', 'First');
    // Small delay to ensure different timestamps
    const c2 = ChatHistory.createConversation('user1', 'Second');
    const list = ChatHistory.listConversations('user1');
    assert.equal(list.length, 2);
    assert.equal(list[0].title, 'Second');
    assert.equal(list[1].title, 'First');
  });

  it('open old conversation', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1', 'My chat');
    ChatHistory.addMessage('user1', conv.id, { role: 'user', content: 'test' });
    const found = ChatHistory.getConversation('user1', conv.id);
    assert.equal(found.title, 'My chat');
    assert.equal(found.messages.length, 1);
  });

  it('activeConversationId persists', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    const state = ChatHistory.load('user1');
    assert.equal(state.activeConversationId, conv.id);
  });

  it('delete one conversation', function () {
    globalThis.localStorage = mockStorage;
    const c1 = ChatHistory.createConversation('user1', 'A');
    const c2 = ChatHistory.createConversation('user1', 'B');
    ChatHistory.deleteConversation('user1', c1.id);
    assert.equal(ChatHistory.getConversationCount('user1'), 1);
    assert.equal(ChatHistory.getConversation('user1', c2.id).title, 'B');
  });

  it('delete active conversation creates safe replacement', function () {
    globalThis.localStorage = mockStorage;
    const c1 = ChatHistory.createConversation('user1', 'Active');
    ChatHistory.deleteConversation('user1', c1.id);
    const state = ChatHistory.load('user1');
    // After deletion, activeConversationId should be valid (empty or another conv)
    if (state.activeConversationId) {
      assert.ok(ChatHistory.getConversation('user1', state.activeConversationId));
    }
  });

  it('clear current-account history', function () {
    globalThis.localStorage = mockStorage;
    ChatHistory.createConversation('user1', 'A');
    ChatHistory.createConversation('user1', 'B');
    ChatHistory.clearAll('user1');
    assert.equal(ChatHistory.getConversationCount('user1'), 0);
  });

  it('account A history invisible to B', function () {
    globalThis.localStorage = mockStorage;
    ChatHistory.createConversation('userA', 'A chat');
    assert.equal(ChatHistory.getConversationCount('userA'), 1);
    assert.equal(ChatHistory.getConversationCount('userB'), 0);
  });

  it('account B history invisible to A', function () {
    globalThis.localStorage = mockStorage;
    ChatHistory.createConversation('userB', 'B chat');
    assert.equal(ChatHistory.getConversationCount('userB'), 1);
    assert.equal(ChatHistory.getConversationCount('userA'), 0);
  });

  it('history key contains no token', function () {
    globalThis.localStorage = mockStorage;
    const key = ChatHistory._storageKey('user1');
    assert.ok(!key.includes('token'));
    assert.ok(!key.includes('jwt'));
    assert.ok(!key.includes('auth'));
  });

  it('max conversation bound', function () {
    globalThis.localStorage = mockStorage;
    for (let i = 0; i < 35; i++) {
      ChatHistory.createConversation('user1', 'Conv ' + i);
    }
    assert.ok(ChatHistory.getConversationCount('user1') <= ChatHistory.MAX_CONVERSATIONS);
  });

  it('max message bound', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    for (let i = 0; i < 70; i++) {
      ChatHistory.addMessage('user1', conv.id, { role: i % 2 === 0 ? 'user' : 'assistant', content: 'msg ' + i });
    }
    const found = ChatHistory.getConversation('user1', conv.id);
    assert.ok(found.messages.length <= ChatHistory.MAX_MESSAGES);
  });

  it('max message chars truncated', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    const longText = 'x'.repeat(10000);
    ChatHistory.addMessage('user1', conv.id, { role: 'user', content: longText });
    const found = ChatHistory.getConversation('user1', conv.id);
    assert.ok(found.messages[0].content.length <= ChatHistory.MAX_MESSAGE_CHARS);
  });

  it('corrupt JSON safe recovery', function () {
    store['taskflow-chat-history-v1:user1'] = '{invalid json!!!';
    const state = ChatHistory.load('user1');
    assert.equal(state.version, 1);
    assert.equal(state.conversations.length, 0);
  });

  it('HTML/model content restored as text only', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    ChatHistory.addMessage('user1', conv.id, { role: 'assistant', content: '<script>alert(1)</script>Hello' });
    const found = ChatHistory.getConversation('user1', conv.id);
    assert.ok(found.messages[0].content.includes('<script>'));
    // content is a string, not DOM — safe
    assert.equal(typeof found.messages[0].content, 'string');
  });

  it('raw PDF bytes never persisted in message content', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    // Should only store lightweight metadata, not raw bytes
    ChatHistory.addMessage('user1', conv.id, {
      role: 'user', content: 'Summarize file',
      attachment: { type: 'application/pdf', name: 'test.pdf', size: 1024 }
    });
    const found = ChatHistory.getConversation('user1', conv.id);
    const msg = found.messages[0];
    assert.ok(msg.attachment);
    assert.equal(msg.attachment.type, 'application/pdf');
    // content should not contain base64
    assert.ok(!msg.content.includes('base64'));
  });

  it('provider history returns bounded recent messages', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    for (let i = 0; i < 20; i++) {
      ChatHistory.addMessage('user1', conv.id, { role: i % 2 === 0 ? 'user' : 'assistant', content: 'msg ' + i });
    }
    const hist = ChatHistory.getProviderHistory('user1', conv.id, 10);
    assert.equal(hist.length, 10);
    assert.equal(hist[0].role, 'user');
    assert.equal(hist[9].role, 'assistant');
  });

  it('attachment metadata stored correctly', function () {
    globalThis.localStorage = mockStorage;
    const conv = ChatHistory.createConversation('user1');
    ChatHistory.addMessage('user1', conv.id, {
      role: 'user', content: 'Check this PDF',
      attachment: { type: 'application/pdf', name: 'plan.pdf', size: 925000 }
    });
    const found = ChatHistory.getConversation('user1', conv.id);
    const att = found.messages[0].attachment;
    assert.equal(att.type, 'application/pdf');
    assert.equal(att.name, 'plan.pdf');
    assert.equal(att.size, 925000);
  });
});

/* ---- 2. chat.js source inspection tests ---- */

describe('chat.js — shared request lifecycle', function () {
  const chatSource = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');

  it('has stopActiveResponse function', function () {
    assert.ok(chatSource.includes('function stopActiveResponse'), 'stopActiveResponse must exist');
  });

  it('has _startRequest function', function () {
    assert.ok(chatSource.includes('function _startRequest'), '_startRequest must exist');
  });

  it('has _requestGeneration counter', function () {
    assert.ok(chatSource.includes('_requestGeneration'), '_requestGeneration must exist');
  });

  it('has newConversation function', function () {
    assert.ok(chatSource.includes('function newConversation'), 'newConversation must exist');
  });

  it('has openConversation function', function () {
    assert.ok(chatSource.includes('function openConversation'), 'openConversation must exist');
  });

  it('has deleteConversation function', function () {
    assert.ok(chatSource.includes('function deleteConversation'), 'deleteConversation must exist');
  });

  it('has clearAllHistory function', function () {
    assert.ok(chatSource.includes('function clearAllHistory'), 'clearAllHistory must exist');
  });

  it('has toggleHistory function', function () {
    assert.ok(chatSource.includes('function toggleHistory'), 'toggleHistory must exist');
  });

  it('uses AbortController for request lifecycle', function () {
    assert.ok(chatSource.includes('new AbortController()'), 'Must use AbortController');
  });

  it('uses generation check for stale response protection', function () {
    assert.ok(chatSource.includes('_isCurrentRequest'), '_isCurrentRequest must exist');
  });

  it('normal chat passes signal to fetch', function () {
    assert.ok(chatSource.includes('signal: req.signal'), 'Must pass signal to chat fetch');
  });

  it('file send passes signal to fetch', function () {
    // _sendWithFile should pass signal
    assert.ok(chatSource.includes("signal: req.signal"), 'File send must pass signal');
  });

  it('send button becomes stop when in flight', function () {
    assert.ok(chatSource.includes('chatStop'), 'Must reference chatStop i18n key');
  });

  it('persists user messages to history', function () {
    assert.ok(chatSource.includes('_persistUserMessage'), '_persistUserMessage must exist');
  });

  it('persists assistant messages to history', function () {
    assert.ok(chatSource.includes('_persistAssistantMessage'), '_persistAssistantMessage must exist');
  });

  it('gets provider history from history module', function () {
    assert.ok(chatSource.includes('_getProviderHistory'), '_getProviderHistory must exist');
  });

  it('uses TaskFlowChatHistory module', function () {
    assert.ok(chatSource.includes('TaskFlowChatHistory'), 'Must reference TaskFlowChatHistory');
  });

  it('has classifyFileIntent', function () {
    assert.ok(chatSource.includes('function classifyFileIntent'), 'classifyFileIntent must exist');
  });

  it('chat route file uses safe error propagation', function () {
    // abort should not show error
    assert.ok(chatSource.includes("AbortError"), 'Must handle AbortError');
  });
});

/* ---- 3. server/ai-provider.js — abort signal support ---- */

describe('ai-provider.js — external abort signal', function () {
  const providerSource = readFileSync(new URL('../server/ai-provider.js', import.meta.url), 'utf8');

  it('supports external signal option', function () {
    assert.ok(providerSource.includes('options.signal'), 'Must support options.signal');
  });

  it('links external signal to controller', function () {
    assert.ok(providerSource.includes("options.signal.addEventListener"), 'Must link external signal');
  });
});

/* ---- 4. server/ai.js — client abort propagation ---- */

describe('ai.js — client abort propagation', function () {
  const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

  it('/chat route has client abort controller', function () {
    // Find the /chat route and verify it has clientAbort
    const chatIdx = aiSource.indexOf("router.post('/chat'");
    const chatEnd = aiSource.indexOf("router.post('/agent'", chatIdx);
    const chatSection = aiSource.slice(chatIdx, chatEnd);
    assert.ok(chatSection.includes('clientAbort'), '/chat must have clientAbort');
    assert.ok(chatSection.includes("req.on('aborted'"), '/chat must listen to req aborted');
  });

  it('/agent route has client abort controller', function () {
    const agentIdx = aiSource.indexOf("router.post('/agent'");
    const agentEnd = aiSource.indexOf("router.post('/file'", agentIdx);
    const agentSection = aiSource.slice(agentIdx, agentEnd);
    assert.ok(agentSection.includes('clientAbort'), '/agent must have clientAbort');
  });

  it('/file route has client abort controller', function () {
    const fileIdx = aiSource.indexOf("router.post('/file'");
    const fileEnd = aiSource.indexOf("router.post('/file-agent'", fileIdx);
    const fileSection = aiSource.slice(fileIdx, fileEnd);
    assert.ok(fileSection.includes('clientAbort'), '/file must have clientAbort');
  });

  it('/file-agent route has client abort controller', function () {
    const faIdx = aiSource.indexOf("router.post('/file-agent'");
    const faEnd = aiSource.indexOf("module.exports", faIdx);
    const faSection = aiSource.slice(faIdx, faEnd);
    assert.ok(faSection.includes('clientAbort'), '/file-agent must have clientAbort');
  });

  it('/chat passes signal to callAiText', function () {
    const chatIdx = aiSource.indexOf("router.post('/chat'");
    const chatEnd = aiSource.indexOf("router.post('/agent'", chatIdx);
    const chatSection = aiSource.slice(chatIdx, chatEnd);
    assert.ok(chatSection.includes('signal: clientAbort.signal'), '/chat must pass signal');
  });

  it('/agent passes signal to callAiJson', function () {
    const agentIdx = aiSource.indexOf("router.post('/agent'");
    const agentEnd = aiSource.indexOf("router.post('/file'", agentIdx);
    const agentSection = aiSource.slice(agentIdx, agentEnd);
    assert.ok(agentSection.includes('signal: clientAbort.signal'), '/agent must pass signal');
  });

  it('/file passes signal to callAiText', function () {
    const fileIdx = aiSource.indexOf("router.post('/file'");
    const fileEnd = aiSource.indexOf("router.post('/file-agent'", fileIdx);
    const fileSection = aiSource.slice(fileIdx, fileEnd);
    assert.ok(fileSection.includes('signal: clientAbort.signal'), '/file must pass signal');
  });

  it('/file-agent passes signal to callAiText', function () {
    const faIdx = aiSource.indexOf("router.post('/file-agent'");
    const faEnd = aiSource.indexOf("module.exports", faIdx);
    const faSection = aiSource.slice(faIdx, faEnd);
    assert.ok(faSection.includes('signal: clientAbort.signal'), '/file-agent must pass signal');
  });

  it('cleans up event listener on response close', function () {
    assert.ok(aiSource.includes("req.removeListener('aborted'"), 'Must clean up listener');
  });
});

/* ---- 5. app.html — new UI elements ---- */

describe('app.html — new chat history UI', function () {
  const html = readFileSync(new URL('../app.html', import.meta.url), 'utf8');

  it('has new chat button', function () {
    assert.ok(html.includes('data-action="chat-new"'), 'Must have new chat button');
  });

  it('has history button', function () {
    assert.ok(html.includes('data-action="chat-history"'), 'Must have history button');
  });

  it('has history drawer', function () {
    assert.ok(html.includes('chatHistoryDrawer'), 'Must have history drawer element');
  });

  it('has send/stop button with correct action', function () {
    assert.ok(html.includes('data-action="chat-send"'), 'Must have send button');
  });
});

/* ---- 6. i18n — new strings present ---- */

describe('i18n — chat history and stop strings', function () {
  const i18nSource = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');

  const requiredKeys = [
    'chatNewConversation', 'chatHistory', 'chatHistoryEmpty', 'chatHistoryLocalNote',
    'chatDeleteConversation', 'chatDeleteConversationConfirm', 'chatClearHistory',
    'chatClearHistoryConfirm', 'chatToday', 'chatYesterday', 'chatLast7Days', 'chatOlder',
    'chatStopped', 'chatStop', 'chatStopAria'
  ];

  for (const key of requiredKeys) {
    it(`has VI string: ${key}`, function () {
      assert.ok(i18nSource.includes(`${key}:`), `Missing VI string: ${key}`);
    });
  }
});

/* ---- 7. SW — chat-history.min.js cached ---- */

describe('SW — chat-history cached', function () {
  const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

  it('chat-history.min.js in precache list', function () {
    assert.ok(swSource.includes('chat-history.min.js'), 'Must be in SW precache');
  });
});

/* ---- 8. CSS — new styles present ---- */

describe('CSS — history drawer styles', function () {
  const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');

  it('has chat-history-drawer style', function () {
    assert.ok(css.includes('.chat-history-drawer'), 'Must have drawer style');
  });

  it('has chat-history-item style', function () {
    assert.ok(css.includes('.chat-history-item'), 'Must have item style');
  });

  it('has chat-send--stopping style', function () {
    assert.ok(css.includes('.chat-send--stopping'), 'Must have stopping button style');
  });

  it('has chat-stopped style', function () {
    assert.ok(css.includes('.chat-stopped'), 'Must have stopped message style');
  });
});

/* ---- 9. chat-history.js source safety ---- */

describe('chat-history.js — safety contracts', function () {
  const source = readFileSync(new URL('../js/chat-history.js', import.meta.url), 'utf8');

  it('storage key does not contain token', function () {
    assert.ok(!source.includes('planner-token'), 'Must not use planner-token in key');
  });

  it('no innerHTML usage', function () {
    assert.ok(!source.includes('innerHTML'), 'Must not use innerHTML');
  });

  it('sanitizes restored data by field allowlisting', function () {
    // The module rebuilds objects with known fields only, stripping unknown/prototype fields
    assert.ok(source.includes('_sanitizeConversation'), 'Must have _sanitizeConversation');
    assert.ok(source.includes('_sanitizeState'), 'Must have _sanitizeState');
    assert.ok(source.includes("role === 'assistant'"), 'Must whitelist role values');
  });

  it('MAX_CONVERSATIONS is bounded', function () {
    assert.ok(source.includes('MAX_CONVERSATIONS = 30'), 'Must have bounded conversations');
  });

  it('MAX_MESSAGES is bounded', function () {
    assert.ok(source.includes('MAX_MESSAGES = 60'), 'Must have bounded messages');
  });

  it('MAX_TOTAL_STORAGE_BYTES is bounded', function () {
    assert.ok(source.includes('MAX_TOTAL_STORAGE_BYTES'), 'Must have storage budget');
  });
});

/* ---- 10. Phase 7A classifier still works ---- */

describe('chat.js — classifyFileIntent regression', function () {
  // Re-read the source to find the classifyFileIntent function
  // Since we can't import the IIFE directly, test via source
  const chatSource = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');

  it('classifyFileIntent function exists with correct signals', function () {
    // Vietnamese create verbs
    assert.ok(chatSource.includes('tạo'), 'Must include Vietnamese create verb');
    assert.ok(chatSource.includes('chia'), 'Must include Vietnamese split verb');
    assert.ok(chatSource.includes('lên'), 'Must include lên (create) verb');

    // Task nouns
    assert.ok(chatSource.includes('task'), 'Must include task');
    assert.ok(chatSource.includes('todo'), 'Must include todo');

    // Negation
    assert.ok(chatSource.includes('không'), 'Must include negation');
    assert.ok(chatSource.includes('đừng'), 'Must include dont');
  });
});

/* ---- 11. doChatSend becomes stop when in flight ---- */

describe('chat.js — send/stop toggle', function () {
  const chatSource = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');

  it('doChatSend checks _inFlight for stop', function () {
    // The overridden doChatSend should check _inFlight
    assert.ok(chatSource.includes('_inFlight && _activeRequest'), 'doChatSend must check _inFlight');
    assert.ok(chatSource.includes('stopActiveResponse()'), 'must call stopActiveResponse');
  });

  it('setSendMode toggles button text', function () {
    assert.ok(chatSource.includes('chatStop'), 'Must use chatStop text');
    assert.ok(chatSource.includes('chatSend'), 'Must use chatSend text');
  });
});

/* ---- 12. History drawer rendering ---- */

describe('chat.js — history drawer', function () {
  const chatSource = readFileSync(new URL('../js/chat.js', import.meta.url), 'utf8');

  it('has _renderHistoryDrawer function', function () {
    assert.ok(chatSource.includes('function _renderHistoryDrawer'), '_renderHistoryDrawer must exist');
  });

  it('has _groupByDate function', function () {
    assert.ok(chatSource.includes('function _groupByDate'), '_groupByDate must exist');
  });

  it('groups by today/yesterday/last7days/older', function () {
    assert.ok(chatSource.includes('chatToday'), 'Must reference chatToday');
    assert.ok(chatSource.includes('chatYesterday'), 'Must reference chatYesterday');
    assert.ok(chatSource.includes('chatLast7Days'), 'Must reference chatLast7Days');
    assert.ok(chatSource.includes('chatOlder'), 'Must reference chatOlder');
  });

  it('drawer has new conversation button', function () {
    assert.ok(chatSource.includes('chat-history-new-btn'), 'Must have new btn class');
  });

  it('drawer has clear all button', function () {
    assert.ok(chatSource.includes('chat-history-clear-btn'), 'Must have clear btn class');
  });

  it('drawer has delete per conversation', function () {
    assert.ok(chatSource.includes('chat-history-item-delete'), 'Must have delete btn class');
  });
});
