import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
afterEach(() => {
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
});

async function freshStubs() {
  return import(`../src/render/vizStubs.ts?view-pref=${Math.random()}`);
}

test('importing visualization stubs does not read the saved view preference', async () => {
  const reads = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem(key) { reads.push(key); return 'code'; } },
  });
  const stubs = await freshStubs();
  assert.equal(reads.includes('socrates-viz-view'), false);
  assert.equal(stubs.vizViewPref(), 'code');
  assert.equal(stubs.vizViewPref(), 'code');
  assert.equal(reads.filter((key) => key === 'socrates-viz-view').length, 1);
});

test('an explicit view choice wins without restoring persisted state', async () => {
  let reads = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem() { reads++; return 'code'; } },
  });
  const stubs = await freshStubs();
  stubs.setVizViewPref('preview');
  const before = reads;
  assert.equal(stubs.vizViewPref(), 'preview');
  assert.equal(reads, before);
  stubs.setVizViewPref('code');
  assert.equal(stubs.vizViewPref(), 'code');
});

test('blocked storage falls back to preview and is not retried per card', async () => {
  let reads = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { reads++; throw new DOMException('Blocked', 'SecurityError'); },
  });
  const stubs = await freshStubs();
  const before = reads;
  assert.equal(stubs.vizViewPref(), 'preview');
  assert.equal(stubs.vizViewPref(), 'preview');
  assert.equal(reads, before + 1);
});

test('unknown stored preferences retain the preview default', async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem() { return 'unknown'; } },
  });
  const stubs = await freshStubs();
  assert.equal(stubs.vizViewPref(), 'preview');
});
