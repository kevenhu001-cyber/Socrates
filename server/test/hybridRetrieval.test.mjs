import test from 'node:test';
import assert from 'node:assert/strict';
import { collectHybridRetrieval } from '../src/services/embeddings/hybridRetrieval.ts';
import { withTimeBudget } from '../src/lib/timeBudget.ts';

const hit = (id) => ({ id, messageId: id, ordinal: 0, text: id, score: 2 });
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('slow vectors release lexical hits at their own deadline and abort transport', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let vectorSignal;
  const vector = deferred();
  let settled = false;
  const pending = collectHybridRetrieval(async () => [hit('lexical')], (signal) => {
    vectorSignal = signal;
    return vector.promise;
  }, { timeoutMs: 2000, vectorTimeoutMs: 500 }).then((hits) => { settled = true; return hits; });
  await flush();
  t.mock.timers.tick(499); await flush();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  assert.deepEqual(await pending, [hit('lexical')]);
  assert.equal(vectorSignal.aborted, true);
  vector.reject(new Error('late transport rejection'));
  await flush();
});

test('overall deadline retains vector-only recall when lexical database work is slow', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let lexicalSignal;
  const pending = collectHybridRetrieval((signal) => {
    lexicalSignal = signal;
    return new Promise(() => {});
  }, async () => [hit('semantic')], { timeoutMs: 2000, vectorTimeoutMs: 500 });
  await flush();
  t.mock.timers.tick(2000);
  const hits = await pending;
  assert.deepEqual(hits.map(({ id }) => id), ['semantic']);
  assert.equal(lexicalSignal.aborted, true);
});

test('fast legs preserve reciprocal-rank fusion, deduplication and limit', async () => {
  const hits = await collectHybridRetrieval(async () => [hit('a'), hit('common')],
    async () => [hit('common'), hit('b')], { limit: 2, timeoutMs: 2000, vectorTimeoutMs: 500 });
  assert.deepEqual(hits.map(({ id }) => id), ['common', 'a']);
  assert.equal(hits[0].score, 1 / 62 + 1 / 61);
});

test('without chat budgets the standalone search waits for both legs', async () => {
  const vector = deferred();
  let settled = false;
  const pending = collectHybridRetrieval(async () => [hit('a')], () => vector.promise)
    .then((hits) => { settled = true; return hits; });
  await flush();
  assert.equal(settled, false);
  vector.resolve([hit('a')]);
  assert.equal((await pending)[0].score, 2 / 61);
});

test('parent cancellation aborts both legs and late results cannot change the returned snapshot', async () => {
  const controller = new AbortController();
  const vector = deferred();
  let lexicalSignal, vectorSignal;
  const pending = collectHybridRetrieval((signal) => {
    lexicalSignal = signal;
    return Promise.resolve([hit('a')]);
  }, (signal) => { vectorSignal = signal; return vector.promise; }, { signal: controller.signal });
  await flush();
  controller.abort();
  const hits = await pending;
  assert.equal(lexicalSignal.aborted, true);
  assert.equal(vectorSignal.aborted, true);
  vector.resolve([hit('late')]);
  await flush();
  assert.deepEqual(hits, [hit('a')]);
});

test('empty/unavailable vector results preserve lexical scores', async () => {
  const hits = [hit('a')];
  assert.deepEqual(await collectHybridRetrieval(async () => hits, async () => null), hits);
});

test('neither leg completing returns empty at the total budget and cancels both', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals = [];
  const hang = (signal) => { signals.push(signal); return new Promise(() => {}); };
  const pending = collectHybridRetrieval(hang, hang, { timeoutMs: 2000, vectorTimeoutMs: 500 });
  await flush();
  t.mock.timers.tick(2000);
  assert.deepEqual(await pending, []);
  assert.equal(signals.length, 2);
  assert.ok(signals.every((signal) => signal.aborted));
});

test('an already cancelled budget never starts optional work', async () => {
  const controller = new AbortController(); controller.abort();
  let started = false;
  assert.equal(await withTimeBudget(async () => { started = true; return true; },
    { signal: controller.signal }, () => false), false);
  assert.equal(started, false);
});

test('successful work clears the timer and removes the parent abort listener', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = new AbortController();
  let signal, fallbacks = 0;
  assert.equal(await withTimeBudget(async (inner) => { signal = inner; return 'ready'; },
    { signal: controller.signal, timeoutMs: 100 }, () => { fallbacks++; return 'late'; }), 'ready');
  controller.abort(); t.mock.timers.tick(1000); await flush();
  assert.equal(signal.aborted, false);
  assert.equal(fallbacks, 0);
});
