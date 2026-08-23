#!/usr/bin/env node
/**
 * Schema Ladder Probe — File-Agent Gemini Provider Compatibility
 *
 * Tests each schema variant against the real provider to find the exact
 * first schema change that turns HTTP 200 into HTTP 400.
 *
 * Usage:
 *   node scripts/probe-file-agent-schema.js --step minimal
 *   node scripts/probe-file-agent-schema.js --step all
 *   node scripts/probe-file-agent-schema.js --step tokens
 *   node scripts/probe-file-agent-schema.js --step maxitems
 *   node scripts/probe-file-agent-schema.js --step source
 *   node scripts/probe-file-agent-schema.js --step taskref
 *   node scripts/probe-file-agent-schema.js --step size
 *
 * IMPORTANT: Manual only. Do NOT run in CI.
 *            Requires AI_API_KEY environment variable.
 */
'use strict';

const https = require('https');
const http = require('http');

/* ---- Provider config ---- */
const API_KEY = process.env.AI_API_KEY;
const API_URL = process.env.AI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODEL = process.env.AI_MODEL || 'gemini-3.6-flash';

if (!API_KEY) {
  console.error('ERROR: AI_API_KEY environment variable is required.');
  console.error('Do NOT commit or log this key.');
  process.exit(1);
}

const TEST_DOC = 'Tuần 1: Học kiến thức cơ bản về Embedded Systems.\nTuần 2: Học GPIO Programming.\nTuần 3: Học UART Communication.';
const TEST_MSG = 'Tạo 1 task từ tài liệu này';

