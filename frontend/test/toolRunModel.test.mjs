/**
 * Unit tests for react/tool-run/toolRunModel.ts — the declarative turn model.
 *
 * These cover the behavior the three old HTML-splicing implementations got
 * subtly different from each other, which is the point of consolidating:
 * offset filtering, run folding, label derivation, and the result-vs-technical
 * split of the detail panel.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildTurnLayout,
  detailText,
  extractCodePreview,
  findThinkRanges,
  groupOutputCalls,
  groupViewOf,
  hasTurnStructure,
  normalizeSources,
  sortableToolCalls,
  stripLegacyToolHtml,
  toolRunStateOf,
  toolRunView,
  visualizationSpecKey,
} from '../src/react/tool-run/toolRunModel.ts';
import { toolRunGroupLabel, toolRunLabel } from '../src/react/tool-run/labels.ts';

const RAW = 'First paragraph.\n\nSecond paragraph here.';

function call(over) {
  return { id: 'a', name: 'web_search', input: { query: 'kitten' }, textOffset: 18, ...over };
}

/* ── layout ──────────────────────────────────────────────────────────── */

test('splits rawText at each persisted textOffset and keeps prose order', () => {
  const layout = buildTurnLayout(RAW, [
    call({ id: 'b', name: 'web_fetch', input: { url: 'https://arxiv.org/abs/1' }, textOffset: 40, output: 'ok', durationMs: 3 }),
    call({ id: 'a', textOffset: 18, output: 'ok', durationMs: 3 }),
  ]);
  // Deliberately out of offset order: the renderer sorts before splicing.
  assert.deepEqual(
    layout.map((s) => s.kind),
    ['text', 'group', 'text', 'group'],
  );
  assert.equal(layout[0].text, 'First paragraph.\n\n');
  assert.equal(layout[1].members[0].id, 'a');
  assert.equal(layout[2].text, 'Second paragraph here.');
  assert.equal(layout[3].members[0].id, 'b');
});

test('calls with no prose between them fold into a single run', () => {
  const layout = buildTurnLayout('Work so far.\n\n', [
    call({ id: 'a', textOffset: 13, output: 'ok', durationMs: 3 }),
    call({ id: 'b', textOffset: 13, output: 'ok', durationMs: 3 }),
    call({ id: 'c', textOffset: 13, output: 'ok', durationMs: 3 }),
  ]);
  assert.deepEqual(layout.map((s) => s.kind), ['text', 'group']);
  assert.equal(layout[1].members.length, 3);
});

test('drops calls with a missing or out-of-range textOffset instead of splicing at 0', () => {
  const calls = [
    call({ id: 'ok', textOffset: 5 }),
    { id: 'no-offset', name: 'web_search', input: {} },
    { id: 'negative', name: 'web_search', input: {}, textOffset: -1 },
    { id: 'past-end', name: 'web_search', input: {}, textOffset: RAW.length + 9 },
    { id: 'no-name', name: '', input: {}, textOffset: 2 },
    { id: '', name: 'web_search', input: {}, textOffset: 2 },
  ];
  assert.deepEqual(
    sortableToolCalls(RAW, calls).map((c) => c.id),
    ['ok'],
  );
});

test('text-only turns yield one text segment', () => {
  const layout = buildTurnLayout('Just prose.', []);
  assert.equal(layout.length, 1);
  assert.equal(layout[0].kind, 'text');
});

test('whitespace-only prose does not break a tool run', () => {
  const layout = buildTurnLayout('A.\n\n   \n\nB.', [
    call({ id: 'a', textOffset: 2, output: 'ok', durationMs: 3 }),
    call({ id: 'b', textOffset: 9, output: 'ok', durationMs: 3 }),
  ]);
  const groups = layout.filter((s) => s.kind === 'group');
  assert.equal(groups.length, 1, 'expected the two calls to stay in one run');
  assert.equal(groups[0].members.length, 2);
});

test('real prose between two calls keeps them in separate runs', () => {
  const layout = buildTurnLayout(RAW, [
    call({ id: 'a', textOffset: 0, output: 'ok', durationMs: 3 }),
    call({ id: 'b', textOffset: RAW.length, output: 'ok', durationMs: 3 }),
  ]);
  assert.deepEqual(layout.map((s) => s.kind), ['group', 'text', 'group']);
  assert.equal(layout[0].members[0].id, 'a');
  assert.equal(layout[1].text, RAW, 'the prose sits between the two rows');
  assert.equal(layout[2].members[0].id, 'b');
});

