/**
 * Unit tests for P_tool-order-strict / P_tool-order-defer / P_tool-order-block:
 * tool rows run strictly in order and never interrupt a finished sentence.
 *
 * - Colons/semicolons (：；:;) do NOT end a sentence: a row waits for a real
 *   period or newline instead of parking behind "原因有三：".
 * - A live row whose sentence has not finished stays unmounted (deferred);
 *   it mounts exactly once, behind the completed sentence.
 * - Offsets inside fenced code blocks or table rows snap forward out of the
 *   block instead of splitting it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findInlineToolBoundary,
  snapToolOffsetOutOfBlock,
} from '../src/render/streaming.ts';
import {
  buildTurnLayout,
  isSentenceCompleteAt,
} from '../src/react/tool-run/toolRunModel.ts';

function call(over) {
  return { id: 'a', name: 'web_search', input: { query: 'q' }, textOffset: 0, ...over };
}

/* ── write path: findInlineToolBoundary ─────────────────────────────── */

test('colon and semicolon do not anchor a tool row', () => {
  const fragment = '原因有三：补充说明还没写完';
  assert.equal(findInlineToolBoundary(fragment), fragment.length);

  const mixed = '原因有三：第一。第二。';
  assert.equal(findInlineToolBoundary(mixed), mixed.length);

  const latin = 'Steps: one; two. done';
  assert.equal(findInlineToolBoundary(latin), 'Steps: one; two. '.length);
});

test('tool rows still anchor behind real sentence endings', () => {
  assert.equal(findInlineToolBoundary('先说明结论。 然后继续分析'), '先说明结论。 '.length);
  assert.equal(findInlineToolBoundary('First paragraph.\n\nSecond part here'), 'First paragraph.\n\n'.length);
});

test('offsets stay strictly increasing across consecutive tools', () => {
  const first = findInlineToolBoundary('让我查一下');
  const second = findInlineToolBoundary('让我查一下，再看看别的地方', first);
  assert.ok(second > first, `expected ${second} > ${first}`);
});

/* ── block awareness: snapToolOffsetOutOfBlock ───────────────────────── */

test('offsets inside a fenced code block snap past its close', () => {
  const text = 'intro\n```js\nconst x = 1;\n```\nafter';
  const inside = text.indexOf('const');
  const closeEnd = text.indexOf('```\nafter') + '```'.length;
  assert.equal(snapToolOffsetOutOfBlock(text, inside), closeEnd + 1);
});

test('offsets inside an unclosed fence hold at the streamed end', () => {
  const text = 'intro\n```js\nconst x = 1;';
  assert.equal(snapToolOffsetOutOfBlock(text, text.indexOf('const')), text.length);
});

test('offsets inside a table row snap to the line end', () => {
  const text = '| a | b |\n|---|---|\n| c | d |';
  const firstLineEnd = text.indexOf('\n');
  assert.equal(snapToolOffsetOutOfBlock(text, 2), firstLineEnd + 1);
});

test('plain prose offsets pass through untouched', () => {
  assert.equal(snapToolOffsetOutOfBlock('hello world', 5), 5);
  assert.equal(snapToolOffsetOutOfBlock('hello', 99), 5);
});

/* ── sentence completeness ───────────────────────────────────────────── */

test('isSentenceCompleteAt accepts only real endings', () => {
  assert.equal(isSentenceCompleteAt('你好', 2), false);
  assert.equal(isSentenceCompleteAt('你好。', 3), true);
  assert.equal(isSentenceCompleteAt('原因：', 3), false);
  assert.equal(isSentenceCompleteAt('原因；', 3), false);
  assert.equal(isSentenceCompleteAt('note: todo', 5), false);
  assert.equal(isSentenceCompleteAt('done. next', 5), true);
  assert.equal(isSentenceCompleteAt('line\nnext', 4), true);
  assert.equal(isSentenceCompleteAt('anything', 0), true);
});

/* ── read path: buildTurnLayout with deferOpenSentence ───────────────── */

test('live layout withholds rows until their sentence completes', () => {
  const calls = [call({ id: 's', textOffset: '我先查一下'.length })];
  const live = { inlineThink: true, deferOpenSentence: true };

  const pending = buildTurnLayout('我先查一下相关资料', calls, live);
  assert.deepEqual(pending.map((s) => s.kind), ['text']);

  const ready = buildTurnLayout('我先查一下相关资料。后续。', calls, live);
  assert.deepEqual(ready.map((s) => s.kind), ['text', 'group', 'text']);
  assert.equal(ready[0].text, '我先查一下相关资料。');
  assert.equal(ready[2].text, '后续。');
});

test('approval rows mount immediately even mid-sentence', () => {
  const calls = [call({
    id: 's',
    textOffset: '我先查一下'.length,
    approval: { approvalId: 'ap1', runId: 'r1', status: 'pending' },
  })];
  const layout = buildTurnLayout(
    '我先查一下相关资料', calls, { inlineThink: true, deferOpenSentence: true },
  );
  assert.ok(layout.some((s) => s.kind === 'group' || s.kind === 'tool'));
});

test('finalized layout mounts every row (nothing starves)', () => {
  const calls = [
    call({ id: 's', textOffset: 2, output: 'ok', durationMs: 1 }),
    call({ id: 'f', name: 'web_fetch', textOffset: 2, output: 'ok', durationMs: 1 }),
  ];
  const layout = buildTurnLayout('原因有三：还没写完', calls);
  assert.deepEqual(layout.map((s) => s.kind), ['text', 'group', 'text']);
  assert.equal(layout[1].members.map((m) => m.id).join(','), 's,f');
});
