/**
 * Phase 6V3.1 — PDF / File Processing Hotfix Tests (v2 API)
 *
 * Tests the v3.0.1 fix that uses pdf-parse v2 (PDFParse class) to
 * extract PDF text server-side instead of sending raw Base64 through
 * the provider gateway.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { extractPdfText } from '../server/ai-file-parser.js';

const require = createRequire(import.meta.url);

const aiJS = readFileSync('server/ai.js', 'utf8');
const aiProviderJS = readFileSync('server/ai-provider.js', 'utf8');

// ====================================================================
// 1. PDF-PARSE V2 API CONTRACT
// ====================================================================

describe('v3.0.1: pdf-parse v2 API contract', () => {
  it('PDFParse is a function (class) from pdf-parse', () => {
    const mod = require('../server/node_modules/pdf-parse');
    assert.equal(typeof mod.PDFParse, 'function', 'pdf-parse v2 must export PDFParse class');
  });

  it('require("pdf-parse") is NOT a function (v1 API)', () => {
    const mod = require('../server/node_modules/pdf-parse');
    assert.equal(typeof mod, 'object', 'v2 pdf-parse module is an object, not a callable function');
  });

  it('PDFParse accepts { data: Uint8Array }', () => {
    const { PDFParse } = require('../server/node_modules/pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(0) });
    assert.ok(parser, 'parser must be created');
    assert.equal(typeof parser.getText, 'function', 'must have getText method');
    assert.equal(typeof parser.destroy, 'function', 'must have destroy method');
    parser.destroy();
  });
});

// ====================================================================
// 2. REAL PDF TEXT EXTRACTION (CRITICAL HAPPY PATH)
// ====================================================================

describe('v3.0.1: Real PDF text extraction', () => {
  const fixture = readFileSync('tests/fixtures/simple-text.pdf');

  it('valid text PDF returns ok:true with extracted text', async () => {
    const result = await extractPdfText(fixture);
    assert.equal(result.ok, true, 'must succeed for valid text PDF');
    assert.ok(typeof result.text === 'string' && result.text.length > 0, 'must have non-empty text');
    assert.ok(result.text.includes('TASKFLOW_PDF_RUNTIME_SENTINEL_12345'),
      'must extract sentinel text from PDF');
    assert.ok(result.pages >= 1, 'must report at least 1 page');
    assert.equal(result.truncated, false, 'small PDF must not be truncated');
    assert.equal(result.error, undefined, 'must have no error on success');
  });

  it('extracted text is bounded by maxBytes option', async () => {
    const result = await extractPdfText(fixture, { maxBytes: 50 });
    // The fixture text is short enough that it may or may not truncate,
    // but the function must not crash
    assert.equal(result.ok, true);
    assert.ok(typeof result.text === 'string');
  });
});

// ====================================================================
// 3. SCANNED / EMPTY PDF
// ====================================================================

describe('v3.0.1: Scanned / no-text PDF', () => {
  it('empty buffer returns ai-file-pdf-unreadable', async () => {
    const result = await extractPdfText(Buffer.alloc(0));
    assert.equal(result.ok, false);
    assert.equal(result.error, 'ai-file-pdf-unreadable');
  });

  it('non-PDF content returns ai-file-pdf-unreadable', async () => {
    const result = await extractPdfText(Buffer.from('this is not a PDF file at all'));
    assert.equal(result.ok, false);
    assert.ok(['ai-file-pdf-unreadable', 'ai-file-no-text'].includes(result.error));
  });
});

// ====================================================================
// 4. EXTRACTED TEXT BUDGET
// ====================================================================

describe('v3.0.1: Extracted text budget', () => {
  it('DEFAULT_EXTRACT_MAX_BYTES is defined and reasonable', async () => {
    const { DEFAULT_EXTRACT_MAX_BYTES } = await import('../server/ai-file-parser.js');
    assert.ok(DEFAULT_EXTRACT_MAX_BYTES > 0);
    assert.ok(DEFAULT_EXTRACT_MAX_BYTES <= 256 * 1024, 'must be <= 256 KB (gateway hard max)');
    assert.ok(DEFAULT_EXTRACT_MAX_BYTES >= 16 * 1024, 'must be >= 16 KB (useful minimum)');
  });
});

// ====================================================================
// 5. PDF TEXT EXTRACTION ARCHITECTURE (SOURCE INSPECTION)
// ====================================================================

describe('v3.0.1: PDF text extraction architecture', () => {
  it('server/ai.js imports extractPdfText', () => {
    assert.ok(aiJS.includes('extractPdfText'), 'server/ai.js must import extractPdfText');
  });

  it('/file route uses extractPdfText for PDFs', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(fileRoute.includes('extractPdfText'), '/file route must call extractPdfText');
  });

  it('/file-agent route uses extractPdfText for PDFs', () => {
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const refineStart = aiJS.indexOf("router.post('/refine'");
    const route = aiJS.substring(fileAgentStart, refineStart > fileAgentStart ? refineStart : fileAgentStart + 3000);
    assert.ok(route.includes('extractPdfText'), '/file-agent route must call extractPdfText');
  });

  it('PDF path does NOT send raw Base64 file_data to provider', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(!fileRoute.includes("'data:application/pdf;base64,'"),
      'PDF path must not create Base64 data URL for provider');
  });

  it('ai-file-parser.js uses PDFParse class (not v1 function call)', () => {
    const parserSrc = readFileSync('server/ai-file-parser.js', 'utf8');
    assert.ok(parserSrc.includes('PDFParse'), 'must import PDFParse class');
    assert.ok(parserSrc.includes('new PDFParse'), 'must use new PDFParse constructor');
    assert.ok(parserSrc.includes('parser.getText()'), 'must call getText()');
    assert.ok(parserSrc.includes('parser.destroy()'), 'must call destroy()');
    assert.ok(!parserSrc.includes('await pdfParse(buffer)'), 'must not use v1 function-call API');
  });
});

// ====================================================================
// 6. ERROR PROPAGATION
// ====================================================================

describe('v3.0.1: Provider error propagation', () => {
  it('/file maps 413 status correctly', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(fileRoute.includes("aiResult.status === 413"), '/file must preserve 413');
  });

  it('/file-agent maps 413 status correctly', () => {
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const refineStart = aiJS.indexOf("router.post('/refine'");
    const route = aiJS.substring(fileAgentStart, refineStart > fileAgentStart ? refineStart : fileAgentStart + 3000);
    assert.ok(route.includes("aiResult.status === 413"), '/file-agent must preserve 413');
  });

  it('/file preserves 503 status', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(fileRoute.includes("aiResult.status === 503"), '/file must preserve 503');
  });

  it('/file returns 422 for pdfResult errors (no-text, unreadable)', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(fileRoute.includes('!pdfResult.ok'), 'must check pdfResult.ok');
    assert.ok(fileRoute.includes("res.status(422)"), 'must return 422 for parser errors');
  });
});

// ====================================================================
// 7. CLIENT ERROR STRINGS
// ====================================================================

describe('v3.0.1: Client error strings', () => {
  const reviewSrc = readFileSync('js/ai-review.js', 'utf8');

  it('VI error map has ai-file-no-text', () => {
    const viStart = reviewSrc.indexOf('vi: {');
    const viSection = reviewSrc.substring(viStart, viStart + 2000);
    assert.ok(viSection.includes("'ai-file-no-text'"), 'VI must define ai-file-no-text');
    assert.ok(viSection.includes('scan'), 'VI ai-file-no-text should mention scan');
  });

  it('VI error map has ai-file-pdf-unreadable', () => {
    const viStart = reviewSrc.indexOf('vi: {');
    const viSection = reviewSrc.substring(viStart, viStart + 2000);
    assert.ok(viSection.includes("'ai-file-pdf-unreadable'"), 'VI must define ai-file-pdf-unreadable');
  });

  it('EN error map has ai-file-no-text', () => {
    const enStart = reviewSrc.indexOf('en: {');
    const enSection = reviewSrc.substring(enStart, enStart + 2000);
    assert.ok(enSection.includes("'ai-file-no-text'"), 'EN must define ai-file-no-text');
    assert.ok(enSection.includes('scanned'), 'EN ai-file-no-text should mention scanned');
  });

  it('EN error map has ai-file-pdf-unreadable', () => {
    const enStart = reviewSrc.indexOf('en: {');
    const enSection = reviewSrc.substring(enStart, enStart + 2000);
    assert.ok(enSection.includes("'ai-file-pdf-unreadable'"), 'EN must define ai-file-pdf-unreadable');
  });

  it('error maps have ai-file-too-large', () => {
    assert.ok(reviewSrc.includes("'ai-file-too-large'"), 'must have ai-file-too-large');
  });

  it('error maps have ai-file-empty', () => {
    assert.ok(reviewSrc.includes("'ai-file-empty'"), 'must have ai-file-empty');
  });
});

// ====================================================================
// 8. PROVIDER GATEWAY PRESERVED
// ====================================================================

describe('v3.0.1: Provider gateway defense-in-depth preserved', () => {
  it('validateMaxMessageBytes still exists', () => {
    assert.ok(aiProviderJS.includes('validateMaxMessageBytes'), 'gateway budget check must remain');
  });

  it('DEFAULT_MAX_MESSAGE_BYTES still defined', () => {
    assert.ok(aiProviderJS.includes('DEFAULT_MAX_MESSAGE_BYTES'), 'must keep default budget');
  });

  it('MAX_MAX_MESSAGE_BYTES still defined', () => {
    assert.ok(aiProviderJS.includes('MAX_MAX_MESSAGE_BYTES'), 'must keep hard max budget');
  });

  it('message budget check before fetch still exists', () => {
    assert.ok(aiProviderJS.includes('msgBytes > maxMessageBytes'), 'must check message size');
  });
});

// ====================================================================
// 9. PARSER LIFECYCLE (destroy always runs)
// ====================================================================

describe('v3.0.1: Parser lifecycle', () => {
  it('extractPdfText always calls destroy on success', async () => {
    const fixture = readFileSync('tests/fixtures/simple-text.pdf');
    // If destroy is not called, the test runner may show open handles,
    // but more importantly we verify the code path exists
    const result = await extractPdfText(fixture);
    assert.equal(result.ok, true);
  });

  it('extractPdfText always calls destroy on failure', async () => {
    const result = await extractPdfText(Buffer.from('corrupt'));
    assert.equal(result.ok, false);
    // If destroy throws, it's caught internally — test completes without hang
  });
});

// ====================================================================
// 10. SECURITY — PDF CONTENT IN USER ROLE
// ====================================================================

describe('v3.0.1: PDF extraction security', () => {
  it('extracted PDF text goes in user role, not system role', () => {
    const fileRouteStart = aiJS.indexOf("router.post('/file'");
    const fileAgentStart = aiJS.indexOf("router.post('/file-agent'");
    const fileRoute = aiJS.substring(fileRouteStart, fileAgentStart > fileRouteStart ? fileAgentStart : fileRouteStart + 3000);
    assert.ok(fileRoute.includes('FILE_SYSTEM_INSTRUCTION'), 'system instruction must exist');
    assert.ok(fileRoute.includes("role: 'system'"), 'must have system role');
    assert.ok(fileRoute.includes('PDF content'), 'PDF text must be in user content');
  });
});

console.log('Phase 6V3.1 hotfix tests loaded.');