test('a call at offset 0 still gets its row instead of an empty lead segment', () => {
  const layout = buildTurnLayout(RAW, [call({ id: 'a', textOffset: 0, output: 'ok', durationMs: 3 })]);
  assert.deepEqual(layout.map((s) => s.kind), ['group', 'text']);
});

test('moves a mid-paragraph tool boundary past its paragraph', () => {
  const text = '我先查一下相关资料。这是第一段。\n\n后续说明。';
  const layout = buildTurnLayout(text, [
    call({ id: 'search', textOffset: '我先查一下'.length, output: 'ok', durationMs: 3 }),
  ]);
  assert.deepEqual(layout.map((segment) => segment.kind), ['text', 'group', 'text']);
  assert.equal(layout[0].text, '我先查一下相关资料。这是第一段。\n\n');
  assert.equal(layout[1].members[0].id, 'search');
  assert.equal(layout[2].text, '后续说明。');
});

test('keeps consecutive calls together after normalizing the paragraph boundary', () => {
  const text = '我先查一下相关资料。这是第一段。\n\n结论如下。';
  const offset = '我先查一下'.length;
  const layout = buildTurnLayout(text, [
    call({ id: 'search', textOffset: offset, output: 'ok', durationMs: 3 }),
    call({ id: 'fetch', name: 'web_fetch', textOffset: offset, output: 'ok', durationMs: 3 }),
  ]);
  assert.deepEqual(layout.map((segment) => segment.kind), ['text', 'group', 'text']);
  assert.equal(layout[1].members.length, 2);
});

test('defers a tool row behind a live unfinished paragraph (P_tool-order-defer)', () => {
  const text = '我先查一下相关资料';
  const calls = [
    call({ id: 'search', textOffset: '我先查一下'.length, _run: { phase: 'running' } }),
  ];
  /* Paragraph unfinished: the row stays unmounted (the TurnStatus
     tool-running line covers the activity) so it can never split
     the paragraph or jump when punctuation arrives — a finished
     sentence alone is NOT enough. */
  const deferred = buildTurnLayout(text, calls, { inlineThink: true, deferOpenParagraph: true });
  assert.deepEqual(deferred.map((segment) => segment.kind), ['text']);
  assert.equal(deferred[0].text, text);
  const sentenceDone = buildTurnLayout(text + '。后续没写完', calls, { inlineThink: true, deferOpenParagraph: true });
  assert.deepEqual(sentenceDone.map((segment) => segment.kind), ['text']);
  /* Paragraph completed: the row mounts exactly once, behind it. */
  const done = buildTurnLayout(text + '。这是第一段。\n\n新段落。', calls, { inlineThink: true, deferOpenParagraph: true });
  assert.deepEqual(done.map((segment) => segment.kind), ['text', 'group', 'text']);
  assert.equal(done[0].text, text + '。这是第一段。\n\n');
  assert.equal(done[2].text, '新段落。');
});

test('keeps a tool boundary after its paragraph even past closing quotes', () => {
  const sentence = '我说：“先查资料。”';
  const layout = buildTurnLayout(sentence + '继续。\n\n尾巴。', [
    call({ id: 'search', textOffset: sentence.length, output: 'ok', durationMs: 3 }),
  ]);
  assert.equal(layout[0].text, sentence + '继续。\n\n');
  assert.equal(layout[1].kind, 'group');
  assert.equal(layout[2].text, '尾巴。');
});

/* ── thinking ────────────────────────────────────────────────────────── */

test('extracts thinking spans, including one the stream never closed', () => {
  const text = 'lead\n\n<think>hidden one</think>\n\nmid\n\n<think>hidden two';
  const ranges = findThinkRanges(text);
  assert.equal(ranges.length, 2);
  assert.equal(ranges[0].text, 'hidden one');
  assert.equal(ranges[1].text, 'hidden two');
  const layout = buildTurnLayout(text, []);
  assert.deepEqual(layout.map((s) => s.kind), ['text', 'think', 'text', 'think']);
  assert.equal(layout[1].text, 'hidden one');
  assert.equal(layout[3].text, 'hidden two');
});

