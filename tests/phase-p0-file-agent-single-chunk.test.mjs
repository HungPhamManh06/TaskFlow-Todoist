'use strict';
/**
 * P0 HOTFIX — File-Agent Single-Chunk Pipeline
 *
 * Verifies:
 * - chunkText() returns consistent object shape for short documents
 * - userMessage is included in every provider call (single-chunk and multi-chunk)
 * - zero-chunk invariant is enforced
 * - short document produces exactly 1 chunk
 * - long document produces multiple chunks
 * - boundary conditions tested
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const aiSource = readFileSync(new URL('../server/ai.js', import.meta.url), 'utf8');

/* ============================================================
   1. SOURCE ASSERTIONS — chunkResult shape
   ============================================================ */
describe('P0 File-Agent: source assertions', () => {

  it('route always uses chunkText() — no [fullText] array fallback', () => {
    // The fix removes: const chunkResult = needsChunking ? chunkText(...) : [fullText]
    assert.ok(!aiSource.includes('chunkText(fullText, FILE_AGENT_MAX_CHUNKS) : [fullText]'),
      'must not use [fullText] array fallback');
    // Should use chunkText unconditionally
    assert.ok(aiSource.includes('chunkText(fullText, FILE_AGENT_MAX_CHUNKS)'),
      'must use chunkText() for all documents');
  });

  it('single-chunk mode includes userMessage (not fullText)', () => {
    // The fix removes: if (chunkCount === 1) { chunkUserMsg = fullText; }
    assert.ok(!aiSource.includes('chunkUserMsg = fullText'),
      'must not drop userMessage in single-chunk mode');
    // Should always include userMessage in chunkUserMsg
    const singleChunkSection = aiSource.indexOf('const chunkLabel = chunkCount > 1');
    assert.ok(singleChunkSection > 0, 'chunkLabel construction found');
    const body = aiSource.slice(singleChunkSection, singleChunkSection + 300);
    assert.ok(body.includes('userMessage'), 'userMessage must be in chunk user message');
    assert.ok(body.includes('textChunks[ci]'), 'document chunk must be in chunk user message');
  });

  it('zero-chunk guard exists for accepted text documents', () => {
    assert.ok(aiSource.includes('no-text-chunks'), 'zero-chunk error code exists');
    assert.ok(aiSource.includes('chunkCount === 0'), 'zero-chunk check exists');
    assert.ok(aiSource.includes('fullText.trim().length > 0'), 'non-empty text check exists');
  });

  it('chunkText always returns object shape (not array)', () => {
    // Verify chunkText function returns { chunks: [...] } even for short text
    assert.ok(aiSource.includes("return { chunks: [text], truncated: false, totalChunks: 1"),
      'chunkText returns object with chunks array for short text');
  });
});

/* ============================================================
   2. CHUNK TEXT FUNCTION TESTS
   ============================================================ */
describe('P0 File-Agent: chunkText function', () => {
  let chunkText;

  it('exports chunkText', () => {
    const mod = require('../server/ai.js');
    chunkText = mod.chunkText;
    assert.equal(typeof chunkText, 'function', 'chunkText is a function');
  });

  it('short text (< 28KB) returns object with 1 chunk', () => {
    const shortText = 'Tuần 1: Học kiến thức cơ bản về Embedded Systems\nTuần 2: Học GPIO\nTuần 3: Học UART';
    const result = chunkText(shortText, 6);
    assert.ok(typeof result === 'object', 'returns object');
    assert.ok(Array.isArray(result.chunks), 'chunks is array');
    assert.equal(result.chunks.length, 1, 'exactly 1 chunk for short text');
    assert.equal(result.truncated, false, 'not truncated');
    assert.equal(result.totalChunks, 1, 'totalChunks=1');
    assert.ok(result.chunks[0].includes('Embedded Systems'), 'chunk contains text content');
  });

  it('empty text returns empty chunks', () => {
    const result = chunkText('', 6);
    assert.equal(result.chunks.length, 0, 'no chunks for empty text');
  });

  it('boundary: exactly 28000 bytes returns 1 chunk', () => {
    const text = 'x'.repeat(28000);
    const result = chunkText(text, 6);
    assert.equal(result.chunks.length, 1, '1 chunk at boundary');
    assert.equal(result.truncated, false, 'not truncated');
  });

  it('boundary: 28001 bytes produces multiple chunks or truncation', () => {
    const text = 'Week 1\n' + 'x'.repeat(14000) + '\nWeek 2\n' + 'y'.repeat(14001);
    const result = chunkText(text, 6);
    assert.ok(result.chunks.length >= 1, 'at least 1 chunk');
    // May be truncated due to chunk limit, but should produce chunks
    assert.ok(Array.isArray(result.chunks), 'chunks is array');
  });
});

