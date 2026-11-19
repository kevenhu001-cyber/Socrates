import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  chunkMessageText,
  stopRagChunkWorker,
} from '../src/services/embeddings/chunkWorkerClient.ts';
import { chunkText } from '../src/services/embeddings/rag.ts';

after(stopRagChunkWorker);

test('RAG chunk worker preserves paragraph, overlap and Unicode offsets across concurrent callers', async () => {
  const texts = [
    '  数学证明与几何 🌱。'.repeat(2_000) + '\n\nnext paragraph',
    '\n\n'.repeat(10_000),
    'A short paragraph\n\nfollowed by a second.',
  ];
  const results = await Promise.all(texts.map(chunkMessageText));
  assert.deepEqual(
    results,
    texts.map((text) => chunkText(text)),
  );
  for (const chunk of results[0]) {
    assert.equal(chunk.text, texts[0].slice(chunk.start, chunk.end));
  }
});

test('RAG chunk worker caps queued large jobs and keeps serving after overload', async () => {
  const text = 'A long paragraph. '.repeat(1_000);
  const admitted = Promise.all(Array.from({ length: 32 }, () => chunkMessageText(text)));
  await assert.rejects(chunkMessageText(text), /queue is full/);
  const results = await admitted;
  assert.deepEqual(results[0], results.at(-1));
  assert.deepEqual(await chunkMessageText(text), chunkText(text));
});
