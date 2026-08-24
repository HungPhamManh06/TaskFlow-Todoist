#!/usr/bin/env node
/**
 * Generate browser-side tool contracts from shared canonical JSON.
 * 
 * Usage:
 *   node scripts/generate-ai-tool-contracts.mjs          # generate
 *   node scripts/generate-ai-tool-contracts.mjs --check   # CI gate
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SHARED = join(ROOT, 'shared', 'ai-tool-contracts.json');
const OUTPUT = join(ROOT, 'js', 'ai-tool-contracts.generated.js');

const isCheck = process.argv.includes('--check');

const shared = JSON.parse(readFileSync(SHARED, 'utf8'));

// Build browser-safe contract array (strip server-only fields)
const browserContracts = shared.map(c => ({
  name: c.name,
  description: c.description,
  category: c.category,
  safety: c.safety,
  executionLocation: c.executionLocation,
  returnsProposal: c.returnsProposal,
  inputSchema: c.inputSchema,
  outputSchema: c.outputSchema || null,
}));

const header = `// AUTO-GENERATED from shared/ai-tool-contracts.json — DO NOT EDIT.
// Run: node scripts/generate-ai-tool-contracts.mjs
'use strict';
(function (root, factory) {
  const contracts = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = contracts;
  else root.TaskFlowAIToolContracts = contracts;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  return ${JSON.stringify(browserContracts, null, 2)};
});
`;

if (isCheck) {
  try {
    const existing = readFileSync(OUTPUT, 'utf8');
    // Extract the contracts from existing file
    const match = existing.match(/return (\[[\s\S]*?\n\]);/);
    if (!match) {
      console.error('FAIL: Cannot parse existing generated file');
      process.exit(1);
    }
    const existingContracts = JSON.parse(match[1]);
    const freshContracts = JSON.parse(JSON.stringify(browserContracts));
    
    // Deep equality check
    if (JSON.stringify(existingContracts) !== JSON.stringify(freshContracts)) {
      console.error('FAIL: js/ai-tool-contracts.generated.js is stale. Run: node scripts/generate-ai-tool-contracts.mjs');
      process.exit(1);
    }
    console.log('OK: Tool contracts generated file is up to date');
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('FAIL: js/ai-tool-contracts.generated.js does not exist. Run: node scripts/generate-ai-tool-contracts.mjs');
      process.exit(1);
    }
    console.error('FAIL:', e.message);
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, header);
  console.log(`Generated ${browserContracts.length} contracts → js/ai-tool-contracts.generated.js`);
}
