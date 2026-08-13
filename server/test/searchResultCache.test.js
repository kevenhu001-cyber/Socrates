import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clear,
  getOrCreateInFlight,
  keyFor,
  stats,
} from '../src/lib/searchResultCache.js';

const input = {
  userId: 'user-a',
  query: 'latest python release',
  count: 8,
  locale: 'en-US',
  apiKeyHint: 'key-a',
};

test('identical in-flight searches share one upstream operation and clean up', async () => {
  clear();
  const key = keyFor(input);
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const factory = async () => {
    calls += 1;
    await gate;
    return ['result'];
  };

  const first = getOrCreateInFlight(key, factory);
  const second = getOrCreateInFlight(key, factory);
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(stats().inFlight, 1);

  release();
  assert.deepEqual(await first, ['result']);
  await Promise.resolve();
  assert.equal(stats().inFlight, 0);
});

test('a rejected search is not retained and a later request can retry', async () => {
  clear();
  const key = keyFor(input);
  await assert.rejects(getOrCreateInFlight(key, async () => { throw new Error('temporary'); }), /temporary/);
  await Promise.resolve();
  const value = await getOrCreateInFlight(key, async () => ['retry']);
  assert.deepEqual(value, ['retry']);
});
