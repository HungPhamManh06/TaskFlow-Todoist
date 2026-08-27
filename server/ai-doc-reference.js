// TaskFlow — Canonical Document Reference (Phase 10).
// Server-issued HMAC-signed document references with roadmap content binding.
// Prevents browser from forging arbitrary trusted document context.
// Signature covers: version + userId + roadmapId + fingerprint + documentName + roadmapDigest.
'use strict';

const crypto = require('crypto');

// ── Signing secret ──────────────────────────────────────
// Production MUST set AI_DOC_SIGN_SECRET. Random fallback is ONLY for dev/test.
// Using random secret means references don't persist across server restarts.
const _rawSecret = process.env.AI_DOC_SIGN_SECRET || '';
const _isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
const _devFallback = crypto.randomBytes(32).toString('hex');

// Fail closed in production when secret not configured
const _docSecret = _rawSecret
  ? _rawSecret
  : (_isDev ? _devFallback : '');

const HMAC_ALGO = 'sha256';
const SIG_LENGTH = 32; // Full 32 hex chars = 128-bit authentication tag
const DOC_REF_VERSION = 1;

/**
 * Compute canonical roadmap digest (SHA-256 of sorted, deterministic roadmap).
 * Ensures same semantic content → same digest.
 * @param {object} roadmap - {title, totalWeeks, phases[]}
 * @returns {string} hex digest
 */
function computeRoadmapDigest(roadmap) {
  if (!roadmap || typeof roadmap !== 'object') return '';
  const canonical = {
    title: typeof roadmap.title === 'string' ? roadmap.title : '',
    totalWeeks: Number.isFinite(roadmap.totalWeeks) ? roadmap.totalWeeks : null,
    phases: Array.isArray(roadmap.phases)
      ? roadmap.phases.map(function (p) {
          if (!p || typeof p !== 'object') return null;
          return {
            name: typeof p.name === 'string' ? p.name : '',
            weeks: typeof p.weeks === 'string' ? p.weeks : '',
            goals: Array.isArray(p.goals) ? p.goals.slice().sort() : [],
            deliverables: Array.isArray(p.deliverables) ? p.deliverables.slice().sort() : [],
            topics: Array.isArray(p.topics) ? p.topics.slice().sort() : [],
          };
        }).filter(Boolean)
      : [],
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 32);
}

/**
 * Build the canonical signing string for a document reference.
 * Includes version + account + identity + content digest.
 */
function _buildSigningString(version, userId, roadmapId, fingerprint, documentName, roadmapDigest) {
  return [version, userId || '', roadmapId || '', fingerprint || '', documentName || '', roadmapDigest || ''].join('|');
}

/**
 * Sign a document reference payload.
 * This is SERVER-ONLY — called from /document-roadmap after canonicalization.
 * Browser MUST NOT call this directly for arbitrary content.
 * @returns {string} hex signature (SIG_LENGTH hex chars)
 */
function signDocumentReference(version, userId, roadmapId, fingerprint, documentName, roadmapDigest) {
  const canonical = _buildSigningString(version, userId, roadmapId, fingerprint, documentName, roadmapDigest);
  const hmac = crypto.createHmac(HMAC_ALGO, _docSecret).update(canonical).digest('hex');
  return hmac.slice(0, SIG_LENGTH);
}

/**
 * Verify a document reference signature.
 * Returns true if the signature is valid for the given payload.
 * @param {object} ref - {version, userId, roadmapId, fingerprint, documentName, roadmapDigest, signature}
 */
function verifyDocumentReference(ref) {
  if (!ref || typeof ref !== 'object') return false;
  if (!_docSecret) return false; // Fail closed: no secret = no verification possible

  const { version, userId, roadmapId, fingerprint, documentName, roadmapDigest, signature } = ref;
  if (!userId || !fingerprint || !roadmapId || !documentName || !signature) return false;
  if (typeof signature !== 'string' || signature.length !== SIG_LENGTH) return false;
  if (version !== DOC_REF_VERSION) return false;

  const expected = signDocumentReference(version, userId, roadmapId, fingerprint, documentName, roadmapDigest || '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch (e) {
    return false;
  }
}

/**
 * Check if production signing secret is configured.
 * Used by health-check / deployment verification.
 */
function isSigningConfigured() {
  return !!_rawSecret;
}

// ── Bounded document context schema validation ──────────

