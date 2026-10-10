/**
 * attachmentUploadQueue.test.mjs — concurrency + progress contract for
 * src/attachments.js (P_upload-concurrency).
 *
 * Before the queue, every file added in one gesture started its XHR and
 * (for images) its canvas re-encode loop immediately, so a multi-file
 * drop froze the composer. Now at most MAX_CONCURRENT_UPLOADS jobs run
 * at once; the rest wait as visible `stage:'queued'` stubs, progress
 * events carry byte counts, and removing a queued chip settles its job
 * as cancelled instead of hanging addFiles()' Promise.all.
 *
 * No jsdom: attachments.js guards every window access, and uploads run
 * through a FakeXHR installed on globalThis.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  __resetUploadQueueForTests,
  addFiles,
  attachments,
  MAX_CONCURRENT_UPLOADS,
  removeAttachment,
  retryAttachment,
} from '../src/attachments.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class FakeXHR {
  static instances = [];

  constructor() {
    FakeXHR.instances.push(this);
    this.upload = {};
    this.headers = {};
    this.aborted = false;
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key, value) {
    this.headers[key] = value;
  }

  send() {
    // Held open until the test settles it via succeed()/fail().
  }

  abort() {
    this.aborted = true;
    if (typeof this.onabort === 'function') this.onabort();
  }

  succeed(id) {
    this.status = 201;
    this.responseText = JSON.stringify({
      id: id || `file-${FakeXHR.instances.indexOf(this)}`,
      kind: 'text',
      mimeType: 'text/plain',
      size: 10,
    });
    if (typeof this.onload === 'function') this.onload();
  }

  fail(status, message) {
    this.status = status || 500;
    this.responseText = JSON.stringify({ message: message || 'boom' });
    if (typeof this.onload === 'function') this.onload();
  }

  progress(loaded, total) {
    if (typeof this.upload.onprogress === 'function') {
      this.upload.onprogress({ lengthComputable: true, loaded, total });
    }
  }
}

function installFakeXhr() {
  const prev = globalThis.XMLHttpRequest;
  globalThis.XMLHttpRequest = FakeXHR;
  return () => { globalThis.XMLHttpRequest = prev; };
}

function textFile(name) {
  return new File([`body-of-${name}`], name, { type: 'text/plain' });
}

async function settleAllOk() {
  for (const xhr of FakeXHR.instances) {
    if (xhr.status == null && !xhr.aborted) xhr.succeed();
  }
  await sleep(60);
}

/* Settle successive queue generations: each round starts the next
   MAX_CONCURRENT_UPLOADS jobs, so a 4-file batch needs two rounds. */
async function settleAllGenerations(rounds) {
  for (let i = 0; i < rounds; i += 1) {
    await settleAllOk();
  }
}

test.beforeEach(() => {
  FakeXHR.instances = [];
  attachments.length = 0;
  __resetUploadQueueForTests();
});

test.afterEach(async () => {
  await settleAllOk();
  FakeXHR.instances = [];
  attachments.length = 0;
  __resetUploadQueueForTests();
});

test('at most MAX_CONCURRENT_UPLOADS transfers start; the rest queue visibly', async () => {
  assert.equal(MAX_CONCURRENT_UPLOADS, 2);
  const restore = installFakeXhr();
  try {
    const files = [textFile('a.txt'), textFile('b.txt'), textFile('c.txt'), textFile('d.txt')];
    const pending = addFiles(files, () => {}, () => {}, () => {});
    await sleep(60);

    assert.equal(FakeXHR.instances.length, MAX_CONCURRENT_UPLOADS);
    assert.equal(attachments.length, 4);
    const queued = attachments.filter((a) => a.stage === 'queued');
    const uploading = attachments.filter((a) => a.stage === 'uploading');
    assert.equal(queued.length, 2);
    assert.equal(uploading.length, 2);
    for (const q of queued) {
      assert.equal(q.pending, true);
      assert.equal(q.progress, 0);
    }

    await settleAllGenerations(2);
    assert.equal(FakeXHR.instances.length, 4);
    const result = await pending;
    assert.equal(result.added, 4);
    assert.deepEqual(result.rejected, []);
    for (const a of attachments) {
      assert.equal(a.pending, false);
      assert.equal(a.stage, 'done');
      assert.ok(a.fileId);
    }
  } finally {
    restore();
  }
});

test('upload progress reports percent plus byte counts and flips stage', async () => {
  const restore = installFakeXhr();
  try {
    let progressCalls = 0;
    const pending = addFiles([textFile('p.txt')], () => {}, () => { progressCalls += 1; }, () => {});
    await sleep(60);
    assert.equal(FakeXHR.instances.length, 1);

    FakeXHR.instances[0].progress(40, 100);
    await sleep(40);
    const entry = attachments[0];
    assert.equal(entry.progress, 40);
    assert.equal(entry.loaded, 40);
    assert.equal(entry.total, 100);
    assert.equal(entry.stage, 'uploading');
    assert.ok(progressCalls > 0);

    await settleAllOk();
    const result = await pending;
    assert.equal(result.added, 1);
    assert.equal(entry.progress, 100);
    assert.equal(entry.stage, 'done');
  } finally {
    restore();
  }
});

test('removing a queued chip dequeues it and never hangs addFiles', async () => {
  const restore = installFakeXhr();
  try {
    const rejections = [];
    const pending = addFiles(
      [textFile('q1.txt'), textFile('q2.txt'), textFile('q3.txt')],
      () => {},
      () => {},
      (msg) => { rejections.push(msg); },
    );
    await sleep(60);
    assert.equal(FakeXHR.instances.length, 2);
    const queued = attachments.find((a) => a.stage === 'queued');
    assert.ok(queued);

    assert.equal(removeAttachment(queued.id), true);
    // The dequeued job settles as cancelled: no XHR ever opened for it.
    assert.equal(FakeXHR.instances.length, 2);

    await settleAllOk();
    const result = await pending;
    assert.equal(result.added, 2);
    // Deliberate cancellation is not a user-facing rejection.
    assert.deepEqual(rejections, []);
    assert.deepEqual(result.rejected, []);
    assert.equal(attachments.length, 2);
  } finally {
    restore();
  }
});

test('a failed upload keeps its File handle and retry re-queues the job', async () => {
  const restore = installFakeXhr();
  try {
    const rejections = [];
    const pending = addFiles(
      [textFile('r.txt')],
      () => {},
      () => {},
      (msg) => { rejections.push(msg); },
    );
    await sleep(60);
    assert.equal(FakeXHR.instances.length, 1);

    FakeXHR.instances[0].fail(413, 'too large');
    const result = await pending;
    assert.equal(result.added, 0);
    assert.equal(rejections.length, 1);
    const entry = attachments[0];
    assert.equal(entry.pending, false);
    assert.equal(entry.stage, 'error');
    assert.match(entry.error || '', /too large/);

    assert.equal(retryAttachment(entry.id, () => {}), true);
    /* A free slot starts the job synchronously, so the stub may already
       read 'uploading' — either way it left the error state. */
    assert.ok(entry.stage === 'queued' || entry.stage === 'uploading');
    assert.equal(entry.pending, true);
    await sleep(60);
    assert.equal(FakeXHR.instances.length, 2);
    await settleAllOk();
    assert.equal(entry.stage, 'done');
    assert.ok(entry.fileId);
  } finally {
    restore();
  }
});