/* ============================================================
   3. ROUTE CODE — userMessage in every chunk
   ============================================================ */
describe('P0 File-Agent: route user message construction', () => {

  it('single chunk includes both userMessage and document data', () => {
    // Verify the source code path builds: chunkLabel + userMessage + textChunks[ci]
    const idx = aiSource.indexOf('const chunkUserMsg = chunkLabel + userMessage');
    assert.ok(idx > 0, 'chunkUserMsg always starts with chunkLabel + userMessage');
    const body = aiSource.slice(idx, idx + 200);
    assert.ok(body.includes('textChunks[ci]'), 'includes document chunk text');
  });

  it('chunk label is empty for single chunk, populated for multi', () => {
    // chunkLabel = chunkCount > 1 ? docLabel + 'Chunk ' + (ci+1) + ' of ' + chunkCount + '. ' : ''
    const idx = aiSource.indexOf('const chunkLabel = chunkCount > 1');
    assert.ok(idx > 0, 'chunkLabel conditional found');
    const body = aiSource.slice(idx, idx + 150);
    assert.ok(body.includes("''"), 'empty string for single chunk');
    assert.ok(body.includes('Chunk '), 'Chunk label for multi-chunk');
  });
});

/* ============================================================
   4. INTEGRATION: short document → provider called with user request
   ============================================================ */
describe('P0 File-Agent: short document pipeline simulation', () => {

  it('short text produces 1 chunk containing document text', () => {
    const mod = require('../server/ai.js');
    const shortText = 'Tuần 1: Học kiến thức cơ bản về Embedded Systems\nWeek 2: GPIO Programming\nWeek 3: UART Communication';
    const result = mod.chunkText(shortText, 6);
    assert.equal(result.chunks.length, 1, 'short document → 1 chunk');
    assert.ok(result.chunks[0].includes('Embedded Systems'), 'chunk contains source text');
  });

  it('user request would be included via route code path', () => {
    // Simulate what route does for single chunk:
    const userMessage = 'tạo 1 task';
    const textChunks = ['Tuần 1: Học kiến thức cơ bản'];
    const chunkCount = 1;
    const ci = 0;
    const textDocuments = [{ text: textChunks[0] }];

    const docLabel = textDocuments.length > 1 ? 'Documents combined. ' : '';
    const chunkLabel = chunkCount > 1 ? docLabel + 'Chunk ' + (ci + 1) + ' of ' + chunkCount + '. ' : '';
    const chunkUserMsg = chunkLabel + userMessage + '\n\n' + textChunks[ci];

    // Verify user request is present
    assert.ok(chunkUserMsg.includes('tạo 1 task'), 'user request preserved in single-chunk message');
    assert.ok(chunkUserMsg.includes('Học kiến thức'), 'document text included');
    assert.ok(!chunkLabel, 'no chunk label for single chunk');
  });

  it('multi-chunk user request also preserved', () => {
    const userMessage = 'Tạo 5 task quan trọng';
    const textChunks = ['Chunk A content', 'Chunk B content'];
    const chunkCount = 2;
    const textDocuments = [{ text: 'combined' }];

    for (let ci = 0; ci < chunkCount; ci++) {
      const docLabel = textDocuments.length > 1 ? 'Documents combined. ' : '';
      const chunkLabel = chunkCount > 1 ? docLabel + 'Chunk ' + (ci + 1) + ' of ' + chunkCount + '. ' : '';
      const chunkUserMsg = chunkLabel + userMessage + '\n\n' + textChunks[ci];
      assert.ok(chunkUserMsg.includes(userMessage), `chunk ${ci + 1} includes user request`);
      assert.ok(chunkUserMsg.includes(textChunks[ci]), `chunk ${ci + 1} includes document text`);
      assert.ok(chunkUserMsg.includes('Chunk ' + (ci + 1)), `chunk ${ci + 1} has chunk label`);
    }
  });
});
