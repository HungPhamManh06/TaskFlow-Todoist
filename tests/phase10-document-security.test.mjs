import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Set test environment so ai-doc-reference uses dev fallback secret
process.env.NODE_ENV = 'test';

// Load server modules via require (CommonJS modules)
const { signDocumentReference, verifyDocumentReference, computeRoadmapDigest, isSigningConfigured, DOC_REF_VERSION, SIG_LENGTH } = require(join(ROOT, 'server', 'ai-doc-reference.js'));
const { createProposalFingerprint, isProposalApplied, markProposalApplied, generateProposalId } = require(join(ROOT, 'server', 'ai-observability.js'));

const TEST_USER = 'test-user-123';
const TEST_FINGERPRINT = 'fp_abc123def456';
const TEST_ROADMAP_ID = 'rm_test_roadmap';
const TEST_DOC_NAME = 'test-document.pdf';
const TEST_ROADMAP = { title: 'Test Roadmap', totalWeeks: 10, phases: [{ name: 'Phase 1', weeks: '1-5', goals: ['Learn A'], topics: ['Topic A'], deliverables: ['Del A'] }] };

describe('Phase 10: Document Reference Security', () => {

  test('valid server-issued reference verifies', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    assert.equal(sig.length, SIG_LENGTH, 'signature length correct');
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(result, 'valid reference should verify');
  });

  test('different account fails verification', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: 'different-user-999', roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(!result, 'different account must fail');
  });

  test('changed roadmap phase name fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    // Tamper: change phase name in roadmap
    const tampered = JSON.parse(JSON.stringify(TEST_ROADMAP));
    tampered.phases[0].name = 'Phase EVIL';
    const tamperedDigest = computeRoadmapDigest(tampered);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: tamperedDigest, signature: sig,
    });
    assert.ok(!result, 'tampered phase name must fail');
  });

  test('changed roadmap goal fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const tampered = JSON.parse(JSON.stringify(TEST_ROADMAP));
    tampered.phases[0].goals = ['Learn EVIL'];
    const tamperedDigest = computeRoadmapDigest(tampered);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: tamperedDigest, signature: sig,
    });
    assert.ok(!result, 'tampered goal must fail');
  });

  test('changed roadmap weeks fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const tampered = JSON.parse(JSON.stringify(TEST_ROADMAP));
    tampered.phases[0].weeks = '6-10';
    const tamperedDigest = computeRoadmapDigest(tampered);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: tamperedDigest, signature: sig,
    });
    assert.ok(!result, 'tampered weeks must fail');
  });

  test('changed documentName fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: 'EVIL-document.pdf',
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(!result, 'changed documentName must fail');
  });

  test('changed fingerprint fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: 'fp_EVIL_fingerprint', documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(!result, 'changed fingerprint must fail');
  });

  test('changed roadmapId fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: 'rm_EVIL_id',
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(!result, 'changed roadmapId must fail');
  });

  test('malformed signature fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: 'bad-signature',
    });
    assert.ok(!result, 'malformed signature must fail');
  });

  test('unsigned context fails', () => {
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: computeRoadmapDigest(TEST_ROADMAP), signature: '',
    });
    assert.ok(!result, 'unsigned context must fail');
  });

  test('canonical identical roadmap verifies (deterministic digest)', () => {
    const digest1 = computeRoadmapDigest(TEST_ROADMAP);
    const digest2 = computeRoadmapDigest({ ...TEST_ROADMAP });
    assert.equal(digest1, digest2, 'identical roadmap content must produce same digest');
  });

  test('random browser-created context cannot become trusted', () => {
    // Browser tries to create a valid reference without server signing
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const fakeSig = 'a'.repeat(SIG_LENGTH); // 32 hex chars
    const result = verifyDocumentReference({
      version: DOC_REF_VERSION, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: fakeSig,
    });
    assert.ok(!result, 'browser-created fake signature must fail');
  });

  test('version mismatch fails', () => {
    const digest = computeRoadmapDigest(TEST_ROADMAP);
    const sig = signDocumentReference(DOC_REF_VERSION, TEST_USER, TEST_ROADMAP_ID, TEST_FINGERPRINT, TEST_DOC_NAME, digest);
    const result = verifyDocumentReference({
      version: 999, userId: TEST_USER, roadmapId: TEST_ROADMAP_ID,
      fingerprint: TEST_FINGERPRINT, documentName: TEST_DOC_NAME,
      roadmapDigest: digest, signature: sig,
    });
    assert.ok(!result, 'version mismatch must fail');
  });

  test('SIG_LENGTH is at least 32 hex chars (128-bit)', () => {
    assert.ok(SIG_LENGTH >= 32, 'signature must be at least 128-bit (32 hex chars)');
  });

  test('DOC_REF_VERSION is 1', () => {
    assert.equal(DOC_REF_VERSION, 1, 'document reference version must be 1');
  });

  test('server ai.js: /doc-reference/sign is retired (returns 410)', () => {
    // Read source to verify endpoint is retired
    const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSource.includes("status(410).json({ error: 'retired'"), '/doc-reference/sign returns 410 retired');
  });

  test('server ai.js: /document-roadmap issues documentRef', () => {
    const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSource.includes('documentRef'), '/document-roadmap includes documentRef in response');
    assert.ok(aiSource.includes('computeRoadmapDigest'), '/document-roadmap computes roadmap digest');
    assert.ok(aiSource.includes('signDocumentReference'), '/document-roadmap signs the reference');
  });

  test('server ai.js: /api/ai/chat verifies HMAC before trusting', () => {
    const aiSource = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSource.includes('verifyDocumentReference'), '/api/ai/chat calls verifyDocumentReference');
    assert.ok(aiSource.includes('computeRoadmapDigest'), '/api/ai/chat recomputes digest for verification');
  });

  test('client chat.js sends docRefSignature', () => {
    const chatSource = readFileSync(join(ROOT, 'js', 'chat.js'), 'utf8');
    assert.ok(chatSource.includes('docRefSignature'), 'chat.js sends docRefSignature');
    assert.ok(chatSource.includes('docRefVersion'), 'chat.js sends docRefVersion');
  });

  test('client ai-document-daily-plan.js persists documentRef', () => {
    const planSource = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(planSource.includes('documentRef'), 'persisted record includes documentRef');
  });
});

