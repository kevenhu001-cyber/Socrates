/**
 * Unit tests for the durable-attachment contract (P_file-attachments).
 *
 * The upload model: every accepted file goes to POST /api/files and the
 * outgoing turn carries only a reference ({fileId, name, mime, size}).
 * The model reads file contents on demand via the read_attachment tool —
 * document text is NOT flattened into the prompt. These tests pin that
 * contract at the two pure seams that don't need the network:
 *
 *   - attachments.buildMessageContent(text, snapshot) — the send-time
 *     assembler. Accepts an immutable per-turn snapshot so the composer
 *     reset can never starve it of entries.
 *   - history.buildUserContentParts(text, storedAttachments) — the
 *     resend/regenerate/history path rebuild.
 *
 * No jsdom needed: both functions guard every window access, so a bare
 * globalThis.window stub flips the multimodal branch on demand.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  attachments,
  attachmentPointerLine,
  buildMessageContent,
} from '../src/attachments.js';
import { buildUserContentParts } from '../src/chat/history.js';

async function withProvider(provider, fn) {
  const prev = globalThis.window;
  globalThis.window = provider === undefined
    ? undefined
    : { getActiveProvider: () => provider };
  try { return await fn(); }
  finally { globalThis.window = prev; }
}

const FILE = {
  id: 'att-1', kind: 'document', docKind: 'pdf',
  name: 'report.pdf', mime: 'application/pdf', size: 12345,
  fileId: '11111111-2222-3333-4444-555555555555',
};

test('attachmentPointerLine carries name, mime, size and the fileId', () => {
  const line = attachmentPointerLine(FILE);
  assert.match(line, /\[Attached file: "report\.pdf" \(application\/pdf, 12 KB\) — fileId: 11111111-2222-3333-4444-555555555555\./);
  assert.match(line, /read_attachment/);
});

test('buildMessageContent emits a fileId pointer, not a parsed-text dump', async () => {
  const built = await buildMessageContent('summarize this', [FILE]);
  assert.equal(built.rawText, 'summarize this');
  const texts = built.parts.filter((p) => p.type === 'text').map((p) => p.text);
  /* Exactly the user text + one pointer line — no [Parsed …] block. */
  assert.equal(texts.length, 2);
  assert.equal(texts[0], 'summarize this');
  assert.match(texts[1], /fileId: 11111111/);
  assert.ok(!texts.some((t) => /Parsed/i.test(t)));
  /* Persisted metadata keeps the durable reference and never inlines
     document text. */
  const row = built.attachmentList[0];
  assert.equal(row.fileId, FILE.fileId);
  assert.equal(row.docKind, 'pdf');
  assert.equal(row.text, undefined);
});

test('buildMessageContent drops the inline dataUrl once a fileId exists', async () => {
  const img = {
    id: 'att-2', kind: 'image', name: 'shot.png', mime: 'image/png',
    size: 999, fileId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    dataUrl: 'data:image/png;base64,AAAA',
  };
  await withProvider({ vision: true }, async () => {
    const built = await buildMessageContent('', [img]);
    /* Multimodal: image_url part AND the pointer, so the model can both
       see the image and re-read it from storage. */
    assert.ok(built.parts.some((p) => p.type === 'image_url'));
    assert.ok(built.parts.some((p) => p.type === 'text' && /fileId: aaaa/.test(p.text)));
    /* Persisted row: no 2 MB base64 blob in the session document. */
    assert.equal(built.attachmentList[0].dataUrl, undefined);
    assert.equal(built.attachmentList[0].fileId, img.fileId);
  });
});

test('non-multimodal providers get the pointer, never an image_url part', async () => {
  const img = {
    id: 'att-3', kind: 'image', name: 'shot.png', mime: 'image/png',
    size: 999, fileId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    dataUrl: 'data:image/png;base64,AAAA',
  };
  await withProvider({ vision: false }, async () => {
    const built = await buildMessageContent('look', [img]);
    assert.ok(!built.parts.some((p) => p.type === 'image_url'));
    assert.ok(built.parts.some((p) => /fileId: aaaa/.test(p.text || '')));
  });
});

test('attachment-only turn (empty text) still ships the pointer', async () => {
  const built = await buildMessageContent('', [FILE]);
  assert.equal(built.rawText, '');
  assert.ok(built.parts.some((p) => p.type === 'text' && /fileId: 11111111/.test(p.text)));
});

test('a still-pending entry after the wait is flagged, not silently dropped', async () => {
  const pending = { id: 'att-p', kind: 'text', name: 'notes.txt', mime: 'text/plain', size: 10, pending: true };
  const built = await buildMessageContent('hi', [pending]);
  assert.ok(built.parts.some((p) => /did not finish uploading/.test(p.text || '')));
  assert.equal(built.attachmentList[0].error, 'upload_incomplete');
});

test('upload-failed entries produce an explicit failure pointer', async () => {
  const failed = { id: 'att-e', kind: 'document', name: 'bad.pdf', mime: 'application/pdf', size: 10, error: 'Upload failed (413)' };
  const built = await buildMessageContent('hi', [failed]);
  assert.ok(built.parts.some((p) => /failed to upload/.test(p.text || '')));
  assert.equal(built.attachmentList[0].error, 'Upload failed (413)');
});

test('legacy inline text attachments keep flowing (backward compat)', async () => {
  const legacy = { id: 'att-l', kind: 'text', name: 'old.txt', mime: 'text/plain', size: 5, text: 'OLD BODY' };
  const built = await buildMessageContent('hi', [legacy]);
  assert.ok(built.parts.some((p) => /\[Parsed file: old\.txt\]\nOLD BODY/.test(p.text || '')));
});

test('buildUserContentParts rebuilds pointers from stored attachments', async () => {
  await withProvider({ vision: false }, () => {
    const parts = buildUserContentParts('what did I send?', [FILE]);
    assert.ok(parts.some((p) => p.type === 'text' && /fileId: 11111111/.test(p.text)));
    assert.ok(!parts.some((p) => /Parsed/.test(p.text || '')));
  });
  /* Text-only message → null (callers send the plain string). */
  assert.equal(buildUserContentParts('hello', []), null);
  /* Attachment-only stored message still produces parts. */
  const onlyFile = buildUserContentParts('', [FILE]);
  assert.ok(onlyFile && onlyFile.some((p) => /fileId:/.test(p.text || '')));
});

test('buildUserContentParts sends image_url only for multimodal providers', async () => {
  const img = { id: 'i', kind: 'image', name: 'x.png', mime: 'image/png', size: 1, dataUrl: 'data:image/png;base64,AA' };
  await withProvider({ vision: true }, () => {
    assert.ok(buildUserContentParts('t', [img]).some((p) => p.type === 'image_url'));
  });
  await withProvider({ vision: false }, () => {
    const parts = buildUserContentParts('t', [img]);
    assert.ok(!parts.some((p) => p.type === 'image_url'));
    assert.ok(parts.some((p) => /cannot view inline/.test(p.text || '')));
  });
});

test('the module-level attachments array stays a stable identity', () => {
  assert.ok(Array.isArray(attachments));
});
