import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyAttachmentFile, docKindFromFile } from '../src/attachments/fileTypes.js';

test('classifies supported MIME families before extension fallbacks', () => {
  const cases = [
    [{ name: 'image.jpg', type: 'image/jpeg' }, 'image'],
    [{ name: 'report.pdf', type: 'application/pdf' }, 'document'],
    [{ name: 'source.bin', type: 'application/json' }, 'text'],
    [{ name: 'recording.bin', type: 'audio/mpeg' }, 'file'],
    [{ name: 'scan.pdf', type: 'application/octet-stream' }, 'document'],
  ];

  for (const [file, expected] of cases) {
    assert.equal(classifyAttachmentFile(file), expected, file.name);
  }
});

test('rejects active content MIME types even when the extension looks safe', () => {
  const unsafeFiles = [
    { name: 'notes.txt', type: 'text/html' },
    { name: 'notes.txt', type: 'text/xhtml' },
    { name: 'notes.txt', type: 'application/xhtml+xml' },
    { name: 'image.png', type: 'image/svg+xml' },
  ];

  for (const file of unsafeFiles) assert.equal(classifyAttachmentFile(file), null, file.type);
});

test('extension fallbacks preserve readable legacy office and metadata-only formats', () => {
  const cases = [
    [{ name: 'main.TS', type: 'application/octet-stream' }, 'text'],
    [{ name: 'old.doc', type: '' }, 'document'],
    [{ name: 'old.xls', type: '' }, 'document'],
    [{ name: 'slides.ppt', type: '' }, 'file'],
    [{ name: 'movie.mov', type: '' }, 'file'],
    [{ name: 'unknown.bin', type: '' }, null],
  ];

  for (const [file, expected] of cases) {
    assert.equal(classifyAttachmentFile(file), expected, file.name);
  }
});

test('document kind prefers the MIME and falls back to the final filename extension', () => {
  assert.equal(docKindFromFile({ name: 'renamed.docx', type: 'application/pdf' }), 'pdf');
  assert.equal(docKindFromFile({ name: 'workbook.XLSX', type: 'application/octet-stream' }), 'xlsx');
  assert.equal(docKindFromFile({ name: 'slides.ppt', type: '' }), 'ppt');
  assert.equal(docKindFromFile({ name: 'archive.bin', type: '' }), 'document');
});
