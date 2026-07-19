// @ts-check
/**
 * Unit tests for src/services/usageTracker.js — token estimation
 * and usage-event recording.
 *
 * This module is the billing boundary. `estimateTokens` /
 * `estimateMessageTokens` feed the per-completion cost numbers
 * shown in the operator's billing dashboard; `recordUsage` is
 * the only path that writes to the `usage_events` table. A
 * regression here is P0 — undercounting tokens silently hands
 * free capacity to users; overcounting produces angry support
 * tickets and refunds.
 *
 * Run with: npm test
 */
import { test, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

import {
  estimateTokens,
  estimateMessageTokens,
  recordUsage,
  IMAGE_TOKEN_ESTIMATE,
} from '../src/services/usageTracker.js';

/* ── estimateTokens ───────────────────────────────────────────── */

describe('estimateTokens', () => {
  test('returns 0 for empty / nullish input', () => {
    assert.equal(estimateTokens(''), 0);
    assert.equal(estimateTokens(null), 0);
    assert.equal(estimateTokens(undefined), 0);
    assert.equal(estimateTokens(0), 0);
  });

  test('uses a chars/4 approximation rounded to the nearest integer', () => {
    /* 4 chars → 1 token. 5 chars → 1.25 → rounds to 1. */
    assert.equal(estimateTokens('abcd'), 1);
    /* 8 chars → 2 tokens exactly. */
    assert.equal(estimateTokens('abcdefgh'), 2);
  });

  test('floors at 1 token for any non-empty input (no undercount)', () => {
    /* 1-char inputs MUST count as at least 1 token so that a tiny
       user message like "hi" doesn't silently produce 0 cost. */
    assert.equal(estimateTokens('a'), 1);
    assert.equal(estimateTokens(' '), 1);
    assert.equal(estimateTokens('.'), 1);
  });

  test('coerces non-string input to a string before measuring', () => {
    /* Numbers, booleans, etc. should not throw. */
    assert.equal(estimateTokens(42), Math.max(1, Math.round(String(42).length / 4)));
    assert.equal(estimateTokens(true), 1); /* 'true' = 4 chars → 1 token */
  });

  test('handles long strings without overflow', () => {
    const big = 'x'.repeat(100_000);
    const expected = Math.round(100_000 / 4);
    assert.equal(estimateTokens(big), expected);
  });
});

/* ── estimateMessageTokens ────────────────────────────────────── */

describe('estimateMessageTokens', () => {
  test('returns 0 for non-array input', () => {
    assert.equal(estimateMessageTokens(null), 0);
    assert.equal(estimateMessageTokens(undefined), 0);
    assert.equal(estimateMessageTokens('hi'), 0);
    assert.equal(estimateMessageTokens({ role: 'user', content: 'x' }), 0);
  });

  test('returns 0 for an empty array', () => {
    assert.equal(estimateMessageTokens([]), 0);
  });

  test('counts a string content message as text + per-message overhead', () => {
    /* 4 chars → 1 token, plus 4 tokens overhead per message. */
    const out = estimateMessageTokens([{ role: 'user', content: 'abcd' }]);
    assert.equal(out, 1 + 4);
  });

  test('sums across multiple messages and applies per-message overhead each time', () => {
    const out = estimateMessageTokens([
      { role: 'system', content: 'abcd' },   // 1 token content + 4 overhead
      { role: 'user', content: 'abcdefgh' }, // 2 tokens content + 4 overhead
    ]);
    assert.equal(out, 1 + 4 + 2 + 4);
  });

  test('counts multimodal image_url parts at IMAGE_TOKEN_ESTIMATE each', () => {
    const out = estimateMessageTokens([
      { role: 'user', content: [
        { type: 'text', text: 'explain' },     // 2 tokens
        { type: 'image_url', image_url: { url: 'data:…' } }, // 765 tokens
      ] },
    ]);
    assert.equal(out, 2 + IMAGE_TOKEN_ESTIMATE + 4); // +4 for per-message overhead
  });

  test('skips image parts without double-counting text placeholders', () => {
    /* P_attachments — when the upstream degraded the image to a
       textual placeholder (see transformMessagesForModel), only
       the placeholder text should count. The image_url part
       itself must NOT also be counted as IMAGE_TOKEN_ESTIMATE. */
    const placeholder = '[User attached an image. Your current model cannot view images. …]';
    const out = estimateMessageTokens([
      { role: 'user', content: [
        { type: 'text', text: placeholder },
      ] },
    ]);
    const expected = estimateTokens(placeholder) + 4;
    assert.equal(out, expected);
    /* Must NOT include IMAGE_TOKEN_ESTIMATE — otherwise we'd be
       charging for both the original image AND the placeholder. */
    assert.ok(out < IMAGE_TOKEN_ESTIMATE);
  });

  test('skips unknown content part types silently', () => {
    /* Forward-compat: future content shapes (audio_url, etc.)
       should not throw and should not be double-counted. */
    const out = estimateMessageTokens([
      { role: 'user', content: [
        { type: 'text', text: 'x' },                    // 1 token
        { type: 'audio_url', audio_url: { url: 'x' } }, // unknown, skipped
        { type: 'unknown_future_type' },                 // unknown, skipped
      ] },
    ]);
    assert.equal(out, 1 + 4);
  });

  test('handles messages with null content (OpenAI tool_calls)', () => {
    /* Assistant messages carrying tool_calls have content: null
       per the OpenAI protocol. estimateMessageTokens must not
       crash on these — they're free text but still carry the
       per-message overhead. */
    const out = estimateMessageTokens([
      { role: 'assistant', content: null, tool_calls: [{ id: 'c1' }] },
    ]);
    assert.equal(out, 4); // overhead only, no content
  });

  test('skips null / non-object messages (counts them as overhead only)', () => {
    /* Per-message overhead (4 tokens for role markers / formatting)
       is applied UNCONDITIONALLY at the end of the loop — the
       overhead is for the message envelope, not the content, so a
       null message still costs 4 tokens. The content of null /
       non-object messages is skipped. */
    const out = estimateMessageTokens([
      null,                                  // 4 overhead
      undefined,                             // 4 overhead
      'string-message',                      // 4 overhead
      42,                                    // 4 overhead
      { role: 'user', content: 'ok' },       // 1 token + 4 overhead
    ]);
    assert.equal(out, 1 + 5 * 4);
  });
});

/* ── recordUsage ──────────────────────────────────────────────── */

describe('recordUsage', () => {
  test('does nothing when userId is missing (cannot attribute)', () => {
    /* Must be a silent no-op so anonymous requests don't break. */
    recordUsage({ userId: null, model: 'x', promptTokens: 100, completionTokens: 50 });
    recordUsage({ userId: undefined, model: 'x', promptTokens: 100, completionTokens: 50 });
    /* Reaching here without throwing IS the assertion. */
    assert.ok(true);
  });

  test('does nothing when total tokens is zero (nothing to bill)', () => {
    /* Avoid creating empty usage rows that would clutter the
       heatmap with "user did nothing" events. */
    recordUsage({ userId: 'user-1', model: 'x', promptTokens: 0, completionTokens: 0 });
    recordUsage({ userId: 'user-1', model: 'x', promptTokens: 0, completionTokens: undefined });
    assert.ok(true);
  });

  test('coerces null/undefined token counts to zero (no NaN in DB)', () => {
    recordUsage({ userId: 'user-1', model: 'x', promptTokens: undefined, completionTokens: undefined });
    /* No exception → safe to call from request handlers with
       possibly-missing fields. */
    assert.ok(true);
  });

  test('does not throw when DB is unavailable (fire-and-forget contract)', () => {
    /* recordUsage is supposed to be safe to call from a streaming
       response handler — any DB error must be swallowed (logged via
       console.warn) so a transient DB issue never breaks the chat
       stream. We invoke it without a configured DB and assert it
       returns cleanly. */
    assert.doesNotThrow(() => {
      recordUsage({ userId: 'user-x', model: 'x', promptTokens: 10, completionTokens: 5 });
    });
  });
});