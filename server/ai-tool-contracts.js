// TaskFlow — Canonical Tool Contracts (AI Brain Phase 4).
// Single source of truth for tool definitions used by both server and client.
// Server: validates args, routes execution, enforces safety.
// Client: registers tools, executes client-side, sends sanitized results.
'use strict';

// Load canonical contracts from shared source of truth
const fs = require('fs');
const path = require('path');
const TOOL_CONTRACTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'ai-tool-contracts.json'), 'utf8'));

// Serve as reference (original inline definitions removed, loaded from shared/ai-tool-contracts.json)
const _unused = [
  // ── READ TOOLS ──────────────────────────────────────
  {
    name: 'get_today',
    description: 'Get today\'s date in YYYY-MM-DD format.',
    category: 'read',
    safety: 'read',
    executionLocation: 'server',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { today: { type: 'string' } },
      required: ['today'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_tasks',
    description: 'Get current tasks with optional filter.',
    category: 'read',
    safety: 'read',
    executionLocation: 'client',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', enum: ['all', 'active', 'completed', 'today', 'upcoming', 'overdue'] },
        limit: { type: 'number', minimum: 1, maximum: 100 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          maxItems: 60,
          items: {
            type: 'object',
            properties: {
              uid: { type: 'string' },
              text: { type: 'string', maxLength: 300 },
              done: { type: 'boolean' },
              deadline: { type: 'string' },
              scheduledDate: { type: 'string' },
              duration: { type: 'number' },
            },
            additionalProperties: false,
          },
        },
        total: { type: 'number' },
      },
      required: ['tasks', 'total'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_projects',
    description: 'Get projects and milestones.',
    category: 'read',
    safety: 'read',
    executionLocation: 'client',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { projects: { type: 'array', maxItems: 20 } },
      required: ['projects'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_active_roadmap',
    description: 'Get active document daily plan roadmap and cursor.',
    category: 'read',
    safety: 'read',
    executionLocation: 'client',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { roadmap: {}, cursor: {}, documentName: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'get_plan_progress',
    description: 'Get document plan progress statistics.',
    category: 'read',
    safety: 'read',
    executionLocation: 'client',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        hasActivePlan: { type: 'boolean' },
        documentName: { type: 'string', maxLength: 200 },
        roadmapTitle: { type: 'string', maxLength: 200 },
        totalWeeks: { type: 'number', minimum: 0, maximum: 500 },
        cursor: { type: 'object' },
      },
      required: ['hasActivePlan'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_free_time',
    description: 'Get busy time slots for a date range from timeblocks and calendar.',
    category: 'read',
    safety: 'read',
    executionLocation: 'client',
    returnsProposal: false,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date' },
        daysCount: { type: 'number', minimum: 1, maximum: 14 },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: {
        busy: { type: 'array', maxItems: 100 },
        startDate: { type: 'string' },
        daysCount: { type: 'number' },
      },
      additionalProperties: false,
    },
  },

  // ── PLANNING TOOLS ──────────────────────────────────
  {
    name: 'generate_daily_plan',
    description: 'Generate daily tasks from an active roadmap for a date range. Returns a canonical proposal with create_task actions.',
    category: 'planning',
    safety: 'safe_proposal',
    executionLocation: 'client',
    returnsProposal: true,
    inputSchema: {
      type: 'object',
      properties: {
        startDate: { type: 'string', format: 'date' },
        daysCount: { type: 'number', minimum: 1, maximum: 14 },
      },
      required: ['startDate'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, proposal: {}, meta: {} },
      required: ['ok'],
      additionalProperties: false,
    },
  },

  // ── MUTATION-PROPOSAL TOOLS ─────────────────────────
  {
    name: 'propose_create_task',
    description: 'Create a proposal to add a new task. Returns a canonical proposal with create_task actions.',
    category: 'mutation_proposal',
    safety: 'safe_proposal',
    executionLocation: 'client',
    returnsProposal: true,
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', minLength: 1, maxLength: 300 },
        date: { type: 'string', format: 'date' },
        duration: { type: 'number', minimum: 1, maximum: 480 },
        priority: { type: 'boolean' },
        projectId: { type: 'string' },
        milestoneId: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, proposal: {} },
      required: ['ok', 'proposal'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_complete_task',
    description: 'Create a proposal to mark a task as done.',
    category: 'mutation_proposal',
    safety: 'safe_proposal',
    executionLocation: 'client',
    returnsProposal: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskUid: { type: 'string', minLength: 1 },
      },
      required: ['taskUid'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, proposal: {} },
      required: ['ok', 'proposal'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_reschedule_task',
    description: 'Create a proposal to move a task to a different date.',
    category: 'mutation_proposal',
    safety: 'safe_proposal',
    executionLocation: 'client',
    returnsProposal: true,
    inputSchema: {
      type: 'object',
      properties: {
        taskUid: { type: 'string', minLength: 1 },
        newDate: { type: 'string', format: 'date' },
      },
      required: ['taskUid', 'newDate'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, proposal: {} },
      required: ['ok', 'proposal'],
      additionalProperties: false,
    },
  },
];

// ── Validation helpers ────────────────────────────────────
function _validDate(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function validateToolArgs(toolName, args) {
  const contract = TOOL_CONTRACTS.find((t) => t.name === toolName);
  if (!contract) return { ok: false, errors: ['unknown-tool: ' + toolName] };
  if (!contract.inputSchema) return { ok: true, errors: [] };

  const errors = [];
  const schema = contract.inputSchema;
  const a = args || {};

  if (schema.required && Array.isArray(schema.required)) {
    schema.required.forEach((key) => {
      if (a[key] === undefined || a[key] === null) {
        errors.push('missing-required: ' + key);
      }
    });
  }

  if (schema.properties) {
    Object.keys(schema.properties).forEach((key) => {
      const prop = schema.properties[key];
      const val = a[key];
      if (val === undefined || val === null) return;
      if (prop.type === 'string' && typeof val !== 'string') errors.push('invalid-type: ' + key + ' (expected string)');
      if (prop.type === 'number' && typeof val !== 'number') errors.push('invalid-type: ' + key + ' (expected number)');
      if (prop.type === 'boolean' && typeof val !== 'boolean') errors.push('invalid-type: ' + key + ' (expected boolean)');
      if (prop.minLength && typeof val === 'string' && val.length < prop.minLength) errors.push('too-short: ' + key);
      if (prop.maxLength && typeof val === 'string' && val.length > prop.maxLength) errors.push('too-long: ' + key);
      if (prop.minimum && typeof val === 'number' && val < prop.minimum) errors.push('too-small: ' + key);
      if (prop.maximum && typeof val === 'number' && val > prop.maximum) errors.push('too-large: ' + key);
      if (prop.format === 'date' && typeof val === 'string' && !_validDate(val)) errors.push('invalid-date: ' + key);
      if (prop.enum && Array.isArray(prop.enum) && prop.enum.indexOf(val) < 0) {
        errors.push('invalid-enum: ' + key + ' must be one of [' + prop.enum.join(', ') + ']');
      }
    });
  }

  if (schema.additionalProperties === false) {
    Object.keys(a).forEach((key) => {
      if (!schema.properties || !schema.properties[key]) {
        errors.push('unknown-field: ' + key);
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

function getContract(toolName) {
  return TOOL_CONTRACTS.find((t) => t.name === toolName) || null;
}

const MAX_SCHEMA_DEPTH = 8;
const MAX_TOTAL_RESULT_BYTES = 256 * 1024;

function _validateSchema(value, schema, path, depth, errors) {
  if (depth > MAX_SCHEMA_DEPTH) { errors.push('too-deep: ' + path); return; }
  if (!schema) return; // no constraint

  // Handle union types (e.g. ['string', 'null'])
  if (Array.isArray(schema.type)) {
    if (!schema.type.some((t) => t === null && value === null || t === _jsType(value))) {
      errors.push('invalid-type: ' + path + ' (expected ' + schema.type.join('|') + ')');
    }
    return;
  }

  if (schema.type) {
    const expected = schema.type;
    if (expected === 'null') {
      if (value !== null) errors.push('invalid-type: ' + path + ' (expected null)');
      return;
    }
    if (_jsType(value) !== expected) {
      errors.push('invalid-type: ' + path + ' (expected ' + expected + ', got ' + _jsType(value) + ')');
      return;
    }
  }

  if (typeof value === 'string') {
    if (schema.maxLength && value.length > schema.maxLength) errors.push('too-long: ' + path);
    if (schema.minLength && value.length < schema.minLength) errors.push('too-short: ' + path);
    if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors.push('invalid-date: ' + path);
    if (schema.enum && !schema.enum.includes(value)) errors.push('invalid-enum: ' + path);
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errors.push('too-small: ' + path);
    if (schema.maximum != null && value > schema.maximum) errors.push('too-large: ' + path);
  }

  if (Array.isArray(value)) {
    if (schema.maxItems && value.length > schema.maxItems) errors.push('too-many-items: ' + path);
    if (schema.items) {
      value.forEach((item, i) => _validateSchema(item, schema.items, path + '[' + i + ']', depth + 1, errors));
    }
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (schema.required && Array.isArray(schema.required)) {
      schema.required.forEach((key) => {
        if (value[key] === undefined || value[key] === null) errors.push('missing: ' + path + '.' + key);
      });
    }
    if (schema.properties) {
      Object.keys(value).forEach((key) => {
        if (schema.properties[key]) {
          _validateSchema(value[key], schema.properties[key], path + '.' + key, depth + 1, errors);
        }
      });
    }
    if (schema.additionalProperties === false && schema.properties) {
      Object.keys(value).forEach((key) => {
        if (!schema.properties[key]) errors.push('unexpected: ' + path + '.' + key);
      });
    }
  }
}

function _jsType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function validateToolResult(toolName, result) {
  const contract = TOOL_CONTRACTS.find((t) => t.name === toolName);
  if (!contract) return { ok: false, errors: ['unknown-tool: ' + toolName] };
  if (!contract.outputSchema) return { ok: true, errors: [] };
  if (!result || typeof result !== 'object') return { ok: false, errors: ['result-not-object'] };
  // Size check
  try {
    const byteLen = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (byteLen > MAX_TOTAL_RESULT_BYTES) return { ok: false, errors: ['brain-tool-result-too-large'] };
  } catch (e) { /* proceed */ }
  const errors = [];
  _validateSchema(result, contract.outputSchema, 'result', 0, errors);
  return { ok: errors.length === 0, errors };
}

function getToolDefinitions() {
  return TOOL_CONTRACTS.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    safety: t.safety,
    executionLocation: t.executionLocation,
    returnsProposal: t.returnsProposal,
  }));
}

// Extract only the fields Gemini needs (no internal metadata)
function getToolDefinitionsForLLM() {
  return TOOL_CONTRACTS.map((t) => ({
    name: t.name,
    description: t.description,
    category: t.category,
    safety: t.safety,
    inputSchema: t.inputSchema,
  }));
}

module.exports = {
  TOOL_CONTRACTS,
  validateToolArgs,
  validateToolResult,
  getContract,
  getToolDefinitions,
  getToolDefinitionsForLLM,
};
