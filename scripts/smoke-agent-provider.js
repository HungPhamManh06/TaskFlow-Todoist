#!/usr/bin/env node
/**
 * Developer-only smoke test: sends a REAL Gemini structured-output request
 * using the exact production AGENT_PROPOSAL_SCHEMA and validates the response.
 *
 * Usage (Linux/macOS):
 *   AI_API_KEY="..." node scripts/smoke-agent-provider.js
 *
 * Usage (Windows PowerShell):
 *   $env:AI_API_KEY="..."; node scripts/smoke-agent-provider.js
 *
 * NEVER commit AI_API_KEY. NEVER run in CI without credentials.
 * Safe output only: structural metadata, never task text or prompt content.
 */
'use strict';

const { createRequire } = require('module');
const require2 = createRequire(__dirname);

// Import from correct modules
const { callAiJson } = require2('../server/ai-provider');
const {
  AGENT_PROPOSAL_SCHEMA,
  AGENT_SYSTEM_INSTRUCTION_VI,
  canonicalizeAgentProposal,
  validateAgentProposal,
} = require2('../server/ai');

const API_KEY = process.env.AI_API_KEY;
if (!API_KEY) {
  console.error('AI_API_KEY not set.');
  console.error('Linux/macOS:  AI_API_KEY="..." node scripts/smoke-agent-provider.js');
  console.error('PowerShell:   $env:AI_API_KEY="..."; node scripts/smoke-agent-provider.js');
  process.exit(1);
}

async function main() {
  console.log('=== Agent Provider Smoke Test ===');
  console.log('Using real production Agent instruction + schema\n');

  // Use the EXACT production system instruction (VI)
  const messages = [
    { role: 'system', content: AGENT_SYSTEM_INSTRUCTION_VI },
    { role: 'user', content: 'Tạo task Test' },
  ];

  let result;
  try {
    result = await callAiJson({
      messages,
      schema: AGENT_PROPOSAL_SCHEMA,
      maxTokens: 1200,
      requestId: 'smoke-' + Date.now(),
      routeName: '/smoke-agent',
    });
  } catch (err) {
    console.error('Provider call failed:', err.message || err);
    process.exit(1);
  }

  console.log('Provider status: ' + (result.ok ? 'OK' : 'FAILED'));
  console.log('Latency: ' + result.latencyMs + 'ms');

  if (!result.ok) {
    console.error('Error: ' + result.error);
    if (result.details) console.error('Details: ' + JSON.stringify(result.details));
    process.exit(1);
  }

  const proposal = result.parsed && typeof result.parsed === 'object'
    ? result.parsed : null;

  if (!proposal) {
    console.error('parsed=false — provider returned unparseable content');
    process.exit(1);
  }

  // Safe structural diagnostics (never print task text or summary content)
  console.log('');
  console.log('parsed=true');
  console.log('summaryEmpty=' + (!proposal.summary || !proposal.summary.trim()));
  console.log('actions=' + (Array.isArray(proposal.actions) ? proposal.actions.length : 'not-array'));

  if (Array.isArray(proposal.actions)) {
    proposal.actions.forEach(function (a, i) {
      console.log('');
      console.log('action[' + i + ']:');
      console.log('  id=' + (a.id || 'MISSING'));
      console.log('  type=' + (a.type || 'MISSING'));
      if (a.args && typeof a.args === 'object') {
        var args = a.args;
        console.log('  taskRef=' + describeValue(args.taskRef));
        console.log('  text=' + describeString(args.text));
        console.log('  date=' + describeValue(args.date));
        console.log('  start=' + describeValue(args.start));
        console.log('  duration=' + describeNumber(args.duration));
        console.log('  priority=' + describeBool(args.priority));
        console.log('  projectId=' + describeValue(args.projectId));
        console.log('  milestoneId=' + describeValue(args.milestoneId));
        console.log('  changes=' + describeChanges(args.changes));
      } else {
        console.log('  args=MISSING/INVALID');
      }
    });
  }

  // PRODUCTION FLOW: canonicalize BEFORE validation
  const canonical = canonicalizeAgentProposal(proposal);
  console.log('');
  console.log('After canonicalization:');
  console.log('  summaryEmpty=' + (!canonical.summary || !canonical.summary.trim()));
  if (Array.isArray(canonical.actions)) {
    canonical.actions.forEach(function (a, i) {
      if (a.args) {
        console.log('  action[' + i + '].priority=' + JSON.stringify(a.args.priority));
        console.log('  action[' + i + '].changes=' + describeChanges(a.args.changes));
      }
    });
  }

  // Validate CANONICAL (not raw) — matches production route
  const v = validateAgentProposal(canonical, {
    taskUids: new Set(),
    projectIds: new Set(),
    milestoneIdSet: new Set(),
  });
  console.log('');
  console.log('Server validation: ok=' + v.ok);
  if (!v.ok) {
    console.error('  errors=' + JSON.stringify(v.errors));
    console.error('');
    console.error('=== SMOKE TEST FAILED ===');
    process.exit(1);
  }

  console.log('');
  console.log('=== SMOKE TEST PASSED ===');
}

/* ---- Safe description helpers ---- */
function describeValue(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return 'string(' + v.length + ' chars)';
  if (typeof v === 'number') return 'number(' + v + ')';
  if (typeof v === 'boolean') return 'boolean(' + v + ')';
  if (typeof v === 'object') return 'object';
  return typeof v;
}

function describeString(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return 'string(' + v.length + ' chars)';
  return typeof v;
}

function describeNumber(v) {
  if (v === null) return 'null';
  if (typeof v === 'number') return 'integer(' + v + ')';
  return typeof v;
}

function describeBool(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return 'boolean(' + v + ')';
  return typeof v;
}

function describeChanges(v) {
  if (v === null) return 'null';
  if (typeof v === 'object' && v !== null) return 'object(keys=' + Object.keys(v).length + ')';
  return typeof v;
}

main();
