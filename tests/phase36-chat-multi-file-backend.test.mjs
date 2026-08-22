import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = readFileSync(join(root, 'server', 'ai.js'), 'utf8');
const require = createRequire(import.meta.url);
const ai = require(join(root, 'server', 'ai.js'));

function record(name, mime, buffer) {
  return { name, mime, buffer, size: buffer.length };
}

describe('Phase 36 — shared secure multipart batch parser', () => {
  it('defines the approved five-file and aggregate byte limits', () => {
    assert.equal(ai.AI_FILE_MAX_FILES, 5);
    assert.equal(ai.AI_FILE_MAX_BYTES, 15 * 1024 * 1024);
    assert.equal(ai.AI_FILE_MAX_TOTAL_BYTES, 30 * 1024 * 1024);
  });

  it('accepts a legacy file record and sanitizes its filename', () => {
    const result = ai.validateUploadedFileRecord(record('../notes.md', 'text/markdown', Buffer.from('# Plan')));
    assert.equal(result.ok, true);
    assert.equal(result.file.name, 'notes.md');
    assert.equal(result.file.mime, 'text/plain');
  });

  it('rejects empty, oversized, unsupported, and MIME/signature-mismatched candidates stably', () => {
    const empty = ai.validateUploadedFileRecord(record('empty.txt', 'text/plain', Buffer.alloc(0)));
    const huge = ai.validateUploadedFileRecord({ name: 'huge.txt', mime: 'text/plain', buffer: Buffer.from('x'), size: 15 * 1024 * 1024 + 1 });
    const unsupported = ai.validateUploadedFileRecord(record('run.exe', 'application/octet-stream', Buffer.from([0, 1, 2, 3])));
    const mismatch = ai.validateUploadedFileRecord(record('photo.png', 'image/png', Buffer.from('%PDF-1.7')));

    assert.deepEqual(empty.rejection, { name: 'empty.txt', code: 'empty-file' });
    assert.deepEqual(huge.rejection, { name: 'huge.txt', code: 'file-too-large' });
    assert.deepEqual(unsupported.rejection, { name: 'run.exe', code: 'unsupported-type' });
    assert.deepEqual(mismatch.rejection, { name: 'photo.png', code: 'type-mismatch' });
  });

  it('uses one shared parser for both routes and accepts repeated files plus legacy file fields', () => {
    const parserStart = src.indexOf('async function parseAiFileMultipart(req)');
    const fileRoute = src.slice(src.indexOf("router.post('/file'"), src.indexOf('Phase 6D: POST /api/ai/file-agent'));
    const agentRoute = src.slice(src.indexOf("router.post('/file-agent'"), src.indexOf('Phase 6F: POST /api/ai/refine'));
    assert.ok(parserStart > 0);
    assert.ok(src.slice(parserStart, parserStart + 5000).includes("fieldname !== 'file' && fieldname !== 'files'"));
    assert.ok(fileRoute.includes('await parseAiFileMultipart(req)'));
    assert.ok(agentRoute.includes('await parseAiFileMultipart(req)'));
  });

  it('bounds file parts, each stream, and aggregate buffering while retaining partial acceptance', () => {
    const parser = src.slice(src.indexOf('async function parseAiFileMultipart(req)'), src.indexOf('const aiFileLimiter'));
    assert.ok(parser.includes('files: AI_FILE_MAX_FILES'));
    assert.ok(parser.includes('fileSize: AI_FILE_MAX_BYTES'));
    assert.ok(parser.includes('AI_FILE_MAX_TOTAL_BYTES'));
    assert.ok(parser.includes("code: 'too-many-files'"));
    assert.ok(parser.includes("code: 'total-too-large'"));
    assert.ok(parser.includes('rejectedFiles.push'));
  });

  it('returns metadata-only rejection records without uploaded buffers', () => {
    const rejection = ai.validateUploadedFileRecord(record('bad.bin', 'application/octet-stream', Buffer.from([0, 1, 2, 3]))).rejection;
    assert.deepEqual(Object.keys(rejection).sort(), ['code', 'name']);
    assert.equal('buffer' in rejection, false);
  });
});
