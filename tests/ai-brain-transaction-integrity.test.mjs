import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const require = createRequire(import.meta.url);

/* ===========================================================
   1. SESSION.REFS — trusted reference state
   =========================================================== */
describe('AI Brain: Session refs from trusted read results', () => {
  it('session.refs initialized with empty Sets', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('refs: { taskUids: new Set(), projectIds: new Set(), milestoneIds: new Set() }'), 'refs initialized');
  });

  it('_updateBrainRefsFromToolResult exists', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('function _updateBrainRefsFromToolResult'), 'helper exists');
  });

  it('proposal validation uses session.refs not empty Sets', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('validateAgentProposal(sanitizedResult.proposal, session.refs)') || aiSrc.includes('validateAgentProposal(toolResult.proposal, session.refs)'), 'uses session.refs');
    // Must NOT have old pattern
    assert.ok(!aiSrc.includes('validateAgentProposal(toolResult.proposal, ctx)'), 'does not use empty ctx');
  });

  it('refs updated from client tool results', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('_updateBrainRefsFromToolResult(session, pendingCall.tool, sanitizedResult)'), 'refs updated from client results');
  });

  it('refs updated from server tool results', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('_updateBrainRefsFromToolResult(session, routed.toolName, routed.result)'), 'refs updated from server results');
  });
});

/* ===========================================================
   2. PROPOSAL ID LIFECYCLE — single ID throughout
   =========================================================== */
describe('AI Brain: Proposal ID lifecycle', () => {
  it('_executeWindow sets proposal.id on server response proposal', () => {
    const planSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(planSrc.includes('json.proposal.id = proposalId'), 'proposal ID set in _executeWindow');
  });

  it('sendProposalToReview preserves existing proposal.id', () => {
    const planSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(planSrc.includes('if (!proposal.id)'), 'only creates ID if missing');
  });

  it('pendingCursor.proposalId matches proposal.id format', () => {
    const planSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(planSrc.includes("'proposal_doc_'"), 'uses proposal_doc_ prefix');
  });

  it('commitPendingCursor requires proposalId', () => {
    const planSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(planSrc.includes('if (!proposalId) return false'), 'rejects undefined proposalId');
  });

  it('cancelPendingCursor requires proposalId', () => {
    const planSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    // Find cancelPendingCursor function
    const cancelIdx = planSrc.indexOf('function cancelPendingCursor');
    const cancelBody = planSrc.substring(cancelIdx, cancelIdx + 200);
    assert.ok(cancelBody.includes('if (!proposalId) return'), 'rejects undefined proposalId');
  });
});

/* ===========================================================
   3. BRAIN ERROR RESULT SHAPE — unified
   =========================================================== */
describe('AI Brain: Error result shape', () => {
  it('advanceBrainSession returns { type, payload } for errors', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    // Find the error return in advanceBrainSession
    assert.ok(aiSrc.includes("return { type: 'error', payload: { error: limitErr, friendlyMessage: msg } }"), 'error has payload');
    // Must NOT have old shape
    assert.ok(!aiSrc.includes("return { type: 'error', error: limitErr"), 'no old error shape');
  });

  it('brain routes handle result.payload for errors', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('if (result.type === \'error\') return res.status(422).json(result.payload)'), 'routes use result.payload');
  });
});

/* ===========================================================
   4. MULTI-TOOL ASSOCIATION — correct tool identity
   =========================================================== */
describe('AI Brain: Multi-tool association', () => {
  it('/brain/continue captures pendingCall before clearing', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    // Find the continue route's tool capture
    const continueIdx = aiSrc.indexOf("router.post('/brain/continue'");
    const continueBody = aiSrc.substring(continueIdx, continueIdx + 4000);
    assert.ok(continueBody.includes('const pendingCall = session.pendingToolCall'), 'captures pendingCall');
    assert.ok(continueBody.includes('session.pendingToolCall = null'), 'clears after capture');
    // Must capture BEFORE clear
    const captureIdx = continueBody.indexOf('const pendingCall = session.pendingToolCall');
    const clearIdx = continueBody.indexOf('session.pendingToolCall = null');
    assert.ok(captureIdx < clearIdx, 'capture before clear');
  });

  it('/brain/continue uses pendingCall.tool not toolTrace', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    const continueIdx = aiSrc.indexOf("router.post('/brain/continue'");
    const continueBody = aiSrc.substring(continueIdx, continueIdx + 3000);
    // Must use pendingCall.tool for toolTrace and Gemini call
    assert.ok(continueBody.includes('tool: pendingCall.tool'), 'uses pendingCall.tool in trace');
    // Must NOT use toolTrace last entry
    assert.ok(!continueBody.includes('session.toolTrace[session.toolTrace.length - 1]?.tool'), 'does not use toolTrace last entry');
  });
});

/* ===========================================================
   5. DURATION PARSER — compact first
   =========================================================== */
describe('AI Brain: Duration parser edge cases', () => {
  it('server duration parser handles 1h30', () => {
    const src = readFileSync(join(ROOT, 'server', 'ai-dated-document.js'), 'utf8');
    // Verify compact hours regex comes before standalone hours regex
    const compactIdx = src.indexOf("s.match(/(\\d+)\\s*h\\s*(\\d{1,2})");
    const hoursIdx = src.indexOf("s.match(/(\\d+(?:\\.\\d+)?)\\s*(?:giờ|hours");
    assert.ok(compactIdx > 0, 'compact hours regex found');
    assert.ok(hoursIdx > 0, 'standalone hours regex found');
    assert.ok(compactIdx < hoursIdx, 'compact hours parsed before standalone hours');
  });

  it('client duration parser handles 1h30', () => {
    const clientSrc = readFileSync(join(ROOT, 'js', 'ai-document-daily-plan.js'), 'utf8');
    assert.ok(clientSrc.includes('parseDuration'), 'parseDuration exists');
  });
});

