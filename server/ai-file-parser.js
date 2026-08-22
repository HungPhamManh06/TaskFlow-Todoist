'use strict';
/**
 * ai-file-parser.js — Safe PDF text extraction for the file AI routes.
 *
 * Uses pdf-parse v2 (PDFParse class API).
 * Extracts text server-side so a 925 KB PDF does not become a 1.2 MB
 * Base64 payload that overflows the provider message budget.
 */

const { PDFParse } = require('pdf-parse');

/* ---- text-budget constants (derived from provider gateway) ---- */

const PROVIDER_DEFAULT_MAX_BYTES = 64 * 1024;   // 64 KB default gateway
const PROVIDER_HARD_MAX_BYTES     = 256 * 1024;  // 256 KB hard cap

/**
 * Effective text budget for extracted content.
 * We leave room for system prompt (~2 KB) + user instruction (~1 KB)
 * + metadata JSON wrapper, so the extracted text portion is capped
 * well below the gateway limit.
 */
const DEFAULT_EXTRACT_MAX_BYTES = 50 * 1024;   // ~50 KB effective (/file single-request)
const HARD_EXTRACT_MAX_BYTES    = 200 * 1024;   // ~200 KB when route overrides
// Phase 6D: Larger extraction budget for /file-agent where content is chunked.
// 6 chunks × 28 KB/chunk ≈ 168 KB; leave headroom for boundary trimming.
const FILE_AGENT_EXTRACT_MAX_BYTES = 180 * 1024;  // 180 KB for chunked extraction

/* ---- public API ---- */

/**
 * Extract text from a PDF buffer.
 *
 * @param {Buffer|Uint8Array} buffer  Raw PDF bytes
 * @param {object}  [opts]
 * @param {number}  [opts.maxBytes] Max UTF-8 bytes for extracted text
 *                                  (default DEFAULT_EXTRACT_MAX_BYTES)
 * @returns {{ ok: boolean, text?: string, pages?: number,
 *             truncated?: boolean, error?: string }}
 */
async function extractPdfText(buffer, opts) {
  const maxBytes = (opts && typeof opts.maxBytes === 'number' && opts.maxBytes > 0)
    ? opts.maxBytes
    : DEFAULT_EXTRACT_MAX_BYTES;

  let parser = null;

  try {
    // pdf-parse v2 accepts Uint8Array; Buffer extends Uint8Array so it works
    const data = buffer instanceof Uint8Array
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer);

    parser = new PDFParse({ data });
    const result = await parser.getText();

    let text = (result.text || '').trim();

    if (!text || text.length < 10) {
      return { ok: false, error: 'ai-file-no-text' };
    }

    // Normalize whitespace: collapse runs of blank lines to double-newline
    text = text.replace(/\n{3,}/g, '\n\n');

    // Page count: v2 result.total is the canonical field
    const pages = Number.isInteger(result.total)
      ? result.total
      : Array.isArray(result.pages)
        ? result.pages.length
        : 0;

    // Truncate to byte budget
    const encoder = new TextEncoder();
    const encoded = encoder.encode(text);
    let truncated = false;

    if (encoded.byteLength > maxBytes) {
      // Slice by bytes then find last safe newline boundary
      const sliced = encoded.slice(0, maxBytes);
      const decoded = new TextDecoder('utf-8', { fatal: false }).decode(sliced);
      const lastNewline = decoded.lastIndexOf('\n');
      text = lastNewline > decoded.length * 0.8
        ? decoded.slice(0, lastNewline)
        : decoded;
      truncated = true;
    }

    return { ok: true, text, pages, truncated };
  } catch (e) {
    const name = e && e.name ? e.name : '';
    const msg = e && typeof e.message === 'string' ? e.message.toLowerCase() : '';
    if (name === 'PasswordException' || msg.includes('password') || msg.includes('encrypted')) {
      return { ok: false, error: 'ai-file-pdf-unreadable' };
    }
    // Corrupt / unparseable / runtime error
    console.error('[ai-file-parser] pdf-runtime-error name=' + name + ' code=pdf-parser-runtime');
    return { ok: false, error: 'ai-file-pdf-unreadable' };
  } finally {
    if (parser && typeof parser.destroy === 'function') {
      try { await parser.destroy(); } catch (_) { /* ignore destroy errors */ }
    }
  }
}

module.exports = {
  extractPdfText,
  DEFAULT_EXTRACT_MAX_BYTES,
  HARD_EXTRACT_MAX_BYTES,
  FILE_AGENT_EXTRACT_MAX_BYTES,
  PROVIDER_DEFAULT_MAX_BYTES,
  PROVIDER_HARD_MAX_BYTES,
};
