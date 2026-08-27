// TaskFlow — Canonical Document Reference (Phase 9).
// Server-side HMAC-signed document references.
// Prevents browser from forging arbitrary trusted document context.
// Uses a bounded document context contract with integrity/account binding.
'use strict';

const crypto = require('crypto');

// Signing secret from env — fallback to a random per-process key
// (acceptable for single-process deployments; multi-process needs shared secret)
const _docSecret = process.env.AI_DOC_SIGN_SECRET || crypto.randomBytes(32).toString('hex');
const HMAC_ALGO = 'sha256';
const SIG_LENGTH = 16; // hex chars of HMAC to use as signature

/**
 * Sign a document reference payload.
 * Payload includes: userId + fingerprint + roadmapId + documentName.
 * Signature = HMAC-SHA256(secret, canonicalString).slice(0, SIG_LENGTH)
 */
function signDocumentReference(userId, fingerprint, roadmapId, documentName) {
  const canonical = [userId || '', fingerprint || '', roadmapId || '', documentName || ''].join('|');
  const hmac = crypto.createHmac(HMAC_ALGO, _docSecret).update(canonical).digest('hex');
  return hmac.slice(0, SIG_LENGTH);
}

/**
 * Verify a document reference signature.
 * Returns true if the signature is valid for the given payload.
 */
function verifyDocumentReference(userId, fingerprint, roadmapId, documentName, signature) {
  if (!userId || !fingerprint || !roadmapId || !documentName || !signature) return false;
  if (typeof signature !== 'string' || signature.length !== SIG_LENGTH) return false;
  const expected = signDocumentReference(userId, fingerprint, roadmapId, documentName);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
  } catch (e) {
    return false;
  }
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
 * Phase 9: now also validates documentRef (HMAC-signed reference).
 */
function sanitizeDocumentContext(raw, accountId) {
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

  // Phase 9: Validate documentRef signature if provided
  const fingerprint = _capString(raw.fingerprint, 64);
  const roadmapId = _capString(raw.roadmapId, 64);
  const docRefSignature = typeof raw.docRefSignature === 'string' ? raw.docRefSignature : null;

  return {
    roadmap: { title, totalWeeks, phases },
    documentName,
    totalWeeks: totalWeeksCtx,
    cursor,
    fingerprint,
    roadmapId,
    docRefSignature,
  };
}

module.exports = {
  signDocumentReference,
  verifyDocumentReference,
  sanitizeDocumentContext,
  MAX_DOC_CONTEXT_BYTES,
};