test('an empty thinking span yields no think segment', () => {
  const layout = buildTurnLayout('prose\n\n<think>   </think>\nafter', []);
  assert.deepEqual(layout.map((s) => s.kind), ['text', 'text']);
});

test('thinking between two calls still separates their runs', () => {
  const layout = buildTurnLayout('A\n\n<think>t</think>\n\nB', [
    call({ id: 'a', textOffset: 1 }),
    call({ id: 'b', textOffset: 18 }),
  ]);
  assert.equal(layout.filter((s) => s.kind === 'group').length, 2);
});

/* ── state ───────────────────────────────────────────────────────────── */

test('derives one state from either the live run phase or the persisted flags', () => {
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', _run: { phase: 'running' } }), 'running');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', _run: { phase: 'preparing' } }), 'running');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', _run: { phase: 'succeeded' }, output: 'ok' }), 'done');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', _run: { phase: 'failed' } }), 'error');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', _run: { phase: 'cancelled' } }), 'stopped');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', isError: true }), 'error');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', status: 'awaiting_approval' }), 'awaiting');
  // History rows with no run record resolve from output + durationMs.
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', output: 'ok', durationMs: 12 }), 'done');
  // …or from a payload alone: sessions written before tool_status carried a
  // duration still finished, and a spinner on an old turn would be a lie.
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', output: 'ok' }), 'done');
  assert.equal(toolRunStateOf({ id: 'x', name: 'web_search', results: [{ title: 'a' }] }), 'done');
  // A call with nothing but its arguments is the one that really never resolved.
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read' }), 'running');
  assert.equal(toolRunStateOf({ id: 'x', name: 'Read', input: { file_path: 'a.py' }, textOffset: 3 }), 'running');
});

/* ── labels ──────────────────────────────────────────────────────────── */

test('labels carry the object so two calls never render identically', () => {
  const readA = toolRunView({ id: '1', name: 'Read', input: { file_path: 'src/attention/moe.py' }, output: 'x', durationMs: 40 });
  const readB = toolRunView({ id: '2', name: 'Read', input: { file_path: 'src/attention/routing.py' }, output: 'x', durationMs: 40 });
  assert.equal(readA.label, 'Read moe.py');
  assert.equal(readB.label, 'Read routing.py');
  const fetch = toolRunView({ id: '3', name: 'web_fetch', input: { url: 'https://arxiv.org/abs/2501.00001' }, output: 'x', durationMs: 1 });
  assert.equal(fetch.label, 'Read arxiv.org');
});

test('bash rows render the command as mono text with the outcome appended', () => {
  const view = toolRunView({
    id: 'b',
    name: 'Bash',
    input: { command: 'pytest tests/test_moe.py -q' },
    output: '8 passed in 4.02s',
    durationMs: 4100,
  });
  assert.equal(view.mono, true);
  assert.equal(view.label, '$ pytest tests/test_moe.py -q');
  assert.deepEqual(view.meta, ['8 passed', '4.1s']);
});

test('search rows name the query and put the source count in meta', () => {
  const view = toolRunView({
    id: 's',
    name: 'web_search',
    input: { query: 'transformer architecture improvements 2025' },
    results: [{ title: 'A', url: 'https://arxiv.org/abs/1' }, { title: 'B', url: 'https://arxiv.org/abs/2' }],
    output: '2 results',
    durationMs: 1840,
  });
  assert.equal(view.label, 'Searched "transformer architecture improvements 2025"');
  assert.deepEqual(view.meta, ['2 sources', '1.8s']);
});

test('running rows use the same object as the settled label', () => {
  const view = toolRunView({ id: 'r', name: 'Read', input: { file_path: 'src/attention/moe.py' }, _run: { phase: 'running' } });
  assert.equal(view.state, 'running');
  assert.equal(view.label, 'Reading moe.py…');
});

test('a long query is clipped to one label line', () => {
  const label = toolRunLabel(
    { id: 's', name: 'web_search', input: { query: 'x'.repeat(200) } },
    'done',
  );
  assert.ok(label.text.length < 70, `label too long: ${label.text.length}`);
  assert.ok(label.text.endsWith('…"') || label.text.endsWith('…'), label.text);
});

