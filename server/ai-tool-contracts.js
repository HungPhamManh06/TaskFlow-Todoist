// TaskFlow — Canonical Tool Contracts (AI Brain Phase 4).
// Single source of truth for tool definitions used by both server and client.
// Server: validates args, routes execution, enforces safety.
// Client: registers tools, executes client-side, sends sanitized results.
'use strict';

// Load canonical contracts from shared source of truth
const fs = require('fs');
const path = require('path');
const TOOL_CONTRACTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shared', 'ai-tool-contracts.json'), 'utf8'));

// Canonical definitions live only in shared/ai-tool-contracts.json.

// ── Validation helpers ────────────────────────────────────
function _validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const parts = s.split('-').map(Number);
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return d.getUTCFullYear() === parts[0] && d.getUTCMonth() + 1 === parts[1] && d.getUTCDate() === parts[2];
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

  // Union types must still flow through format/range validation for the
  // concrete value type (except null, which has no further constraints).
  if (Array.isArray(schema.type)) {
    const actualType = _jsType(value);
    if (!schema.type.some((t) => t === actualType)) {
      errors.push('invalid-type: ' + path + ' (expected ' + schema.type.join('|') + ')');
      return;
    }
    if (actualType === 'null') return;
  } else if (schema.type) {
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
    if (schema.format === 'date' && !_validDate(value)) errors.push('invalid-date: ' + path);
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