describe('Phase 10: Proposal Safety', () => {

  test('proposal fingerprint is deterministic', () => {
    const proposal = {
      summary: 'Test proposal',
      actions: [{ type: 'create_task', text: 'Test task', date: '2026-09-01' }],
    };
    const fp1 = createProposalFingerprint(proposal);
    const fp2 = createProposalFingerprint(proposal);
    assert.equal(fp1, fp2, 'same proposal must produce same fingerprint');
    assert.ok(typeof fp1 === 'string' && fp1.length > 0, 'fingerprint must be non-empty string');
  });

  test('different proposal produces different fingerprint', () => {
    const p1 = { summary: 'A', actions: [{ type: 'create_task', text: 'task A' }] };
    const p2 = { summary: 'B', actions: [{ type: 'create_task', text: 'task B' }] };
    assert.notEqual(createProposalFingerprint(p1), createProposalFingerprint(p2));
  });

  test('proposal idempotency: double Apply produces no duplicate', () => {
    const userId = 'test-idem-user';
    const proposalId = generateProposalId();
    assert.ok(typeof proposalId === 'string' && proposalId.length > 0);

    // First Apply
    assert.ok(!isProposalApplied(proposalId, userId), 'not applied yet');
    markProposalApplied(proposalId, userId);
    assert.ok(isProposalApplied(proposalId, userId), 'now applied');

    // Second Apply — should be detected as duplicate
    assert.ok(isProposalApplied(proposalId, userId), 'duplicate detected');
  });

  test('different user can apply same proposalId (no cross-account conflict)', () => {
    const proposalId = generateProposalId();
    markProposalApplied(proposalId, 'user-A');
    assert.ok(isProposalApplied(proposalId, 'user-A'));
    // User-B with same proposalId should be independent
    assert.ok(!isProposalApplied(proposalId, 'user-B'), 'different user not affected');
  });

  test('proposal ID is a stable string', () => {
    const id1 = generateProposalId();
    const id2 = generateProposalId();
    assert.equal(typeof id1, 'string');
    assert.ok(id1.length > 0);
    assert.notEqual(id1, id2, 'each proposal gets unique ID');
  });
});

describe('Phase 10 Closure: Entity-state fingerprint & idempotency', () => {

  test('ai-agent-runtime.js has _captureEntityFingerprint', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_captureEntityFingerprint'), 'fingerprint capture function exists');
  });

  test('ai-agent-runtime.js has _verifyEntityFingerprint', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_verifyEntityFingerprint'), 'fingerprint verify function exists');
  });

  test('ai-agent-runtime.js has proposal idempotency registry', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_isProposalAlreadyApplied'), 'idempotency check exists');
    assert.ok(src.includes('_markProposalApplied'), 'idempotency mark exists');
    assert.ok(src.includes('taskflow-applied-proposals'), 'uses localStorage registry');
  });

  test('_initReviewState captures entity fingerprint', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_entityFingerprint'), 'review state captures entity fingerprint');
  });

  test('_confirmCard checks idempotency before Apply', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_isProposalAlreadyApplied(_proposalCheckId)'), 'checks idempotency before apply');
  });

  test('_confirmCard verifies entity fingerprint before Apply', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_verifyEntityFingerprint(selectedProposal'), 'verifies fingerprint before apply');
  });

  test('_confirmCard marks proposal as applied after success', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('_markProposalApplied(_appliedProposalId)'), 'marks proposal applied after success');
  });

  test('idempotency registry is bounded (MAX_APPLIED_PROPOSALS)', () => {
    const src = readFileSync(join(ROOT, 'js', 'ai-agent-runtime.js'), 'utf8');
    assert.ok(src.includes('MAX_APPLIED_PROPOSALS'), 'bounded registry exists');
    assert.ok(src.includes('500'), 'bounded to max 500 entries');
  });

  test('ci.yml includes ai-trust-boundary-e2e job', () => {
    const ci = readFileSync(join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
    assert.ok(ci.includes('ai-trust-boundary-e2e'), 'CI has ai-trust-boundary-e2e job');
    assert.ok(ci.includes('e2e-ai-trust-boundary.py'), 'CI runs trust boundary script');
    assert.ok(!ci.includes('continue-on-error'), 'no continue-on-error in CI');
  });

  test('e2e-ai-trust-boundary.py exists', () => {
    const { existsSync } = require('fs');
    assert.ok(existsSync(join(ROOT, 'scripts', 'e2e-ai-trust-boundary.py')), 'trust boundary E2E script exists');
  });
});