test('failed rows name what failed and expose a retry only for search', () => {
  const search = toolRunView({
    id: 's', name: 'web_search', input: { query: 'kitten' }, isError: true,
    error: 'boom', errorCode: 'search_timeout', retryable: true,
  });
  assert.equal(search.state, 'error');
  assert.deepEqual(search.retry, { toolId: 's', tool: 'web_search', query: 'kitten', errorCode: 'search_timeout' });
  const fetch = toolRunView({ id: 'f', name: 'web_fetch', input: { url: 'https://x.dev' }, isError: true, error: 'boom' });
  assert.equal(fetch.retry, undefined);
  assert.equal(fetch.label, 'Failed: x.dev');
  const noRetry = toolRunView({
    id: 's2', name: 'web_search', input: { query: 'q' }, isError: true, retryable: false,
  });
  assert.equal(noRetry.retry, undefined);
});

test('group label names the files touched and reports the action count', () => {
  const members = [
    { id: '1', name: 'Read', input: { file_path: 'a/moe.py' }, output: 'x', durationMs: 1 },
    { id: '2', name: 'Read', input: { file_path: 'a/routing.py' }, output: 'x', durationMs: 1 },
    { id: '3', name: 'Read', input: { file_path: 'a/router.py' }, output: 'x', durationMs: 1 },
  ];
  const label = toolRunGroupLabel(members, 'done');
  assert.equal(label.text, 'Read moe.py, routing.py, +1');
  assert.deepEqual(label.meta, ['3 actions']);
});

test('a mixed group reports one clause per kind of work instead of naming part of it', () => {
  const label = toolRunGroupLabel([
    { id: '1', name: 'Edit', input: { file_path: 'a/moe.py' } },
    { id: '2', name: 'Bash', input: { command: 'pytest' } },
  ], 'done');
  assert.equal(label.text, 'Ran a command, edited a file');
  assert.deepEqual(label.meta, ['2 actions']);
});

test('mixed clauses count each bucket and keep a stable reading order', () => {
  const label = toolRunGroupLabel([
    { id: '1', name: 'Bash', input: { command: 'pytest' } },
    { id: '2', name: 'Bash', input: { command: 'npm run build' } },
    { id: '3', name: 'Read', input: { file_path: 'a/moe.py' } },
    { id: '4', name: 'Grep', input: { pattern: 'moe' } },
    { id: '5', name: 'Write', input: { file_path: 'a/new.py' } },
  ], 'done');
  assert.equal(label.text, 'Ran 2 commands, read 2 files, created a file');
  assert.deepEqual(label.meta, ['5 actions']);
});

test('a run holding an unclassified call keeps the generic header rather than under-reporting', () => {
  const label = toolRunGroupLabel([
    { id: '1', name: 'Edit', input: { file_path: 'a/moe.py' } },
    { id: '2', name: 'workspace_agent', input: { task: 'refactor' } },
  ], 'done');
  assert.equal(label.text, 'Explored');
  assert.deepEqual(label.meta, ['2 actions']);
});

test('a single-bucket run is left to the homogeneous branches, not summarised as one clause', () => {
  const label = toolRunGroupLabel([
    { id: '1', name: 'Bash', input: { command: 'pytest' } },
    { id: '2', name: 'Bash', input: { command: 'npm run build' } },
  ], 'done');
  assert.equal(label.text, 'Explored');
});

/* ── detail panel: results first, arguments behind the toggle ────────── */

test('arguments and error codes land in tech, never in the default sections', () => {
  const ok = toolRunView({ id: '1', name: 'web_search', input: { query: 'q' }, results: [{ title: 'T', url: 'https://a.dev' }], output: 'body text', durationMs: 5 });
  assert.deepEqual(ok.sections.map((s) => s.kind), ['sources', 'output']);
  assert.deepEqual(ok.tech.map((s) => s.kind), ['args']);

  const failed = toolRunView({
    id: '2', name: 'web_search', input: { query: 'q' }, isError: true, error: 'boom',
    errorCode: 'search_timeout', retryable: true,
  });
  assert.deepEqual(failed.sections.map((s) => s.kind), ['error']);
  // Diagnostic facts first, the argument dump last, in both branches.
  assert.deepEqual(failed.tech.map((t) => t.title), ['Error code', 'Retryable', 'Arguments']);
  assert.equal(failed.tech.find((t) => t.retryable)?.retryable, '1');
});

