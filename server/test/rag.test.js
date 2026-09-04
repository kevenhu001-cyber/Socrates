import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkText,
  buildRagIndex,
  searchRagIndex,
  tokenize,
} from '../src/services/rag.ts';

test('chunkText splits on paragraph boundaries and hard-splits oversized paragraphs', () => {
  const small = 'First paragraph.\n\nSecond paragraph.';
  const chunks = chunkText(small, { maxChars: 1200 });
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].text, 'First paragraph.');
  assert.equal(chunks[1].text, 'Second paragraph.');
  assert.deepEqual([chunks[0].start, chunks[0].end], [0, 16]);

  const oversized = 'x'.repeat(2500);
  const windows = chunkText(oversized, { maxChars: 1000, overlapChars: 100 });
  assert.ok(windows.length >= 3, 'oversized paragraph produces multiple windows');
  // Overlap: the second window starts before the first one ends.
  assert.ok(windows[1].start < windows[0].end);
  assert.equal(windows[0].index, 0);
  assert.equal(windows[1].index, 1);
});

test('chunkText drops empty documents and trims whitespace-only edges', () => {
  assert.deepEqual(chunkText(''), []);
  assert.deepEqual(chunkText('   \n\n  '), []);
  const chunks = chunkText('  padded content  ', { maxChars: 1200 });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].text, 'padded content');
});

test('BM25 retrieval ranks the matching chunk first and filters near-zero scores', () => {
  const docs = [
    'The Eiffel Tower is a wrought-iron lattice tower in Paris, France.',
    'Photosynthesis converts light energy into chemical energy in plants.',
    'The Great Wall of China is a series of fortifications built along hills.',
    'Quantum computers use qubits to perform parallel computations.',
  ];
  const chunks = docs.flatMap((doc) => chunkText(doc));
  const index = buildRagIndex(chunks, (chunk) => chunk.text);
  const hits = searchRagIndex(index, 'What is the Eiffel Tower in Paris?', { limit: 3 });
  assert.ok(hits.length >= 1);
  assert.ok(hits[0].record.text.includes('Eiffel Tower'));
  if (hits.length > 1) {
    assert.ok(hits[0].score > hits[hits.length - 1].score, 'hits are ranked by descending score');
  }

  const noHits = searchRagIndex(index, 'zzzqqq unrelated gibberish terms');
  assert.deepEqual(noHits, []);
});

test('tokenize is unicode-aware and lowercase', () => {
  assert.deepEqual(tokenize('北京 Beijing!'), ['北京', 'beijing']);
  assert.deepEqual(tokenize(''), []);
});