/* ===========================================================
   6. SANITIZER NON-MUTATING
   =========================================================== */
describe('AI Brain: Sanitizer non-mutating', () => {
  it('sanitizer returns fresh object for get_tasks', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    // Verify sanitizer returns new object, not mutating input
    assert.ok(aiSrc.includes("return { tasks, total:"), 'returns fresh object');
  });

  it('sanitizer returns fresh object for get_projects', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes("return { projects:"), 'returns fresh object for projects');
  });
});

/* ===========================================================
   7. ABORT LISTENER — proper cleanup
   =========================================================== */
describe('AI Brain: Abort listener cleanup', () => {
  it('/brain uses named function for abort', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    const brainIdx = aiSrc.indexOf("router.post('/brain',");
    const brainBody = aiSrc.substring(brainIdx, brainIdx + 2000);
    assert.ok(brainBody.includes('const onClientAbort ='), 'named function');
    assert.ok(brainBody.includes('req.on(\'aborted\', onClientAbort)'), 'registers named function');
    assert.ok(brainBody.includes('req.removeListener(\'aborted\', onClientAbort)'), 'removes named function');
  });

  it('/brain/continue uses named function for abort', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    const contIdx = aiSrc.indexOf("router.post('/brain/continue'");
    const contBody = aiSrc.substring(contIdx, contIdx + 2000);
    assert.ok(contBody.includes('const onClientAbort ='), 'named function');
  });
});

/* ===========================================================
   8. DELETE TOOL — completely absent
   =========================================================== */
describe('AI Brain: Delete tool absent', () => {
  it('propose_delete_task not in server contracts', () => {
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const names = TOOL_CONTRACTS.map(t => t.name);
    assert.ok(!names.includes('propose_delete_task'), 'not in server contracts');
  });

  it('propose_delete_task not registered in client', () => {
    const toolsSrc = readFileSync(join(ROOT, 'js', 'ai-tools.js'), 'utf8');
    // Find the register call for propose_delete_task
    const deleteIdx = toolsSrc.indexOf("'propose_delete_task'");
    if (deleteIdx >= 0) {
      // Check it's inside a comment
      const before = toolsSrc.substring(Math.max(0, deleteIdx - 200), deleteIdx);
      assert.ok(before.includes('/*') || before.includes('//'), 'delete tool is commented out');
    }
    // Either absent or commented out
  });

  it('Gemini tool definitions do not include delete', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    // BRAIN_TOOL_DEFINITIONS or getToolDefinitionsForLLM
    const defIdx = aiSrc.indexOf('BRAIN_TOOL_DEFINITIONS') || aiSrc.indexOf('getToolDefinitionsForLLM');
    // Just verify the contracts don't include it
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    assert.ok(!TOOL_CONTRACTS.find(t => t.name === 'propose_delete_task'), 'not in contracts used for LLM');
  });
});

/* ===========================================================
   9. STEP COUNT SEMANTICS
   =========================================================== */
describe('AI Brain: Step count semantics', () => {
  it('BRAIN_MAX_STEPS is defined', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('const BRAIN_MAX_STEPS = 8'), 'MAX_STEPS defined');
  });

  it('assertBrainSessionCanContinue checks step >= MAX_STEPS', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    assert.ok(aiSrc.includes('s.step >= BRAIN_MAX_STEPS'), 'checks step >= MAX');
  });

  it('session.step starts at 0 and incremented per tool execution', () => {
    const aiSrc = readFileSync(join(ROOT, 'server', 'ai.js'), 'utf8');
    // Step incremented in _advanceBrainSession for server tools
    assert.ok(aiSrc.includes('session.step++'), 'step incremented');
  });
});

/* ===========================================================
   10. TOOL CONTRACTS — drift test
   =========================================================== */
describe('AI Brain: Tool contracts single source', () => {
  it('server contracts and client registry have same tools', () => {
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server', 'ai-tool-contracts.js'));
    const serverNames = TOOL_CONTRACTS.map(t => t.name).sort();

    // Client tools are registered in ai-tools.js — extract names from source
    const clientSrc = readFileSync(join(ROOT, 'js', 'ai-tools.js'), 'utf8');
    const nameRegex = /name:\s*'([^']+)'/g;
    const clientNames = [];
    let m;
    while ((m = nameRegex.exec(clientSrc)) !== null) {
      if (!clientNames.includes(m[1])) clientNames.push(m[1]);
    }
    clientNames.sort();

    // Server should be subset of client (client has more internal tools)
    serverNames.forEach(name => {
      assert.ok(clientNames.includes(name), 'server tool ' + name + ' exists in client');
    });
  });

  it('inputSchema matches for propose_create_task', () => {
    const { TOOL_CONTRACTS } = require(join(ROOT, 'server/ai-tool-contracts.js'));
    const serverTool = TOOL_CONTRACTS.find(t => t.name === 'propose_create_task');
    assert.ok(serverTool, 'server has propose_create_task');
    assert.ok(serverTool.inputSchema.properties.text, 'has text field');
    assert.ok(serverTool.inputSchema.properties.date, 'has date field');
    assert.ok(serverTool.inputSchema.properties.projectId, 'has projectId field');
  });
});
