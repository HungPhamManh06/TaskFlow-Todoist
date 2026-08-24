// TaskFlow — Canonical Tool Contracts (AI Brain Phase 4).
// Single source of truth for tool definitions used by both server and client.
// Server: validates args, routes execution, enforces safety.
// Client: registers tools, executes client-side, sends sanitized results.
'use strict';

const TOOL_CONTRACTS = [
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
  getContract,
  getToolDefinitions,
  getToolDefinitionsForLLM,
};