/* ---- Schema Ladder ---- */
const SCHEMAS = {
  // A: Absolute minimal — summary + actions with id/type/text
  minimal: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task'] },
            text: { type: 'string' },
          },
          required: ['id', 'type', 'text'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // B: Nested args
  nestedArgs: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task'] },
            args: {
              type: 'object',
              properties: {
                text: { type: 'string' },
              },
              required: ['text'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // C: Basic nullable args
  basicNullable: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task'] },
            args: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                date: { type: ['string', 'null'] },
                duration: { type: ['integer', 'null'] },
                priority: { type: ['boolean', 'null'] },
              },
              required: ['text', 'date', 'duration', 'priority'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // D: All args fields
  fullArgs: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task'] },
            args: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                date: { type: ['string', 'null'] },
                start: { type: ['string', 'null'] },
                duration: { type: ['integer', 'null'] },
                priority: { type: ['boolean', 'null'] },
                projectId: { type: ['string', 'null'] },
                milestoneId: { type: ['string', 'null'] },
              },
              required: ['text', 'date', 'start', 'duration', 'priority', 'projectId', 'milestoneId'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // E: taskRef nullable
  taskRefNullable: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task'] },
            args: {
              type: 'object',
              properties: {
                taskRef: {
                  type: ['object', 'null'],
                  properties: {
                    kind: { type: 'string', enum: ['existing', 'action'] },
                    uid: { type: ['string', 'null'] },
                    actionId: { type: ['string', 'null'] },
                  },
                  required: ['kind', 'uid', 'actionId'],
                  additionalProperties: false,
                },
                text: { type: ['string', 'null'] },
                date: { type: ['string', 'null'] },
                start: { type: ['string', 'null'] },
                duration: { type: ['integer', 'null'] },
                priority: { type: ['boolean', 'null'] },
                projectId: { type: ['string', 'null'] },
                milestoneId: { type: ['string', 'null'] },
              },
              required: ['taskRef', 'text', 'date', 'start', 'duration', 'priority', 'projectId', 'milestoneId'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // F: schedule_task enum
  scheduleEnum: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task', 'schedule_task'] },
            args: {
              type: 'object',
              properties: {
                taskRef: {
                  type: ['object', 'null'],
                  properties: {
                    kind: { type: 'string', enum: ['existing', 'action'] },
                    uid: { type: ['string', 'null'] },
                    actionId: { type: ['string', 'null'] },
                  },
                  required: ['kind', 'uid', 'actionId'],
                  additionalProperties: false,
                },
                text: { type: ['string', 'null'] },
                date: { type: ['string', 'null'] },
                start: { type: ['string', 'null'] },
                duration: { type: ['integer', 'null'] },
                priority: { type: ['boolean', 'null'] },
                projectId: { type: ['string', 'null'] },
                milestoneId: { type: ['string', 'null'] },
              },
              required: ['taskRef', 'text', 'date', 'start', 'duration', 'priority', 'projectId', 'milestoneId'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },

  // G: source object
  withSource: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 1,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string', enum: ['create_task', 'schedule_task'] },
            args: {
              type: 'object',
              properties: {
                taskRef: {
                  type: ['object', 'null'],
                  properties: {
                    kind: { type: 'string', enum: ['existing', 'action'] },
                    uid: { type: ['string', 'null'] },
                    actionId: { type: ['string', 'null'] },
                  },
                  required: ['kind', 'uid', 'actionId'],
                  additionalProperties: false,
                },
                text: { type: ['string', 'null'] },
                date: { type: ['string', 'null'] },
                start: { type: ['string', 'null'] },
                duration: { type: ['integer', 'null'] },
                priority: { type: ['boolean', 'null'] },
                projectId: { type: ['string', 'null'] },
                milestoneId: { type: ['string', 'null'] },
              },
              required: ['taskRef', 'text', 'date', 'start', 'duration', 'priority', 'projectId', 'milestoneId'],
              additionalProperties: false,
            },
            source: {
              type: 'object',
              properties: {
                kind: { type: 'string', enum: ['document', 'ai-suggested'] },
                evidence: { type: 'string' },
              },
              required: ['kind', 'evidence'],
              additionalProperties: false,
            },
          },
          required: ['id', 'type', 'args', 'source'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'actions'],
    additionalProperties: false,
  },
};

/* ---- Provider call ---- */
function callProvider(schema, maxTokens, docText, userMsg) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const url = new URL(API_URL);
    const body = JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: 'You are a document extraction assistant. Extract tasks from documents. Return valid JSON only.' },
        { role: 'user', content: userMsg + '\n\n' + docText },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'taskflow_response',
          strict: true,
          schema,
        },
      },
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const latencyMs = Date.now() - startTime;
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { /* */ }
        resolve({
          status: res.statusCode,
          latencyMs,
          hasContent: !!parsed,
          actionsCount: parsed && parsed.actions ? parsed.actions.length : 0,
          error: parsed && parsed.error ? parsed.error.message || parsed.error : null,
          truncated: data.length > 500 ? data.slice(0, 500) + '...' : data,
        });
      });
    });

    req.on('error', (e) => {
      resolve({ status: 0, latencyMs: Date.now() - startTime, error: e.message });
    });

    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ status: 0, latencyMs: Date.now() - startTime, error: 'timeout' });
    });

    req.write(body);
    req.end();
  });
}

/* ---- Run ladder ---- */
async function runLadder(steps) {
  console.log('Schema Ladder Probe — File-Agent Gemini Compatibility');
  console.log('Model: ' + MODEL);
  console.log('Endpoint: ' + API_URL.replace(/\/+$/, '').replace(/key=.*/, 'key=***'));
  console.log('Document: ' + TEST_DOC.length + ' bytes');
  console.log('User request: ' + TEST_MSG);
  console.log('');

  const results = [];

  for (const step of steps) {
    const schema = SCHEMAS[step];
    if (!schema) {
      console.error('Unknown step: ' + step);
      continue;
    }
    process.stdout.write('  Step ' + step.padEnd(18) + ' ... ');
    const result = await callProvider(schema, 1024, TEST_DOC, TEST_MSG);
    const icon = result.status === 200 ? '✅' : '❌';
    console.log(icon + ' HTTP ' + result.status + '  (' + result.latencyMs + 'ms)' +
      (result.actionsCount ? '  actions=' + result.actionsCount : '') +
      (result.error ? '  error=' + result.error : ''));
    if (result.status !== 200 && result.error) {
      console.log('    Error detail: ' + (result.truncated || '').slice(0, 200));
    }
    results.push({ step, ...result });
    // Small delay between calls
    await new Promise(r => setTimeout(r, 500));
  }

  // Summary
  console.log('\n--- Summary ---');
  let lastOk = null;
  for (const r of results) {
    const status = r.status === 200 ? 'PASS' : 'FAIL';
    console.log('  ' + r.step.padEnd(18) + ' ' + status.padEnd(5) + ' HTTP ' + r.status + '  actions=' + (r.actionsCount || 0) + '  ' + r.latencyMs + 'ms');
    if (r.status === 200) lastOk = r.step;
  }
  console.log('\nLast passing step: ' + (lastOk || 'NONE'));

  return results;
}

