// TaskFlow — Privacy-safe Observability + Proposal Safety (Phase 9).
// Structured logging that NEVER logs user content, task text, document text, or secrets.
// Proposal fingerprinting for stale-state detection and idempotent Apply.
'use strict';

const crypto = require('crypto');

// ── Structured Observability ─────────────────────────────

/**
 * Allowed log fields for AI requests.
 * NEVER log: user message, task text, project names, document content,
 * roadmap content, reflection, mood, API key, JWT/token, provider raw response.
 */
const LOG_ALLOWED_FIELDS = new Set([
  'event', 'requestId', 'route', 'provider', 'model', 'status',
  'latencyMs', 'finishReason', 'toolCallCount', 'documentMode',
  'roadmapDeterministic', 'errorCode', 'statusCode', 'timeoutMs',
  'source', 'brainSessionId', 'step',
]);

/**
 * Fields that must NEVER appear in logs.
 */
const LOG_FORBIDDEN_PATTERNS = [
  /password/i, /token/i, /secret/i, /api[_-]?key/i,
  /authorization/i, /jwt/i, /credential/i,
];

/**
 * Log an AI event with privacy-safe structured data.
 * @param {object} event - {event, requestId, route, status, latencyMs, ...allowed fields}
 */
function logAiEvent(event) {
  if (!event || typeof event !== 'object') return;
  const safe = {};
  for (const [k, v] of Object.entries(event)) {
    if (!LOG_ALLOWED_FIELDS.has(k)) continue;
    if (typeof v === 'string' && LOG_FORBIDDEN_PATTERNS.some(p => p.test(v))) continue;
    if (typeof v === 'number' && Number.isFinite(v)) safe[k] = v;
    else if (typeof v === 'string') safe[k] = v.slice(0, 200);
    else if (typeof v === 'boolean') safe[k] = v;
  }
  safe.timestamp = new Date().toISOString();
  try {
    console.log('[ai-telemetry] ' + JSON.stringify(safe));
  } catch (e) { /* swallow */ }
}

/**
 * Log an AI error event.
 */
function logAiError(requestId, route, errorCode, latencyMs, statusCode) {
  logAiEvent({
    event: 'ai_error',
    requestId: requestId || '',
    route: route || '',
    status: 'error',
    errorCode: errorCode || 'unknown',
    statusCode: statusCode || 500,
    latencyMs: typeof latencyMs === 'number' ? latencyMs : 0,
  });
}

// ── Proposal Fingerprint (Stale-state detection) ─────────

/**
 * Create a lightweight fingerprint of a proposal's targets.
 * Used to detect when state has changed between proposal creation and Apply.
 */
function createProposalFingerprint(proposal) {
  if (!proposal || typeof proposal !== 'object') return null;
  const parts = [];
  if (typeof proposal.summary === 'string') parts.push(proposal.summary);
  if (Array.isArray(proposal.actions)) {
    proposal.actions.forEach(function (a) {
      if (!a || typeof a !== 'object') return;
      parts.push(a.type || '');
      if (a.taskUid) parts.push('uid:' + a.taskUid);
      if (a.args && a.args.taskRef && a.args.taskRef.uid) parts.push('ref:' + a.args.taskRef.uid);
      if (a.args && a.args.date) parts.push('date:' + a.args.date);
      if (a.args && a.args.changes && a.args.changes.date) parts.push('chg:' + a.args.changes.date);
      if (a.args && a.args.text) parts.push('txt:' + a.args.text.slice(0, 50));
    });
  }
  const canonical = parts.join('\x00');
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

// ── Idempotent Apply Registry ────────────────────────────

/**
 * Bounded in-memory registry of applied proposal IDs.
 * Prevents double-Apply from creating duplicate tasks.
 * Scoped per-process (acceptable for single-process deployments).
 */
const _appliedProposals = new Map();
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_APPLIED_ENTRIES = 1000;

function _cleanupAppliedProposals() {
  const now = Date.now();
  for (const [key, val] of _appliedProposals) {
    if (now - val.timestamp > IDEMPOTENCY_TTL_MS) _appliedProposals.delete(key);
  }
  if (_appliedProposals.size > MAX_APPLIED_ENTRIES) {
    const entries = Array.from(_appliedProposals.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
    entries.slice(0, entries.length - MAX_APPLIED_ENTRIES).forEach(([id]) => _appliedProposals.delete(id));
  }
}

/**
 * Check if a proposal has already been applied.
 * @param {string} proposalId
 * @param {string} userId
 * @returns {boolean}
 */
function isProposalApplied(proposalId, userId) {
  if (!proposalId || !userId) return false;
  const key = userId + ':' + proposalId;
  _cleanupAppliedProposals();
  return _appliedProposals.has(key);
}

/**
 * Mark a proposal as applied.
 * @param {string} proposalId
 * @param {string} userId
 */
function markProposalApplied(proposalId, userId) {
  if (!proposalId || !userId) return;
  const key = userId + ':' + proposalId;
  _cleanupAppliedProposals();
  _appliedProposals.set(key, { timestamp: Date.now() });
}

/**
 * Check if a proposal's fingerprint matches current state.
 * @param {string} storedFingerprint
 * @param {object} currentProposal
 * @returns {boolean} true if fingerprints match (state is fresh)
 */
function verifyProposalFingerprint(storedFingerprint, currentProposal) {
  if (!storedFingerprint) return true; // no fingerprint stored → accept
  const current = createProposalFingerprint(currentProposal);
  if (!current) return false;
  return storedFingerprint === current;
}

/**
 * Generate a unique proposal ID if one is not provided.
 */
function generateProposalId() {
  return 'prop_' + Date.now() + '_' + crypto.randomBytes(4).toString('hex');
}

module.exports = {
  logAiEvent,
  logAiError,
  createProposalFingerprint,
  isProposalApplied,
  markProposalApplied,
  verifyProposalFingerprint,
  generateProposalId,
  LOG_ALLOWED_FIELDS,
};
