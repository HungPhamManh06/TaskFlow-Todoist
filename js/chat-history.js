// TaskFlow — Chat History Module (js/chat-history.js)
// Persistent local conversation history for TaskFlow Assistant.
// LOCAL ONLY — never synced to cloud, never stored in sync data.
// Account-isolated: each user sees only their own conversations.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaskFlowChatHistory = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  /* ---- Constants ---- */
  var STORAGE_PREFIX = 'taskflow-chat-history-v1:';
  var MAX_CONVERSATIONS = 30;
  var MAX_MESSAGES = 60;
  var MAX_MESSAGE_CHARS = 8000;
  var MAX_TOTAL_STORAGE_BYTES = 1024 * 1024; // 1 MB
  var RETENTION_DAYS = 90;
  var MAX_TITLE_CHARS = 50;
  var VERSION = 1;

  /* ---- ID generation ---- */
  function _id(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---- Storage helpers ---- */
  function _storageKey(accountScope) {
    // Never include token in key; use a safe stable scope
    return STORAGE_PREFIX + (accountScope || 'anon');
  }

  function _readRaw(key) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _writeRaw(key, data) {
    try {
      var json = JSON.stringify(data);
      // Enforce storage budget
      if (json.length > MAX_TOTAL_STORAGE_BYTES) {
        // Prune oldest conversations until we fit
        while (data.conversations && data.conversations.length > 1 && JSON.stringify(data).length > MAX_TOTAL_STORAGE_BYTES) {
          data.conversations.splice(0, 1);
        }
      }
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // Storage full or unavailable — silent failure
    }
  }

  /* ---- Sanitize restored data ---- */
  function _sanitizeConversation(conv) {
    if (!conv || typeof conv !== 'object') return null;
    var safe = {
      id: String(conv.id || ''),
      title: String(conv.title || '').slice(0, MAX_TITLE_CHARS),
      createdAt: Number(conv.createdAt) || Date.now(),
      updatedAt: Number(conv.updatedAt) || Date.now(),
      messages: []
    };
    if (!safe.id) return null;
    if (Array.isArray(conv.messages)) {
      for (var i = 0; i < conv.messages.length && safe.messages.length < MAX_MESSAGES; i++) {
        var m = conv.messages[i];
        if (!m || typeof m !== 'object') continue;
        var role = m.role === 'assistant' ? 'assistant' : 'user';
        var content = typeof m.content === 'string' ? m.content.slice(0, MAX_MESSAGE_CHARS) : '';
        if (!content) continue;
        safe.messages.push({
          id: String(m.id || _id('m')),
          role: role,
          content: content,
          attachment: (m.attachment && typeof m.attachment === 'object') ? {
            type: String(m.attachment.type || ''),
            name: String(m.attachment.name || '').slice(0, 200),
            size: Number(m.attachment.size) || 0
          } : null,
          createdAt: Number(m.createdAt) || Date.now()
        });
      }
    }
    return safe;
  }

  function _sanitizeState(raw) {
    if (!raw || typeof raw !== 'object') return _emptyState();
    // Strip __proto__, constructor, etc.
    var state = {
      version: VERSION,
      activeConversationId: String(raw.activeConversationId || ''),
      conversations: []
    };
    if (Array.isArray(raw.conversations)) {
      for (var i = 0; i < raw.conversations.length; i++) {
        var conv = _sanitizeConversation(raw.conversations[i]);
        if (conv) state.conversations.push(conv);
      }
    }
    // Sort newest first
    state.conversations.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    // Enforce max
    while (state.conversations.length > MAX_CONVERSATIONS) {
      state.conversations.pop();
    }
    // Validate active ID
    if (state.activeConversationId) {
      var found = false;
      for (var j = 0; j < state.conversations.length; j++) {
        if (state.conversations[j].id === state.activeConversationId) { found = true; break; }
      }
      if (!found) state.activeConversationId = state.conversations.length > 0 ? state.conversations[0].id : '';
    }
    return state;
  }

  function _emptyState() {
    return { version: VERSION, activeConversationId: '', conversations: [] };
  }

  /* ---- Title generation ---- */
  function _generateTitle(firstUserMessage) {
    if (!firstUserMessage) return 'Cuộc trò chuyện mới';
    // Strip markdown, HTML-like, normalize whitespace
    var t = firstUserMessage
      .replace(/[*_`#>\[\]()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t) return 'Cuộc trò chuyện mới';
    return t.length > MAX_TITLE_CHARS ? t.slice(0, MAX_TITLE_CHARS - 1) + '…' : t;
  }

  /* ---- Retention pruning ---- */
  function _pruneByRetention(state) {
    var cutoff = Date.now() - (RETENTION_DAYS * 86400000);
    state.conversations = state.conversations.filter(function (c) {
      return c.updatedAt > cutoff;
    });
  }

  /* ---- Public API ---- */
  var api = {

    /** Get or create a default state for the account scope */
    load: function (accountScope) {
      var key = _storageKey(accountScope);
      var raw = _readRaw(key);
      if (!raw) return _emptyState();
      var state = _sanitizeState(raw);
      _pruneByRetention(state);
      return state;
    },

    /** Persist state for the account scope */
    save: function (accountScope, state) {
      if (!state) return;
      _pruneByRetention(state);
      var key = _storageKey(accountScope);
      _writeRaw(key, state);
    },

    /** List conversations (sorted newest first) */
    listConversations: function (accountScope) {
      var state = api.load(accountScope);
      return state.conversations;
    },

    /** Get a single conversation by ID */
    getConversation: function (accountScope, conversationId) {
      var state = api.load(accountScope);
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === conversationId) return state.conversations[i];
      }
      return null;
    },

    /** Create a new conversation and set it active */
    createConversation: function (accountScope, title) {
      var state = api.load(accountScope);
      var conv = {
        id: _id('c'),
        title: title || 'Cuộc trò chuyện mới',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      state.conversations.unshift(conv);
      state.activeConversationId = conv.id;
      // Enforce max
      while (state.conversations.length > MAX_CONVERSATIONS) {
        state.conversations.pop();
      }
      api.save(accountScope, state);
      return conv;
    },

    /** Update conversation metadata (title, etc.) */
    updateConversation: function (accountScope, conversationId, updates) {
      var state = api.load(accountScope);
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === conversationId) {
          var conv = state.conversations[i];
          if (updates && typeof updates.title === 'string') {
            conv.title = updates.title.slice(0, MAX_TITLE_CHARS);
          }
          conv.updatedAt = Date.now();
          // Move to front
          state.conversations.splice(i, 1);
          state.conversations.unshift(conv);
          api.save(accountScope, state);
          return conv;
        }
      }
      return null;
    },

    /** Delete a single conversation */
    deleteConversation: function (accountScope, conversationId) {
      var state = api.load(accountScope);
      var wasActive = state.activeConversationId === conversationId;
      state.conversations = state.conversations.filter(function (c) {
        return c.id !== conversationId;
      });
      if (wasActive) {
        state.activeConversationId = state.conversations.length > 0 ? state.conversations[0].id : '';
      }
      api.save(accountScope, state);
      return state;
    },

    /** Clear all conversations for this account */
    clearAll: function (accountScope) {
      var state = _emptyState();
      api.save(accountScope, state);
      return state;
    },

    /** Set the active conversation */
    setActiveConversation: function (accountScope, conversationId) {
      var state = api.load(accountScope);
      state.activeConversationId = conversationId;
      api.save(accountScope, state);
      return state;
    },

    /** Get active conversation ID */
    getActiveConversationId: function (accountScope) {
      var state = api.load(accountScope);
      return state.activeConversationId;
    },

    /** Add a message to a conversation */
    addMessage: function (accountScope, conversationId, message) {
      if (!message || typeof message !== 'object') return null;
      var state = api.load(accountScope);
      for (var i = 0; i < state.conversations.length; i++) {
        if (state.conversations[i].id === conversationId) {
          var conv = state.conversations[i];
          var msg = {
            id: _id('m'),
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: typeof message.content === 'string' ? message.content.slice(0, MAX_MESSAGE_CHARS) : '',
            attachment: (message.attachment && typeof message.attachment === 'object') ? {
              type: String(message.attachment.type || ''),
              name: String(message.attachment.name || '').slice(0, 200),
              size: Number(message.attachment.size) || 0
            } : null,
            createdAt: Date.now()
          };
          if (!msg.content) return null;
          conv.messages.push(msg);
          conv.updatedAt = Date.now();
          // Auto-generate title from first user message if still default
          if (conv.title === 'Cuộc trò chuyện mới' && msg.role === 'user') {
            conv.title = _generateTitle(msg.content);
          }
          // Enforce message limit
          while (conv.messages.length > MAX_MESSAGES) {
            conv.messages.shift();
          }
          // Move to front
          state.conversations.splice(i, 1);
          state.conversations.unshift(conv);
          api.save(accountScope, state);
          return msg;
        }
      }
      return null;
    },

    /** Rename a conversation */
    renameConversation: function (accountScope, conversationId, title) {
      return api.updateConversation(accountScope, conversationId, { title: title });
    },

    /** Get the bounded recent messages for provider history */
    getProviderHistory: function (accountScope, conversationId, maxMessages) {
      maxMessages = maxMessages || 10;
      var conv = api.getConversation(accountScope, conversationId);
      if (!conv) return [];
      var msgs = conv.messages.slice(-maxMessages);
      return msgs.map(function (m) {
        return { role: m.role, content: m.content };
      });
    },

    /** Check if a conversation has messages */
    hasMessages: function (accountScope, conversationId) {
      var conv = api.getConversation(accountScope, conversationId);
      return conv && conv.messages && conv.messages.length > 0;
    },

    /** Get total storage size in bytes (approximate) */
    getStorageSize: function (accountScope) {
      try {
        var key = _storageKey(accountScope);
        var raw = localStorage.getItem(key);
        return raw ? raw.length : 0;
      } catch (e) {
        return 0;
      }
    },

    /** Get conversation count */
    getConversationCount: function (accountScope) {
      var state = api.load(accountScope);
      return state.conversations.length;
    },

    // Expose for testing
    _generateTitle: _generateTitle,
    _sanitizeState: _sanitizeState,
    _storageKey: _storageKey,
    MAX_CONVERSATIONS: MAX_CONVERSATIONS,
    MAX_MESSAGES: MAX_MESSAGES,
    MAX_MESSAGE_CHARS: MAX_MESSAGE_CHARS,
    MAX_TOTAL_STORAGE_BYTES: MAX_TOTAL_STORAGE_BYTES,
    RETENTION_DAYS: RETENTION_DAYS
  };

  return api;
});
