#!/usr/bin/env node
/**
 * Developer-only smoke test: sends a REAL Gemini structured-output request
 * using the exact production AGENT_PROPOSAL_SCHEMA and validates the response.
 *
 * Usage:
 *   AI_API_KEY=... node scripts/smoke-agent-provider.js
 *
 * NEVER commit AI_API_KEY. NEVER run in CI without credentials.
 * Safe output only: structural metadata, never task text or prompt content.
 */
'use strict';

const { createRequire } = require('module');
const require2 = createRequire(__dirname);
const ai = require2('../server/ai.js');

const API_KEY = process.env.AI_API_KEY;
if (!API_KEY) {
  console.error('AI_API_KEY not set. Run: AI_API_KEY=... node scripts/smoke-agent-provider.js');
  process.exit(1);
}

async function main() {
  console.log('=== Agent Provider Smoke Test ===');
  console.log('Sending synthetic create_task request to Gemini...\n');

  const sysInstruction = 'You are a TaskFlow planner. Return ONLY valid JSON matching the schema. Create exactly one task.';
  const messages = [
    { role: 'system', content: sysInstruction },
    { role: 'user', content: 'Create one task called Test Task with 30 minutes duration.' },
  ];

  try {
    const result = await ai.callAiJson({
      messages,
      schema: ai.AGENT_PROPOSAL_SCHEMA,
      maxTokens: 1200,
      requestId: 'smoke-test-' + Date.now(),
      routeName: '/smoke-agent',
    });

    console.log('Provider status: ' + (result.ok ? 'OK' : 'FAILED'));
    if (!result.ok) {
      console.log('Error: ' + result.error);
      if (result.details) console.log('Details: ' + JSON.stringify(result.details));
      process.exit(1);
    }

    console.log('Latency: ' + result.latencyMs + 'ms');
    console.log('');

    // Parse the proposal
    const proposal = result.parsed && typeof result.parsed === 'object'
      ? result.parsed : null;

    if (!proposal) {
      console.log('RESULT: parsed=false — provider returned unparseable content');
      process.exit(1);
    }

    // Safe structural diagnostics (never print task text or summary content)
    console.log('parsed=true');
    console.log('summaryEmpty=' + (!proposal.summary || !proposal.summary.trim()));
    console.log('summaryType=' + typeof proposal.summary);
    console.log('actions=' + (Array.isArray(proposal.actions) ? proposal.actions.length : 'not-array'));
    console.log('');

    if (Array.isArray(proposal.actions)) {
      proposal.actions.forEach(function (a, i) {
        console.log('action[' + i + ']:');
        console.log('  type=' + (a.type || 'MISSING'));
        console.log('  id=' + (a.id || 'MISSING'));
        if (a.args && typeof a.args === 'object') {
          var args = a.args;
          console.log('  taskRef=' + (args.taskRef === null ? 'null' : typeof args.taskRef));
          console.log('  text=' + (typeof args.text === 'string' ? 'string(' + args.text.length + ' chars)' : args.text === null ? 'null' : typeof args.text));
          console.log('  date=' + (args.date === null ? 'null' : typeof args.date));
          console.log('  start=' + (args.start === null ? 'null' : typeof args.start));
          console.log('  duration=' + (typeof args.duration === 'number' ? 'integer(' + args.duration + ')' : args.duration === null ? 'null' : typeof args.duration));
          console.log('  priority=' + (typeof args.priority === 'boolean' ? 'boolean(' + args.priority + ')' : args.priority === null ? 'null' : typeof args.priority));
          console.log('  projectId=' + (args.projectId === null ? 'null' : typeof args.projectId));
          console.log('  milestoneId=' + (args.milestoneId === null ? 'null' : typeof args.milestoneId));
          console.log('  changes=' + (args.changes === null ? 'null' : typeof args.changes));
        } else {
          console.log('  args=MISSING/INVALID');
        }
        console.log('');
      });
    }

    // Run canonicalization
    if (typeof ai.canonicalizeAgentProposal === 'function') {
      const canonical = ai.canonicalizeAgentProposal(proposal);
      console.log('After canonicalization:');
      console.log('  summaryEmpty=' + (!canonical.summary || !canonical.summary.trim()));
      if (Array.isArray(canonical.actions)) {
        canonical.actions.forEach(function (a, i) {
          if (a.args) {
            console.log('  action[' + i + '].priority=' + JSON.stringify(a.args.priority));
            console.log('  action[' + i + '].changes=' + JSON.stringify(a.args.changes));
          }
        });
      }
    }

    // Run server validation
    const v = ai.validateAgentProposal(proposal, { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() });
    console.log('');
    console.log('Server validation: ok=' + v.ok);
    if (!v.ok) {
      console.log('  errors=' + JSON.stringify(v.errors));
    }

    console.log('');
    console.log('=== Smoke test complete ===');
  } catch (err) {
    console.error('Smoke test failed:', err.message || err);
    process.exit(1);
  }
}

main();
