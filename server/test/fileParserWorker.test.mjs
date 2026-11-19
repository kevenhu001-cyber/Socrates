import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { extractText, stopFileParserPool } from '../src/services/fileParsers/index.js';
import { WorkerSlot, FileParserPool } from '../src/services/fileParsers/pool.js';

test('fileParserWorker: extracts text in isolated worker thread', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-worker-odt-'));
  const z = new JSZip();
  z.file('mimetype', 'application/vnd.oasis.opendocument.text');
  z.file(
    'content.xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" ' +
      'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">' +
      '<office:body><office:text><text:p>Worker isolated text.</text:p></office:text></office:body>' +
      '</office:document-content>',
  );
  const fp = path.join(dir, 'test.odt');
  await fs.writeFile(fp, await z.generateAsync({ type: 'nodebuffer' }));

  try {
    const res = await extractText('application/vnd.oasis.opendocument.text', fp);
    assert.match(res.text, /Worker isolated text\./);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('fileParserWorker: handles parse errors gracefully from worker', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-worker-bad-'));
  const badFp = path.join(dir, 'corrupt.doc');
  await fs.writeFile(badFp, Buffer.from('corrupt non-ole binary data'));

  try {
    await assert.rejects(
      extractText('application/msword', badFp),
      (err) => err.code === 'PARSE_FAILED',
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('fileParserWorker: timeout terminates worker and throws PARSE_TIMEOUT', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'socrates-worker-timeout-'));
  const workerFile = path.join(dir, 'silentWorker.mjs');
  await fs.writeFile(
    workerFile,
    `import { parentPort } from 'node:worker_threads';
parentPort.postMessage({ type: 'ready' });
parentPort.on('message', () => { /* ignore */ });`,
  );

  const pool = new FileParserPool(1);
  const slot = new WorkerSlot(0, pool, { file: workerFile });

  try {
    await assert.rejects(
      slot.runOne('application/pdf', '/fake.pdf', 50),
      (err) => err.code === 'PARSE_TIMEOUT',
    );
  } finally {
    slot.terminate();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test.after(async () => {
  await stopFileParserPool();
});