test('result echoes that repeat the row label are dropped', () => {
  const results = [1, 2, 3].map((i) => ({ title: 'T' + i, url: 'https://a.dev/' + i }));
  const withCount = toolRunView({ id: '1', name: 'web_search', input: { query: 'q' }, results, output: '3 results', durationMs: 5 });
  assert.deepEqual(withCount.sections.map((s) => s.kind), ['sources']);
  for (const echo of ['ok', 'Done', 'success', 'OK', '1 hit.']) {
    const view = toolRunView({ id: '1', name: 'Read', input: { file_path: 'a.py' }, output: echo, durationMs: 5 });
    assert.deepEqual(view.sections, [], `expected "${echo}" to be dropped`);
  }
});

test('source lists are capped, deduped by url, and keep https links only', () => {
  const results = [];
  for (let i = 0; i < 30; i++) results.push({ title: 'T' + i, url: 'https://a.dev/' + i });
  const list = normalizeSources(results);
  assert.equal(list.length, 8, 'single-call source list caps at 8');
  const dupes = normalizeSources([
    { title: 'A', url: 'https://a.dev/x' },
    { title: 'A again', url: 'https://a.dev/x' },
    { title: 'relative', url: '/local/path' },
  ]);
  assert.equal(dupes.length, 2);
  assert.equal(dupes[1].url, '', 'non-http urls are not linkable');
});

test('source cards preserve available publication dates and search engines', () => {
  const sources = normalizeSources([
    { title: 'Alpha', url: 'https://a.dev/x', date: '2026-07-15', source: 'bing' },
    { title: 'Beta', url: 'https://b.dev/y', date: null, source: null },
  ]);
  assert.deepEqual(sources[0], {
    title: 'Alpha', url: 'https://a.dev/x', host: 'a.dev', date: '2026-07-15', source: 'bing',
  });
  assert.equal(sources[1].date, undefined);
  assert.equal(sources[1].source, undefined);
});

test('group sources dedupe across members and cap higher than a single row', () => {
  const group = groupViewOf({
    kind: 'group',
    category: 'search',
    members: [0, 1].map((g) => ({
      id: 'g' + g,
      name: 'web_search',
      input: { query: 'q' + g },
      results: Array.from({ length: 9 }, (_, i) => ({ title: 'T' + i, url: `https://s${g}.dev/${i}` })),
      output: 'ok',
      durationMs: 5,
    })),
    running: [],
    state: 'done',
  });
  const sources = group.sections.find((s) => s.kind === 'sources');
  assert.ok(sources.items.length <= 12);
  assert.equal(new Set(sources.items.map((s) => s.url)).size, sources.items.length);
});

test('the aggregate lists merged sources only when more than one member contributed', () => {
  /* One search that returned everything the run found has no "merge" to show:
     repeating its list above the row is the stacked-duplication the two-tier
     detail was meant to remove. */
  const groupWithContributors = (contributors) => groupViewOf({
    kind: 'group',
    category: 'search',
    members: [0, 1].map((g) => ({
      id: 'g' + g,
      name: 'web_search',
      input: { query: 'q' + g },
      results: g < contributors ? [{ title: 'T' + g, url: `https://s${g}.dev/` }] : [],
      output: g < contributors ? '1 results' : 'No web results found',
      durationMs: 5,
    })),
    running: [],
    state: 'done',
  });
  assert.equal(
    groupWithContributors(1).sections.some((s) => s.kind === 'sources'),
    false,
    'a single contributing member keeps its sources in its own row',
  );
  const merged = groupWithContributors(2).sections.find((s) => s.kind === 'sources');
  assert.equal(merged.items.length, 2);
});

