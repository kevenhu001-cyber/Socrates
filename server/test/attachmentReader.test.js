import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AttachmentReadError,
  READ_ATTACHMENT_TOOL,
  TEXT_FILE_EXTENSIONS,
  DOCUMENT_FILE_EXTENSIONS,
  MEDIA_FILE_EXTENSIONS,
  TEXTUAL_APPLICATION_MIMES,
  formatAttachmentReadOutput,
  isTextReadable,
} from '../src/services/attachmentReader.js';

/* P_file-attachments — read_attachment is the model's only way into a
   durable upload. These tests cover the pure surface: the advertised
   schema, the readability dispatch, and the paged output format the
   model parses to walk long documents. DB-backed readAttachmentForUser
   coverage lives in the DB suites (skipped without DATABASE_URL). */

test('read_attachment schema advertises a required fileId and bounded paging', () => {
  const fn = READ_ATTACHMENT_TOOL.function;
  assert.equal(fn.name, 'read_attachment');
  assert.deepEqual(fn.parameters.required, ['fileId']);
  assert.equal(fn.parameters.additionalProperties, false);
  assert.equal(fn.parameters.properties.limit.maximum, 30000);
  assert.equal(fn.parameters.properties.offset.minimum, 0);
  assert.equal(typeof fn.parameters.properties.question.maxLength, 'number');
});

test('isTextReadable dispatches on mime, extension and stored kind', () => {
  /* text/* is readable except the browser-executable formats the upload
     route already rejects, and RTF which goes through the parser. */
  assert.equal(isTextReadable('text/plain', 'a.txt'), true);
  assert.equal(isTextReadable('text/csv', 'a.csv'), true);
  assert.equal(isTextReadable('text/html', 'a.html'), false);
  assert.equal(isTextReadable('text/rtf', 'a.rtf'), false);
  assert.equal(isTextReadable('image/svg+xml', 'a.svg'), false);
  /* Textual application/* types. */
  assert.equal(isTextReadable('application/json', 'a.json'), true);
  assert.equal(isTextReadable('application/yaml', 'a.yaml'), true);
  assert.equal(isTextReadable('application/pdf', 'a.pdf'), false);
  /* octet-stream falls back to extension + stored kind. */
  assert.equal(isTextReadable('application/octet-stream', 'a.py'), true);
  assert.equal(isTextReadable('application/octet-stream', 'a.bin'), false);
  assert.equal(isTextReadable('application/octet-stream', 'a.bin', 'text'), true);
  /* Binary kinds are never text-readable. */
  assert.equal(isTextReadable('video/mp4', 'a.mp4'), false);
  assert.equal(isTextReadable('image/png', 'a.png'), false);
});

test('extension sets cover the upload allow-list categories', () => {
  for (const ext of ['.py', '.ts', '.csv', '.md', '.json']) {
    assert.ok(TEXT_FILE_EXTENSIONS.has(ext), `TEXT_FILE_EXTENSIONS missing ${ext}`);
  }
  for (const ext of ['.pdf', '.docx', '.xlsx', '.pptx', '.epub', '.rtf']) {
    assert.ok(DOCUMENT_FILE_EXTENSIONS.has(ext), `DOCUMENT_FILE_EXTENSIONS missing ${ext}`);
  }
  for (const ext of ['.mp4', '.mp3', '.wav']) {
    assert.ok(MEDIA_FILE_EXTENSIONS.has(ext), `MEDIA_FILE_EXTENSIONS missing ${ext}`);
  }
  assert.ok(TEXTUAL_APPLICATION_MIMES.has('application/json'));
});

test('formatAttachmentReadOutput emits paging metadata the model can follow', () => {
  const out = formatAttachmentReadOutput({
    fileId: 'f1', name: 'report.pdf', kind: 'pdf',
    mimeType: 'application/pdf', size: 2048,
    readable: true, totalChars: 25000,
    offset: 0, returnedChars: 12000, hasMore: true,
    truncated: false, meta: { pageCount: 12 },
    text: 'PAGE ONE TEXT',
  });
  assert.match(out, /\[file: "report\.pdf" — application\/pdf — 2 KB\]/);
  assert.match(out, /\[meta: pageCount=12\]/);
  /* hasMore pages forward with the next offset. */
  assert.match(out, /chars 0–12000 of 25000 — more available; call read_attachment again with offset=12000/);
  assert.match(out, /PAGE ONE TEXT$/);
});

test('formatAttachmentReadOutput marks the end of file and extraction caps', () => {
  const out = formatAttachmentReadOutput({
    fileId: 'f1', name: 'big.xlsx', kind: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024, readable: true, totalChars: 5000,
    offset: 4000, returnedChars: 1000, hasMore: false,
    truncated: true, meta: {},
    text: 'TAIL',
  });
  assert.match(out, /chars 4000–5000 of 5000 — end of file/);
  assert.match(out, /the source extraction itself was capped/);
});

test('formatAttachmentReadOutput surfaces the unreadable note instead of text', () => {
  const out = formatAttachmentReadOutput({
    fileId: 'f1', name: 'clip.mp4', kind: 'video',
    mimeType: 'video/mp4', size: 999,
    readable: false, totalChars: 0, offset: 0, returnedChars: 0,
    hasMore: false, truncated: false, meta: {},
    text: '', note: 'metadata only',
  });
  assert.match(out, /\[file: "clip\.mp4"/);
  assert.match(out, /metadata only/);
  assert.ok(!/extract:/.test(out));
});

test('AttachmentReadError carries code + retryable for the executor', () => {
  const err = new AttachmentReadError('file_not_found', 'missing', false);
  assert.equal(err.name, 'AttachmentReadError');
  assert.equal(err.code, 'file_not_found');
  assert.equal(err.retryable, false);
  assert.ok(err instanceof Error);
});
