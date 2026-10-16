import test from 'node:test';
import assert from 'node:assert/strict';
import { reduceTurnEvent, normalizeTurnRuntime, annotateTurnProse, isCitableTurnRange, citableTurnMatches, rebaseTurnRuntimeText } from '@socrates/core';
const event = (seq, payload) => ({ version: 1, turnId: 'evidence', seq, at: 100, ...payload });
const source = { id: 'source-1', url: 'https://example.test/page', title: 'Official guide', snippet: 'Evidence.' };
const citation = { id: 'citation-1', sourceId: source.id };
const quote = 'A verified claim.';
const claim = { id: 'claim-1', start: 0, end: quote.length, quote, citationIds: [citation.id] };

test('evidence resolves claim → citation → source and survives JSON replay', () => {
  let runtime = reduceTurnEvent(null, event(1, { type: 'source.upsert', source }));
  runtime = reduceTurnEvent(runtime, event(2, { type: 'claim.annotate', claim, citations: [citation] }));
  assert.deepEqual(normalizeTurnRuntime(JSON.parse(JSON.stringify(runtime))), runtime);
  assert.equal(annotateTurnProse(quote, 0, runtime), `${quote} [1](#socrates-citation-claim-1)`);
  assert.equal(annotateTurnProse(quote.slice(0, -1), 0, runtime), quote.slice(0, -1));
  assert.equal(annotateTurnProse('A different claim.', 0, runtime), 'A different claim.');
  assert.equal(reduceTurnEvent(runtime, event(1, { type: 'source.upsert', source })), runtime);
  const shifted = { ...runtime, claims: [{ ...claim, start: 20, end: 20 + quote.length }] };
  assert.match(annotateTurnProse(quote, 20, shifted), /#socrates-citation/);
});

test('unknown sources, unsafe URLs, broken references and oversized claims are rejected', () => {
  const runtime = reduceTurnEvent(null, event(1, { type: 'source.upsert', source }));
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.test']) {
    assert.equal(reduceTurnEvent(runtime, event(2, { type: 'source.upsert', source: { ...source, id: 'unsafe', url } })), runtime);
  }
  assert.equal(reduceTurnEvent(runtime, event(2, { type: 'claim.annotate', claim, citations: [{ ...citation, sourceId: 'missing' }] })), runtime);
  const valid = reduceTurnEvent(runtime, event(2, { type: 'claim.annotate', claim, citations: [citation] }));
  assert.equal(normalizeTurnRuntime({ ...valid, sources: [] }), null);
  assert.equal(normalizeTurnRuntime({ ...valid, claims: [{ ...claim, citationIds: ['missing'] }] }), null);
  assert.equal(normalizeTurnRuntime({ ...valid, claims: [{ ...claim, end: 2001, quote: 'a'.repeat(2001) }] }), null);
  assert.equal(normalizeTurnRuntime({ ...valid, claims: [claim, { ...claim, id: 'overlap' }] }), null);
});

test('private reasoning, code, math, UI and link destinations never become inline citations', () => {
  for (const text of ['<think>first line\nsecret</think>', '<think>first line\nsecret', '```js\nsecret\n```', '```socrates-ui\nsecret', '`secret`', '$secret$', '$$first\nsecret$$', '\\[first\nsecret\\]', '[link](https://secret.test)']) {
    const start = text.indexOf('secret');
    assert.equal(isCitableTurnRange(text, start, start + 6), false, text);
    assert.deepEqual(citableTurnMatches(text, 'secret'), []);
  }
  assert.deepEqual(citableTurnMatches('<think>secret</think>\nsecret', 'secret'), [22]);
  assert.equal(isCitableTurnRange('Plain prose.', 0, 12), true);
});


test('storage sanitization rebases evidence and UI offsets without altering live snapshots', () => {
  const original = ' \n\u0000' + quote + '\n';
  let runtime = reduceTurnEvent(null, event(1, { type: 'source.upsert', source }));
  runtime = reduceTurnEvent(runtime, event(2, { type: 'claim.annotate', claim: { ...claim, start: 3, end: 3 + quote.length }, citations: [citation] }));
  runtime = reduceTurnEvent(runtime, event(3, { type: 'ui.begin', surfaceId: 'ui', toolCallId: 'ui', textOffset: original.length }));
  const stored = rebaseTurnRuntimeText(runtime, original, quote);
  assert.equal(runtime.claims[0].start, 3);
  assert.deepEqual(stored.claims[0], claim);
  assert.equal(stored.uiSurfaces[0].textOffset, quote.length);
  assert.match(annotateTurnProse(quote, 0, stored), /#socrates-citation/);
  assert.deepEqual(normalizeTurnRuntime(JSON.parse(JSON.stringify(stored))), stored);
  assert.equal(rebaseTurnRuntimeText(runtime, original, 'An arbitrary edit.'), null);
});
