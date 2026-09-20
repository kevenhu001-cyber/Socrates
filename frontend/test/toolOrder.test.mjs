/**
 * Unit tests for P_tool-order-paragraph / P_tool-order-defer /
 * P_tool-order-block: tool rows are paragraph-atomic and run strictly
 * in order.
 *
 * - A tool that fires mid-paragraph advances past that paragraph's end;
 *   a framing sentence written AFTER the call ("我来搜索一下…") stays
 *   above the row. Parking at the last completed paragraph stranded the
 *   row BEFORE its own paragraph.
 * - A tool that fires exactly at a paragraph start (or turn start) stays:
 *   it already follows a finished block.
 * - A live row whose paragraph has not finished stays unmounted
 *   (deferred); it mounts exactly once, behind the completed paragraph.
 * - Offsets inside fenced code blocks or table rows snap forward out of the
 *   block instead of splitting it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isParagraphStart,
  paragraphEndAfter,
  snapToolOffsetOutOfBlock,
  toolRowAnchorOffset,
} from '../src/render/streaming.ts';
import {
  buildTurnLayout,
  isRowMountableAt,
  isSentenceCompleteAt,
} from '../src/react/tool-run/toolRunModel.ts';

function call(over) {
  return { id: 'a', name: 'web_search', input: { query: 'q' }, textOffset: 0, ...over };
}

/* ── paragraph rule: isParagraphStart / paragraphEndAfter ──────────── */

test('a paragraph start stays, anything mid-paragraph advances', () => {
  assert.equal(isParagraphStart('anything', 0), true);
  assert.equal(isParagraphStart('导语。\n\n第二段。', '导语。\n\n'.length), true);
  assert.equal(isParagraphStart('导语。\n\n第二段。', 2), false);
  /* A single newline is a soft break inside the same paragraph. */
  assert.equal(isParagraphStart('AB\nCD\n\nEF', 3), false);
});

test('paragraphEndAfter stops after the blank run, or at EOF', () => {
  assert.equal(paragraphEndAfter('A\n\nB\n\nC', 1), 3);
  assert.equal(paragraphEndAfter('导语。\n\n我来搜索X', 5), '导语。\n\n我来搜索X'.length);
});

/* ── anchor: toolRowAnchorOffset ─────────────────────────────────────── */

test('a mid-paragraph fire position advances past its paragraph', () => {
  const raw = '导语。\n\n我来搜索一下X的原因。结果如下。\n\n尾巴。';
  assert.equal(toolRowAnchorOffset(raw, '导语。\n\n'.length + 2), '导语。\n\n我来搜索一下X的原因。结果如下。\n\n'.length);
});

test('a fire position at a clean paragraph start stays put', () => {
  assert.equal(toolRowAnchorOffset('导语。\n\n第二段。', '导语。\n\n'.length), '导语。\n\n'.length);
  assert.equal(toolRowAnchorOffset('第一段。\n\n第二段。', 0), 0);
});

test('offsets stay strictly increasing across consecutive tools', () => {
  const first = toolRowAnchorOffset('让我查一下', 0);
  const second = toolRowAnchorOffset('让我查一下，再看看别的地方', first);
  assert.ok(second >= first, `expected ${second} >= ${first}`);
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

/* ── read path: buildTurnLayout with deferOpenParagraph ───────────────── */

test('live layout withholds rows until their paragraph completes', () => {
  const calls = [call({ id: 's', textOffset: '我先查一下'.length })];
  const live = { inlineThink: true, deferOpenParagraph: true };

  const pending = buildTurnLayout('我先查一下相关资料', calls, live);
  assert.deepEqual(pending.map((s) => s.kind), ['text']);

  /* A finished sentence is NOT enough: the row waits for the paragraph —
     the sentence below is done but the paragraph runs on. */
  const sentenceDone = buildTurnLayout('我先查一下相关资料。后续没写完', calls, live);
  assert.deepEqual(sentenceDone.map((s) => s.kind), ['text']);

  const ready = buildTurnLayout('我先查一下相关资料。这是第一段。\n\n后续。', calls, live);
  assert.deepEqual(ready.map((s) => s.kind), ['text', 'group', 'text']);
  assert.equal(ready[0].text, '我先查一下相关资料。这是第一段。\n\n');
  assert.equal(ready[2].text, '后续。');
});

test('mount gate accepts paragraph starts that no sentence test would', () => {
  /* A heading ends with no terminator, yet the block after it is finished. */
  assert.equal(isRowMountableAt('## 标题\n\n正文', '## 标题\n\n'.length), true);
  assert.equal(isRowMountableAt('我先查一下相关资料', 2), false);
});

test('approval rows mount immediately even mid-paragraph', () => {
  const calls = [call({
    id: 's',
    textOffset: '我先查一下'.length,
    approval: { approvalId: 'ap1', runId: 'r1', status: 'pending' },
  })];
  const layout = buildTurnLayout(
    '我先查一下相关资料', calls, { inlineThink: true, deferOpenParagraph: true },
  );
  assert.ok(layout.some((s) => s.kind === 'group' || s.kind === 'tool'));
});

test('finalized layout mounts every row (nothing starves)', () => {
  const calls = [
    call({ id: 's', textOffset: 2, output: 'ok', durationMs: 1 }),
    call({ id: 'f', name: 'web_fetch', textOffset: 2, output: 'ok', durationMs: 1 }),
  ];
  /* Single trailing paragraph: both rows land behind it, grouped. */
  const layout = buildTurnLayout('原因有三：还没写完', calls);
  assert.deepEqual(layout.map((s) => s.kind), ['text', 'group']);
  assert.equal(layout[0].text, '原因有三：还没写完');
  assert.equal(layout[1].members.map((m) => m.id).join(','), 's,f');
});

test('equal-offset calls keep event order before rows in later paragraphs', () => {
  const raw = 'Paragraph one.\n\nParagraph two.\n\nTail.';
  const nextParagraph = 'Paragraph one.\n\n'.length;
  const calls = [
    call({ id: 'event-b', textOffset: 0, status: 'completed', output: 'ok' }),
    call({ id: 'event-a', textOffset: 0, status: 'completed', output: 'ok' }),
    call({ id: 'later', textOffset: nextParagraph, status: 'completed', output: 'ok' }),
  ];

  const layout = buildTurnLayout(raw, calls);
  assert.deepEqual(layout.map((segment) => segment.kind), ['group', 'text', 'group', 'text']);
  assert.deepEqual(layout[0].members.map((member) => member.id), ['event-b', 'event-a']);
  assert.equal(layout[1].text, 'Paragraph one.\n\n');
  assert.deepEqual(layout[2].members.map((member) => member.id), ['later']);
  assert.equal(layout[3].text, 'Paragraph two.\n\nTail.');
});
