import test from 'node:test';
import assert from 'node:assert/strict';
import { createPromptLoader } from '../src/lib/prompts.js';
import { createSummaryMemo } from '../src/lib/summaryMemo.js';

test('prompt cache coalesces reads, reloads same-day edits, and renders fresh dates without rereading', async () => {
  let raw = 'First [current date] [current year]', mtimeMs = 1, reads = 0;
  let now = new Date(2026, 9, 23, 12);
  const loader = createPromptLoader({
    async stat() { return { mtimeMs, size: raw.length }; },
    async readFile() { reads++; return raw; },
  }, () => now);
  const results = await Promise.all(Array.from({ length: 5 }, () => loader.load('beagle', true)));
  assert.equal(new Set(results).size, 1);
  assert.equal(reads, 1);
  assert.match(results[0], /October 23, 2026/);
  raw = 'Edited [current date] [current year]'; mtimeMs++;
  assert.match(await loader.load('beagle', true), /^Edited.*October 23, 2026/);
  assert.equal(reads, 2);
  now = new Date(2027, 0, 1, 12);
  assert.match(await loader.load('beagle', true), /^Edited.*January 1, 2027 2027$/);
  assert.equal(reads, 2, 'date changes do not cause another disk read');
  assert.equal(await loader.load('beagle'), raw, 'other mode prompts retain literal placeholders');
});

test('failed prompt read is retried and cannot serve stale text', async () => {
  let available = true;
  const loader = createPromptLoader({
    async stat() { if (!available) throw new Error('missing'); return { mtimeMs: 1, size: 4 }; },
    async readFile() { return 'live'; },
  });
  assert.equal(await loader.load('mode'), 'live');
  available = false;
  assert.equal(await loader.load('mode'), null);
  available = true;
  assert.equal(await loader.load('mode'), 'live');
});

test('summary cache shares concurrent work, expires without sliding TTL, and bounds LRU entries', async () => {
  let now = 0, calls = 0;
  const memo = createSummaryMemo({ now: () => now, ttlMs: 100, maxEntries: 2 });
  const produce = async () => { calls++; return `summary-${calls}`; };
  assert.deepEqual(await Promise.all([memo.get('owner:session:head', produce), memo.get('owner:session:head', produce)]), ['summary-1', 'summary-1']);
  now = 99;
  assert.equal(await memo.get('owner:session:head', produce), 'summary-1');
  now = 100;
  assert.equal(await memo.get('owner:session:head', produce), 'summary-2');
  await memo.get('another-owner:session:head', produce);
  await memo.get('third-owner:session:head', produce);
  assert.equal(await memo.get('owner:session:head', produce), 'summary-5', 'LRU evicts the oldest entry across scopes');
});

test('summary failures and empty responses are not cached', async () => {
  const memo = createSummaryMemo();
  await assert.rejects(memo.get('head', async () => { throw new Error('timeout'); }), /timeout/);
  assert.equal(await memo.get('head', async () => ''), '');
  assert.equal(await memo.get('head', async () => 'recovered'), 'recovered');
});
