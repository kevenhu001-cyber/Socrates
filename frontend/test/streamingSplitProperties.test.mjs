/**
 * Property tests for incomplete-markdown handling and lossless streaming split.
 *
 * Covers `isStableMarkdownPrefix` and `splitStreamingMarkdown` from
 * src/render/streaming.ts — the helpers that keep an unfinished markdown
 * construct in the live tail until it is complete, and split a settled prefix
 * from that tail without ever losing bytes.
 *
 * Property 10 (design):
 *   - For text carrying an unbalanced code fence, unbalanced `$$` math, or an
 *     unbalanced teaching-scaffold tag, `isStableMarkdownPrefix` returns false
 *     and `splitStreamingMarkdown` keeps that construct in the tail (it does
 *     not promote it into the settled prefix).
 *   - For ANY input, the returned prefix and tail reconstruct the original
 *     text (the split is lossless).
 *
 * These are validation-only tests; the source is not modified.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import fc from 'fast-check';

import {
  isStableMarkdownPrefix,
  splitStreamingMarkdown,
} from '../src/render/streaming.js';

const RUNS = 200;

/* The teaching-scaffold tags isStableMarkdownPrefix tracks with its balance
   stack. Kept in sync with the source's scaffoldTags set. */
const SCAFFOLD_TAGS = [
  'quiz', 'example', 'practice', 'definition', 'step', 'flashcard',
  'proof', 'theorem', 'key-point', 'derivation', 'q', 'o', 'title',
  'problem', 'solution', 'hint', 'front', 'back', 'statement', 'body',
  'term', 'correct',
];

/* splitStreamingMarkdown consumes the two-character `\n\n` separator between a
   promoted prefix and the tail, so a faithful reconstruction re-inserts it
   whenever a non-empty prefix was split off. When the prefix is empty the tail
   already carries the whole original string verbatim. */
function reconstruct({ prefix, tail }) {
  return prefix === '' ? tail : `${prefix}\n\n${tail}`;
}

/* Ordinary prose free of the constructs that gate stability. Kept clear of
   ```/$$/\[/\]/< so it can be used as a stable surrounding context. */
const plainProse = () => fc.stringMatching(/^[A-Za-z0-9 ,.\n中文你好世界]*$/);

/* Generators that each embed exactly one UNBALANCED construct. A paragraph
   break is placed before the open construct so splitStreamingMarkdown has a
   candidate cut whose prefix is stable but whose promotion would strand the
   open construct — the situation Property 10 forbids. */
const unbalancedFence = () => fc.tuple(plainProse(), plainProse()).map(
  ([lead, code]) => `${lead}\n\nleading text\n\n\`\`\`js\n${code}`,
);

const unbalancedMath = () => fc.tuple(plainProse(), plainProse()).map(
  ([lead, math]) => `${lead}\n\nleading text\n\n$$\n${math}`,
);

const unbalancedScaffold = () => fc.tuple(
  plainProse(),
  fc.constantFrom(...SCAFFOLD_TAGS),
  plainProse(),
).map(([lead, tag, body]) => `${lead}\n\nleading text\n\n<${tag}>${body}`);

const anyUnbalanced = () => fc.oneof(
  unbalancedFence(),
  unbalancedMath(),
  unbalancedScaffold(),
);

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 10: Incomplete markdown stays in
// the live tail and splitting is lossless
//
// Part A: an unbalanced code fence, `$$` math, or scaffold tag is never
// promoted into the settled prefix — the whole open construct stays in the
// tail, and isStableMarkdownPrefix reports the text as unstable.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 10: Incomplete markdown stays in the live tail and splitting is lossless', () => {
  fc.assert(
    fc.property(anyUnbalanced(), (text) => {
      // The unbalanced construct makes the full text an unstable prefix.
      assert.equal(isStableMarkdownPrefix(text), false);

      const split = splitStreamingMarkdown(text);

      // The open construct must remain in the tail: the settled prefix must
      // not contain the opener, and whatever prefix is promoted must itself
      // be a stable markdown prefix.
      for (const opener of ['```', '$$', '<']) {
        if (text.includes(opener)) {
          assert.equal(
            split.prefix.includes(opener),
            false,
            `promoted prefix leaked an open construct (${opener}): ${JSON.stringify(split)}`,
          );
        }
      }
      assert.equal(
        isStableMarkdownPrefix(split.prefix),
        true,
        `promoted prefix is not stable: ${JSON.stringify(split.prefix)}`,
      );

      // Lossless: prefix + separator + tail reconstructs the original.
      assert.equal(reconstruct(split), text);
    }),
    { numRuns: RUNS },
  );
});

// ---------------------------------------------------------------------------
// Feature: chat-experience-revamp, Property 10: Incomplete markdown stays in
// the live tail and splitting is lossless
//
// Part B: for ANY input whatsoever, concatenating the returned prefix and tail
// (re-inserting the consumed paragraph separator) reconstructs the original
// text exactly — the split never loses or invents a byte.
// ---------------------------------------------------------------------------
test('Feature: chat-experience-revamp, Property 10: splitStreamingMarkdown is lossless for any input', () => {
  const arbitraryText = fc.oneof(
    fc.string(),
    // Text rich in the boundary/construct characters the splitter reasons
    // about, so the round-trip is exercised on the interesting inputs too.
    fc.array(
      fc.oneof(
        fc.constantFrom('\n\n', '```', '$$', '\\[', '\\]', '<think>', '</think>'),
        fc.constantFrom(...SCAFFOLD_TAGS.map((t) => `<${t}>`)),
        fc.constantFrom(...SCAFFOLD_TAGS.map((t) => `</${t}>`)),
        fc.string(),
      ),
      { minLength: 0, maxLength: 20 },
    ).map((parts) => parts.join('')),
  );

  fc.assert(
    fc.property(arbitraryText, (text) => {
      const split = splitStreamingMarkdown(text);

      // A promoted prefix is always itself a stable markdown prefix.
      if (split.prefix !== '') {
        assert.equal(isStableMarkdownPrefix(split.prefix), true);
      }

      // Round-trip: nothing is lost, nothing is added.
      assert.equal(reconstruct(split), text);
    }),
    { numRuns: RUNS },
  );
});
