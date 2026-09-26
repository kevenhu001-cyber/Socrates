// @ts-check
/**
 * M3 sessionCompressor tests (no DB, no network).
 *
 * With SESSION_COMPRESS_DISABLE=1 the summarizer is bypassed, so these
 * cases exercise the pure budget/tail logic only.
 */
import {describe, test} from 'node:test';
import assert from 'node:assert/strict';

import {compressSessionMessages} from '../src/services/sessionCompressor.js';

function makeMessages(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      // Long bodies so the token budget actually trips on 30 messages.
      rawText: `${i % 2 === 0 ? 'User' : 'Assistant'} message number ${i} ` + 'lorem ipsum dolor sit amet '.repeat(60),
      clientId: `c-${i}`,
    });
  }
  return out;
}

describe('sessionCompressor: short histories pass through', () => {
  test('under the keep window returns input untouched', async () => {
    const input = makeMessages(5);
    const result = await compressSessionMessages(input);
    assert.equal(result.didCompress, false);
    assert.equal(result.summarizer, 'none');
    assert.equal(result.messages.length, 5);
  });
});

describe('sessionCompressor: over-budget histories compress', () => {
  test('tail-only path keeps the most recent turns verbatim', async () => {
    process.env.SESSION_COMPRESS_DISABLE = '1';
    process.env.SESSION_COMPRESS_TOKENS = '500';
    try {
      const input = makeMessages(30);
      const result = await compressSessionMessages(input);
      assert.equal(result.didCompress, true);
      assert.equal(result.summarizer, 'tail-only');
      assert.ok(result.messages.length < input.length);
      /* tail-only prepends a visible drop marker, so messages =
         marker + kept tail; droppedTurns counts the dropped head. */
      assert.equal(result.messages[0].type, 'summary');
      assert.match(result.messages[0].rawText, /removed to fit the context window|no summary was available/i);
      assert.equal(result.droppedTurns, input.length - (result.messages.length - 1));
      // Tail preserved in order: last message identical.
      assert.equal(result.messages[result.messages.length - 1].clientId, 'c-29');
    } finally {
      delete process.env.SESSION_COMPRESS_DISABLE;
      delete process.env.SESSION_COMPRESS_TOKENS;
    }
  });

  test('heavy attachment payloads are stripped from kept turns', async () => {
    process.env.SESSION_COMPRESS_DISABLE = '1';
    process.env.SESSION_COMPRESS_TOKENS = '500';
    try {
      const input = makeMessages(30).map((m, i) =>
        i < 29 ? m : { ...m, attachments: [{ id: 'a', kind: 'image', name: 'x.png', mime: 'image/png', size: 10, dataUrl: 'data:…long…' }] },
      );
      const result = await compressSessionMessages(input);
      const kept = result.messages[result.messages.length - 1];
      assert.equal(kept.attachments[0].dataUrl, null);
      assert.equal(kept.attachments[0].truncated, true);
    } finally {
      delete process.env.SESSION_COMPRESS_DISABLE;
      delete process.env.SESSION_COMPRESS_TOKENS;
    }
  });
});