test('oversized output is truncated head+tail with an omitted-line marker', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ${'x'.repeat(80)}`);
  const text = detailText(lines.join('\n'));
  const kept = text.split('\n');
  assert.equal(kept.length, 11, 'five head lines, five tail lines, one marker');
  assert.equal(kept[0], lines[0]);
  assert.equal(kept[kept.length - 2], lines[199]);
  assert.equal(kept[kept.length - 1], '… +190 lines');
  assert.ok(!text.includes(lines[100]), 'middle lines dropped');
});

test('running rows expose a live command/code preview instead of a hidden details body', () => {
  const bash = toolRunView({ id: 'b', name: 'Bash', input: { command: 'ls -la' }, _run: { phase: 'running' } });
  assert.equal(bash.state, 'running');
  assert.equal(bash.livePreview, 'ls -la');
  const code = toolRunView({
    id: 'c', name: 'code_interpreter', input: {},
    argumentsText: '{"code": "import statistics\\nprint(st.mean(x))',
    _run: { phase: 'running' },
  });
  assert.match(code.livePreview, /import statistics/);
  const read = toolRunView({ id: 'r', name: 'Read', input: { file_path: 'a.py' }, _run: { phase: 'running' } });
  assert.equal(read.livePreview, undefined, 'a read row has nothing to preview');
});

test('extractCodePreview survives partial JSON and falls back to nothing when unusable', () => {
  assert.equal(extractCodePreview('{"code":"print(1)"}'), 'print(1)');
  assert.match(extractCodePreview('{"code": "import os\\npri'), /import os/);
  assert.equal(extractCodePreview('{'), '');
});

test('file summary only appears for a genuine multi-file write run', () => {
  const single = toolRunView({ id: '1', name: 'Edit', input: { file_path: 'a/moe.py' }, output: 'ok', durationMs: 2 });
  assert.equal(single.fileSummary, undefined);
  const group = groupViewOf({
    kind: 'group',
    category: 'write',
    members: [
      { id: '1', name: 'Edit', input: { file_path: 'a/moe.py' }, output: 'ok', durationMs: 2 },
      { id: '2', name: 'Write', input: { file_path: 'a/router_v2.py' }, output: 'ok', durationMs: 2 },
    ],
    running: [],
    state: 'done',
  });
  assert.equal(group.fileSummary.count, 2);
  assert.deepEqual(group.fileSummary.paths, ['moe.py', 'router_v2.py']);
});

/* ── group aggregation ───────────────────────────────────────────────── */

test('a running call is reported separately from the settled members', () => {
  const group = buildTurnLayout('work\n\n', [
    call({ id: '1', name: 'Read', input: { file_path: 'a.py' }, textOffset: 5, output: 'ok', durationMs: 3 }),
    call({ id: '2', name: 'Read', input: { file_path: 'b.py' }, textOffset: 5, output: 'ok', durationMs: 3 }),
    call({ id: '3', name: 'Read', input: { file_path: 'c.py' }, textOffset: 5, _run: { phase: 'running' } }),
  ]).find((s) => s.kind === 'group');
  assert.equal(group.kind, 'group');
  assert.equal(group.members.length, 2);
  assert.equal(group.running.length, 1);
  assert.equal(group.state, 'running');
  assert.equal(groupViewOf(group).showsHeader, true);
});

test('a group hands every call to the output renderer, settled or in flight', () => {
  /* Tool status may collapse; tool output never does. The renderer draws the
     visible outputs from this one list, so the collapse toggle cannot gate
     them and the order matches the rows. */
  const group = buildTurnLayout('work\n\n', [
    call({ id: 'settled', textOffset: 5, output: 'ok', durationMs: 3 }),
    call({ id: 'live', name: 'render_visualization', textOffset: 5, _run: { phase: 'running' } }),
  ]).find((s) => s.kind === 'group');
  assert.deepEqual(groupOutputCalls(group).map((c) => c.id), ['settled', 'live']);
  assert.deepEqual(groupOutputCalls(group), group.members.concat(group.running));
});

test('visualization specs compare by content, so a settle does not remount the chart', () => {
  const a = {
    version: 1,
    template: 'function',
    payload: { functions: [{ expression: 'x^2', label: 'y' }], xLabel: 'x', yLabel: 'y' },
  };
  const reordered = {
    payload: { yLabel: 'y', xLabel: 'x', functions: [{ label: 'y', expression: 'x^2' }] },
    template: 'function',
    version: 1,
  };
  assert.equal(visualizationSpecKey(a), visualizationSpecKey(reordered), 'key order is irrelevant');
  assert.notEqual(visualizationSpecKey(a), visualizationSpecKey({ ...a, title: 'different' }));
  assert.equal(visualizationSpecKey(null), '');
  assert.equal(visualizationSpecKey(undefined), '');
});

test('a single settled call renders as a bare row, not a collapsed header', () => {
  const group = buildTurnLayout('work\n\n', [call({ id: '1', name: 'Read', input: { file_path: 'a.py' }, textOffset: 5, output: 'ok', durationMs: 3 })])
    .find((s) => s.kind === 'group');
  const view = groupViewOf(group);
  assert.equal(view.showsHeader, false);
  assert.equal(view.members.length, 1);
});

test('a group surfaces a member failure in its own sections and meta', () => {
  const group = groupViewOf({
    kind: 'group',
    category: 'search',
    members: [
      { id: '1', name: 'web_search', input: { query: 'a' }, output: 'ok', durationMs: 5 },
      { id: '2', name: 'web_search', input: { query: 'b' }, isError: true, error: 'engine down', durationMs: 5 },
    ],
    running: [],
    state: 'error',
  });
  assert.equal(group.state, 'error');
  assert.deepEqual(group.meta, ['1 failed', '2 actions', '10ms']);
  const errors = group.sections.filter((s) => s.kind === 'error');
  assert.equal(errors.length, 1);
  assert.match(errors[0].title, /^web_search:/);
  assert.equal(errors[0].text, 'engine down');
});

/* ── routing predicate for MessageItem ─────────────────────────────────── */

test('only turns with splicable tool rows route to the declarative renderer', () => {
  assert.equal(hasTurnStructure('plain prose', []), false);
  assert.equal(hasTurnStructure('plain prose', [call({ textOffset: 2 })]), true);
  // Thinking alone must not flip the route: scratch work is never rendered in
  // the finalized answer, so that case keeps the legacy html path.
  assert.equal(hasTurnStructure('a\n\n<think>b</think>', []), false);
  // A persisted call that fails the offset filter must not flip the route:
  // rendering it declaratively would silently drop the row.
  assert.equal(hasTurnStructure('short', [{ id: 'x', name: 'Read', textOffset: 999 }]), false);
});

/* ── legacy HTML back-compat ─────────────────────────────────────────── */

test('stripLegacyToolHtml removes baked tool rows and leaves prose alone', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.DOMParser = dom.window.DOMParser;
  const baked = [
    '<div class="stream-segment"><p>prose before</p></div>',
    '<details class="tool-inline" data-tcid="a" data-state="done"><summary>x</summary><div class="tool-inline-detail"></div></details>',
    '<section class="tool-run-group"><button class="tool-run-summary">y</button><div class="tool-run-list"></div></section>',
    '<div class="tool-inline-attachments"><div class="exec-artifact">chart</div></div>',
    '<div class="stream-segment"><p>prose after</p></div>',
  ].join('');
  const stripped = stripLegacyToolHtml(baked);
  assert.doesNotMatch(stripped, /tool-inline|tool-run-group|tool-inline-attachments/);
  assert.match(stripped, /prose before/);
  assert.match(stripped, /prose after/);
  // Idempotent: the second pass changes nothing.
  assert.equal(stripLegacyToolHtml(stripped), stripped);
});

test('stripLegacyToolHtml is a no-op when no DOM parser is available', () => {
  const saved = globalThis.DOMParser;
  delete globalThis.DOMParser;
  try {
    const html = '<p>hi</p><details class="tool-inline"><summary>x</summary></details>';
    assert.equal(stripLegacyToolHtml(html), html, 'never mangle content without a parser');
  } finally {
    globalThis.DOMParser = saved;
  }
});

test('stripLegacyToolHtml short-circuits html that has no tool rows', () => {
  const saved = globalThis.DOMParser;
  delete globalThis.DOMParser;
  try {
    assert.equal(stripLegacyToolHtml('<p>ordinary <strong>markdown</strong></p>'), '<p>ordinary <strong>markdown</strong></p>');
  } finally {
    globalThis.DOMParser = saved;
  }
});
