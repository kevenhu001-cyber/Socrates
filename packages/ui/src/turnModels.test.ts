import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activityTimeline,
  publicSummariesOf,
  splitSummary,
  stepsWithFallback,
  thinkingHeaderOf,
  thinkingLabelOf,
  type ThinkingLabels,
} from './turn/thinkingModel.ts';
import {
  aggregateStatus,
  clipText,
  faviconUrlOf,
  formatDurationMs,
  hostOf,
  monogramOf,
  sourceCardsOf,
  sumDurations,
  toolTargetOf,
  toolVerbOf,
} from './turn/toolCardModel.ts';

const ZH: ThinkingLabels = {
  live: '正在处理…',
  done: '活动记录 · {sec} 秒',
  doneNoSteps: '活动记录 · {sec} 秒',
  doneNoTime: '活动详情',
  fallback: '活动摘要',
};

test('splitSummary reads bold, heading, line and sentence shapes', () => {
  assert.deepEqual(splitSummary('**梳理问题**\n\n先确认 **路由** 稳定性。'), { title: '梳理问题', summary: '先确认 路由 稳定性。' });
  assert.deepEqual(splitSummary('## Plan\nCheck the docs first.'), { title: 'Plan', summary: 'Check the docs first.' });
  assert.deepEqual(splitSummary('查资料\n读两篇论文'), { title: '查资料', summary: '读两篇论文' });
  assert.deepEqual(splitSummary('短句'), { title: '短句', summary: '' });
  assert.deepEqual(splitSummary('Comparing the sources. Both agree on the loss term and its weight.'), {
    title: 'Comparing the sources', summary: 'Both agree on the loss term and its weight.',
  });
  assert.deepEqual(splitSummary('Checked the relevant sources.'), { title: 'Checked the relevant sources.', summary: '' });
  assert.deepEqual(splitSummary(''), { title: '', summary: '' });
});

test('only public reasoning summaries become steps; raw reasoning never does', () => {
  const steps = publicSummariesOf([
    { id: 'raw', kind: 'reasoning', text: 'PRIVATE chain of thought' },
    { id: 'a', kind: 'reasoning_summary', text: '**A**\n\none', startedAt: 1 },
    { id: 'dup', kind: 'reasoning_summary', text: '**A**\n\none', startedAt: 2 },
    { id: 'empty', kind: 'reasoning_summary', text: '   ' },
    { id: 'tool', kind: 'tool', text: 'web_search' },
    { id: 'b', kind: 'reasoning_summary', text: 'Second step', phase: 'running', startedAt: 3 },
  ]);
  assert.deepEqual(steps.map((step) => step.id), ['a', 'b']);
  assert.ok(!JSON.stringify(steps).includes('PRIVATE'));
  assert.equal(steps[1].phase, 'running');
  assert.deepEqual(publicSummariesOf(null), []);
});

test('fallback uses the transport summary only when the timeline is empty', () => {
  assert.equal(stepsWithFallback([], 'Checked sources.')[0].title, 'Checked sources.');
  assert.deepEqual(stepsWithFallback([], ''), []);
  const kept = [{ id: 'x', title: 't', summary: '' }];
  assert.equal(stepsWithFallback(kept, 'other'), kept);
});

test('timeline interleaves by time and merges consecutive tools into one group', () => {
  const steps = [
    { id: 's1', title: 'one', summary: '', startedAt: 10 },
    { id: 's2', title: 'two', summary: '', startedAt: 40 },
  ];
  const tools = [
    { id: 't1', startedAt: 20, item: 't1' },
    { id: 't2', startedAt: 30, item: 't2' },
    { id: 't3', startedAt: 50, item: 't3' },
    { id: 't4', item: 't4' },
  ];
  const timeline = activityTimeline(steps, tools);
  assert.deepEqual(timeline.map((entry) => entry.kind === 'step' ? entry.step.id : entry.tools.join('+')), ['s1', 't1+t2', 's2', 't3+t4']);
  // Untimed history tools follow the summaries.
  const history = activityTimeline(steps, [{ id: 'a', item: 'a' }, { id: 'b', item: 'b' }]);
  assert.deepEqual(history.map((entry) => entry.kind), ['step', 'step', 'tools']);
});