/* ---- MaxItems ladder ---- */
async function runMaxItemsLadder() {
  console.log('MaxItems Ladder — using withSource schema');
  console.log('');

  const baseSchema = JSON.parse(JSON.stringify(SCHEMAS.withSource));
  const steps = [1, 5, 10, 20];
  const results = [];

  for (const maxItems of steps) {
    const schema = JSON.parse(JSON.stringify(baseSchema));
    schema.properties.actions.maxItems = maxItems;
    schema.properties.actions.items.properties.id.description = 'maxItems=' + maxItems;

    process.stdout.write('  maxItems=' + String(maxItems).padEnd(3) + ' ... ');
    const result = await callProvider(schema, 1024, TEST_DOC, TEST_MSG);
    const icon = result.status === 200 ? '✅' : '❌';
    console.log(icon + ' HTTP ' + result.status + '  (' + result.latencyMs + 'ms)' +
      (result.actionsCount ? '  actions=' + result.actionsCount : '') +
      (result.error ? '  error=' + result.error : ''));
    results.push({ step: 'maxItems=' + maxItems, ...result });
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/* ---- MaxTokens ladder ---- */
async function runMaxTokensLadder() {
  console.log('MaxTokens Ladder — using withSource schema');
  console.log('');

  const steps = [1024, 2048, 4096, 8192];
  const results = [];

  for (const maxTokens of steps) {
    process.stdout.write('  maxTokens=' + String(maxTokens).padEnd(5) + ' ... ');
    const result = await callProvider(SCHEMAS.withSource, maxTokens, TEST_DOC, TEST_MSG);
    const icon = result.status === 200 ? '✅' : '❌';
    console.log(icon + ' HTTP ' + result.status + '  (' + result.latencyMs + 'ms)' +
      (result.actionsCount ? '  actions=' + result.actionsCount : '') +
      (result.error ? '  error=' + result.error : ''));
    results.push({ step: 'maxTokens=' + maxTokens, ...result });
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/* ---- Document size ladder ---- */
async function runSizeLadder() {
  console.log('Document Size Ladder — using withSource schema, maxItems=1');
  console.log('');

  const sizes = [1000, 5000, 10000, 20000, 28000];
  const results = [];

  for (const size of sizes) {
    const doc = 'Week 1: ' + 'x'.repeat(size - 8) + '\n';
    process.stdout.write('  size=' + String(size).padEnd(6) + ' ... ');
    const result = await callProvider(SCHEMAS.withSource, 1024, doc, TEST_MSG);
    const icon = result.status === 200 ? '✅' : '❌';
    console.log(icon + ' HTTP ' + result.status + '  (' + result.latencyMs + 'ms)' +
      (result.actionsCount ? '  actions=' + result.actionsCount : '') +
      (result.error ? '  error=' + result.error : ''));
    results.push({ step: 'size=' + size, ...result });
    await new Promise(r => setTimeout(r, 500));
  }

  return results;
}

/* ---- Main ---- */
async function main() {
  const args = process.argv.slice(2);
  const stepIdx = args.indexOf('--step');
  const step = stepIdx >= 0 ? args[stepIdx + 1] : 'all';

  if (step === 'all') {
    await runLadder(Object.keys(SCHEMAS));
    await runMaxItemsLadder();
    await runMaxTokensLadder();
  } else if (step === 'maxitems') {
    await runMaxItemsLadder();
  } else if (step === 'tokens') {
    await runMaxTokensLadder();
  } else if (step === 'size') {
    await runSizeLadder();
  } else if (SCHEMAS[step]) {
    await runLadder([step]);
  } else {
    console.error('Unknown step: ' + step);
    console.error('Available: ' + Object.keys(SCHEMAS).join(', ') + ', all, maxitems, tokens, size');
    process.exit(1);
  }
}

main().catch(console.error);