const MAX_DOC_CONTEXT_BYTES = 16384; // 16 KB
const MAX_PHASES = 50;
const MAX_STRING_LEN = 200;
const MAX_GOALS_PER_PHASE = 10;
const MAX_DELIVERABLES_PER_PHASE = 10;
const MAX_TOPICS_PER_PHASE = 15;
const MAX_WEEKS = 524;

function _capString(v, max) {
  if (typeof v !== 'string') return '';
  return v.length > max ? v.slice(0, max) : v;
}

/**
 * Validate a documentContext object from the browser.
 * Returns sanitized object or null if invalid.
 * Phase 10: validates schema + extracts reference fields for verification.
 */
function sanitizeDocumentContext(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  // Size check first
  try {
    if (Buffer.byteLength(JSON.stringify(raw), 'utf8') > MAX_DOC_CONTEXT_BYTES) return null;
  } catch (e) { return null; }

  const roadmap = raw.roadmap;
  if (!roadmap || typeof roadmap !== 'object' || Array.isArray(roadmap)) return null;
  if (!roadmap.phases || !Array.isArray(roadmap.phases) || roadmap.phases.length === 0) return null;
  if (roadmap.phases.length > MAX_PHASES) return null;

  // Validate roadmap structure
  const title = _capString(roadmap.title, MAX_STRING_LEN);
  const totalWeeks = Number.isFinite(roadmap.totalWeeks) && roadmap.totalWeeks > 0 && roadmap.totalWeeks <= MAX_WEEKS
    ? Math.round(roadmap.totalWeeks) : null;

  const phases = roadmap.phases.map(function (p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    return {
      name: _capString(p.name, MAX_STRING_LEN),
      weeks: typeof p.weeks === 'string' ? p.weeks.slice(0, 30) : (Number.isFinite(p.weeks) ? String(p.weeks) : ''),
      goals: Array.isArray(p.goals) ? p.goals.filter(function (g) { return typeof g === 'string'; }).slice(0, MAX_GOALS_PER_PHASE).map(function (g) { return g.slice(0, MAX_STRING_LEN); }) : [],
      deliverables: Array.isArray(p.deliverables) ? p.deliverables.filter(function (d) { return typeof d === 'string'; }).slice(0, MAX_DELIVERABLES_PER_PHASE).map(function (d) { return d.slice(0, MAX_STRING_LEN); }) : [],
      topics: Array.isArray(p.topics) ? p.topics.filter(function (t) { return typeof t === 'string'; }).slice(0, MAX_TOPICS_PER_PHASE).map(function (t) { return t.slice(0, MAX_STRING_LEN); }) : [],
    };
  }).filter(Boolean);

  if (phases.length === 0) return null;

  const documentName = _capString(raw.documentName, MAX_STRING_LEN) || 'document';
  const totalWeeksCtx = Number.isFinite(raw.totalWeeks) && raw.totalWeeks > 0 && raw.totalWeeks <= MAX_WEEKS
    ? Math.round(raw.totalWeeks) : totalWeeks;

  // Validate cursor
  let cursor = null;
  if (raw.cursor && typeof raw.cursor === 'object' && !Array.isArray(raw.cursor)) {
    const c = raw.cursor;
    cursor = {
      nextWeek: Number.isFinite(c.nextWeek) && c.nextWeek >= 0 && c.nextWeek <= 9999 ? Math.round(c.nextWeek) : 0,
      lastAppliedDaysCount: Number.isFinite(c.lastAppliedDaysCount) && c.lastAppliedDaysCount >= 0 && c.lastAppliedDaysCount <= 365 ? Math.round(c.lastAppliedDaysCount) : 0,
    };
  }

  // Extract reference fields for verification
  const fingerprint = _capString(raw.fingerprint, 64);
  const roadmapId = _capString(raw.roadmapId, 64);
  const docRefSignature = typeof raw.docRefSignature === 'string' ? raw.docRefSignature : null;
  const docRefVersion = typeof raw.docRefVersion === 'number' ? raw.docRefVersion : null;

  return {
    roadmap: { title, totalWeeks, phases },
    documentName,
    totalWeeks: totalWeeksCtx,
    cursor,
    fingerprint,
    roadmapId,
    docRefSignature,
    docRefVersion,
  };
}

module.exports = {
  signDocumentReference,
  verifyDocumentReference,
  sanitizeDocumentContext,
  computeRoadmapDigest,
  isSigningConfigured,
  MAX_DOC_CONTEXT_BYTES,
  SIG_LENGTH,
  DOC_REF_VERSION,
};