test('activity labels report observed status and duration without claiming reasoning steps', () => {
  const live = thinkingHeaderOf({ live: true, stepCount: 0 });
  assert.equal(live.steps, 1, 'the compatibility view model still guarantees a live count internally');
  assert.equal(thinkingLabelOf(live, ZH), '正在处理…');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: true, stepCount: 3 }), ZH), '正在处理…');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: false, stepCount: 6, durationSec: 11.4 }), ZH), '活动记录 · 11 秒');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: false, stepCount: 2, durationSec: 0.2 }), ZH), '活动记录 · 1 秒');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: false, stepCount: 0, durationSec: 4 }), ZH), '活动记录 · 4 秒');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: false, stepCount: 2 }), ZH), '活动详情');
  assert.equal(thinkingLabelOf(thinkingHeaderOf({ live: false, stepCount: 0, durationSec: Number.NaN }), ZH), '活动摘要');
});

test('verbs map tool names to one action vocabulary', () => {
  assert.equal(toolVerbOf('web_search').key, 'tool.verb.search');
  assert.equal(toolVerbOf('arxiv_search').key, 'tool.verb.search');
  assert.equal(toolVerbOf('WebFetch').key, 'tool.verb.fetch');
  assert.equal(toolVerbOf('code_interpreter').key, 'tool.verb.code');
  assert.equal(toolVerbOf('Bash').key, 'tool.verb.command');
  assert.equal(toolVerbOf('save_memory').key, 'tool.verb.memory');
  assert.equal(toolVerbOf('create_plan').key, 'tool.verb.plan');
  assert.equal(toolVerbOf('Grep').key, 'tool.verb.read');
  assert.equal(toolVerbOf('oc_github').key, 'tool.verb.connector');
  assert.equal(toolVerbOf('mystery').key, 'tool.verb.default');
});

test('targets show query, domain, file name or command', () => {
  assert.equal(toolTargetOf('web_search', { query: '  MoE   routing ' }), 'MoE routing');
  assert.equal(toolTargetOf('web_fetch', { url: 'https://www.Example.com/a?b' }), 'example.com');
  assert.equal(toolTargetOf('Write', { file_path: 'src/app/router.py' }), 'router.py');
  assert.equal(toolTargetOf('Bash', { command: 'npm test' }), 'npm test');
  assert.equal(toolTargetOf('code_interpreter', { code: 'print(1)' }), '');
  assert.equal(toolTargetOf('x', null), '');
  assert.equal(clipText('a'.repeat(60), 10), 'aaaaaaaaa…');
});

test('durations format compactly', () => {
  assert.equal(formatDurationMs(40), '0.1s');
  assert.equal(formatDurationMs(1800), '1.8s');
  assert.equal(formatDurationMs(2000), '2s');
  assert.equal(formatDurationMs(30000), '30s');
  assert.equal(formatDurationMs(65000), '1m 05s');
  assert.equal(formatDurationMs(undefined), '');
  assert.equal(formatDurationMs(-1), '');
  assert.equal(sumDurations([100, null, 200]), 300);
  assert.equal(sumDurations([null, undefined]), null);
});

test('group status: decision > running > error > stopped > done', () => {
  assert.equal(aggregateStatus(['done', 'error', 'running']), 'running');
  assert.equal(aggregateStatus(['running', 'awaiting']), 'awaiting');
  assert.equal(aggregateStatus(['done', 'error']), 'error');
  assert.equal(aggregateStatus([]), 'done');
});

test('source cards carry favicon, monogram and safe links only', () => {
  assert.equal(hostOf('https://www.arxiv.org/abs/1'), 'arxiv.org');
  assert.equal(faviconUrlOf('https://arxiv.org/abs/1'), 'https://arxiv.org/favicon.ico');
  assert.equal(faviconUrlOf('javascript:alert(1)'), null);
  assert.equal(monogramOf('www.github.com'), 'G');
  assert.equal(monogramOf(''), '?');
  const cards = sourceCardsOf([{ title: 'Paper', url: 'https://arxiv.org/abs/1' }, { title: 'Bad', url: 'javascript:x' }]);
  assert.equal(cards[0].host, 'arxiv.org');
  assert.equal(cards[1].url, null);
  assert.equal(cards[1].favicon, null);
});
