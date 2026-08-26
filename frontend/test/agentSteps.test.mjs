import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

/* Minimal DOM: the module only needs document.createElement plus the
   querySelector/dataset surface jsdom already provides. */
const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.CSS = dom.window.CSS;

const {
  agentStepLabel,
  ensureAgentRunSection,
  formatElapsed,
  renderAgentRun,
  settleAgentRun,
  stopAgentRunTimer,
  upsertAgentPlan,
  upsertAgentStep,
} = await import('../src/ui/agentSteps.ts');

function host() {
  const node = document.createElement('div');
  document.body.appendChild(node);
  return node;
}

/* The module drives running rows from one shared interval. Release every
   section after each test so the runner's event loop can drain. */
test.afterEach(() => {
  document.querySelectorAll('.agent-run').forEach((section) => stopAgentRunTimer(section));
  document.body.replaceChildren();
});

function step(overrides = {}) {
  return {
    stepId: 's1',
    kind: 'command',
    title: '运行了命令',
    detail: 'npm run test:unit',
    command: 'npm run test:unit',
    status: 'running',
    exitCode: null,
    durationMs: null,
    diffStat: null,
    output: null,
    ...overrides,
  };
}

test('formatElapsed matches the reference "用时 1h 39m 2s" shape', () => {
  assert.equal(formatElapsed(0), '用时 0s');
  assert.equal(formatElapsed(2_000), '用时 2s');
  assert.equal(formatElapsed(62_000), '用时 1m 2s');
  assert.equal(formatElapsed((1 * 3600 + 39 * 60 + 2) * 1000), '用时 1h 39m 2s');
});

test('a running command step renders the Chinese label and shimmer', () => {
  const body = host();
  const row = upsertAgentStep(body, step(), 'run-1');
  assert.equal(row.dataset.state, 'running');
  assert.equal(row.dataset.kind, 'command');
  assert.equal(row.querySelector('.agent-step-label').textContent, '运行了命令');
  assert.ok(row.querySelector('.agent-step-label').classList.contains('shimmer-text'));
  assert.equal(row.querySelector('.agent-step-cmd').textContent, 'npm run test:unit');
  assert.ok(row.querySelector('.agent-step-icon svg'), 'a stroke icon is mounted');
  assert.equal(body.querySelectorAll('.agent-run').length, 1);
});

test('the completed command step reads 已运行 <command> with its duration', () => {
  const body = host();
  upsertAgentStep(body, step(), 'run-1');
  const row = upsertAgentStep(body, step({ status: 'done', durationMs: 1234 }), 'run-1');
  assert.equal(body.querySelectorAll('.agent-step').length, 1, 'the same step id updates in place');
  assert.equal(row.querySelector('.agent-step-label').textContent, '已运行 npm run test:unit');
  assert.equal(row.querySelector('.agent-step-label').classList.contains('shimmer-text'), false);
  assert.match(row.querySelector('.agent-step-meta').textContent, /1\.2s/);
  // The command is in the label, so the inline code slot stays out of the way.
  assert.equal(row.querySelector('.agent-step-cmd').hidden, true);
});

test('step labels follow the projected kind', () => {
  assert.equal(agentStepLabel(step({ kind: 'read', status: 'done' })), '读取了文件');
  assert.equal(agentStepLabel(step({ kind: 'file_change', status: 'done' })), '编辑了文件');
  assert.equal(agentStepLabel(step({ kind: 'search', status: 'running' })), '搜索了网页');
  assert.equal(agentStepLabel(step({ kind: 'mcp', status: 'done' })), '调用了 MCP 工具');
});

test('an English dictionary overrides the Chinese baseline', () => {
  window.t = (key) => (key === 'agent.stepRead' ? 'Read files' : key);
  try {
    assert.equal(agentStepLabel(step({ kind: 'read', status: 'done' })), 'Read files');
    // Keys with no entry keep the Chinese baseline instead of leaking the key.
    assert.equal(agentStepLabel(step({ kind: 'search', status: 'done' })), '搜索了网页');
  } finally {
    delete window.t;
  }
});

test('a failed step shows its exit code', () => {
  const body = host();
  const row = upsertAgentStep(body, step({ status: 'failed', exitCode: 1, durationMs: 900 }), 'run-1');
  assert.equal(row.dataset.state, 'failed');
  assert.match(row.querySelector('.agent-step-meta').textContent, /exit 1/);
});

test('file-change steps list paths and diff counts', () => {
  const body = host();
  const row = upsertAgentStep(body, step({
    stepId: 's2',
    kind: 'file_change',
    command: null,
    detail: 'main.js  +12 -4',
    status: 'done',
    diffStat: { files: 2, added: 12, removed: 4, paths: ['[workspace]/a.js', '[workspace]/b.js'] },
  }), 'run-1');
  assert.match(row.querySelector('.agent-step-meta').textContent, /2 files/);
  assert.match(row.querySelector('.agent-step-meta').textContent, /\+12 -4/);
  /* The counts belong to the meta column, so the inline excerpt shows only
     the file names instead of repeating them. */
  assert.equal(row.querySelector('.agent-step-cmd').textContent, 'a.js, b.js');
  assert.deepEqual(
    Array.from(row.querySelectorAll('.agent-step-paths li')).map((li) => li.textContent),
    ['[workspace]/a.js', '[workspace]/b.js'],
  );
});

test('command output is written as text, never as markup', () => {
  const body = host();
  const row = upsertAgentStep(body, step({
    status: 'done',
    output: '<img src=x onerror=alert(1)>',
  }), 'run-1');
  const pre = row.querySelector('.agent-step-pre[data-kind="output"]');
  assert.equal(pre.textContent, '<img src=x onerror=alert(1)>');
  assert.equal(pre.querySelector('img'), null);
});

test('a step with nothing to reveal is marked flat', () => {
  const body = host();
  const row = upsertAgentStep(body, step({ kind: 'search', command: null, detail: 'query', status: 'done' }), 'run-1');
  assert.ok(row.classList.contains('is-flat'));
});

test('rows use native details/summary so they survive HTML serialization', () => {
  const body = host();
  upsertAgentStep(body, step({ status: 'done', output: 'ok' }), 'run-1');
  const html = body.innerHTML;
  const revived = document.createElement('div');
  revived.innerHTML = html;
  const row = revived.querySelector('.agent-step');
  assert.equal(row.tagName.toLowerCase(), 'details');
  assert.equal(row.querySelector('summary').className, 'agent-step-head');
  assert.equal(row.querySelector('.agent-step-label').textContent, '已运行 npm run test:unit');
});

test('the plan card updates in place and sits above the steps', () => {
  const body = host();
  upsertAgentStep(body, step(), 'run-1');
  upsertAgentPlan(body, {
    steps: [
      { title: '读代码', status: 'done' },
      { title: '改实现', status: 'in_progress' },
      { title: '补测试', status: 'todo' },
    ],
    explanation: '先读后改',
  }, 'run-1');
  upsertAgentPlan(body, {
    steps: [
      { title: '读代码', status: 'done' },
      { title: '改实现', status: 'done' },
      { title: '补测试', status: 'in_progress' },
    ],
  }, 'run-1');

  assert.equal(body.querySelectorAll('.agent-plan').length, 1, 'one card per run');
  const card = body.querySelector('.agent-plan');
  assert.equal(card.dataset.progress, '2/3');
  assert.deepEqual(
    Array.from(card.querySelectorAll('.agent-plan-item')).map((li) => li.dataset.status),
    ['done', 'done', 'in_progress'],
  );
  assert.equal(card.querySelector('.agent-plan-title').textContent, '更新了计划');
  // The stale explanation is cleared when the next update omits it.
  assert.equal(card.querySelector('.agent-plan-note').hidden, true);
  const list = body.querySelector('.agent-run-steps');
  assert.equal(list.firstElementChild.className, 'agent-plan');
});

test('settleAgentRun latches the duration and resolves running rows', () => {
  const body = host();
  upsertAgentStep(body, step(), 'run-1');
  settleAgentRun(body, { runId: 'run-1', durationMs: (39 * 60 + 2) * 1000 });
  const section = body.querySelector('.agent-run');
  assert.equal(section.dataset.state, 'done');
  assert.equal(section.querySelector('.agent-run-elapsed').textContent, '用时 39m 2s');
  assert.equal(section.querySelector('.agent-step').dataset.state, 'done');
  /* The step list stays visible after the run finishes: it is the record of
     what the agent did, matching the reference interface. */
  assert.equal(section.querySelector('.agent-run-shell').open, true);
  stopAgentRunTimer(section);
});

test('renderAgentRun rebuilds a persisted run for history replay', () => {
  const body = host();
  const section = renderAgentRun(body, {
    runId: 'run-9',
    plan: { steps: [{ title: '读代码', status: 'done' }] },
    steps: [
      step({ stepId: 'a', kind: 'read', status: 'done', command: 'cat notes.txt' }),
      step({ stepId: 'b', status: 'done', durationMs: 2000 }),
    ],
    durationMs: 5000,
  });
  assert.ok(section);
  assert.equal(body.querySelectorAll('.agent-step').length, 2);
  assert.equal(body.querySelector('.agent-plan-item').dataset.status, 'done');
  assert.equal(body.querySelector('.agent-run-elapsed').textContent, '用时 5s');
  assert.equal(renderAgentRun(body, { runId: 'run-none', steps: [] }), null, 'nothing to replay');
  stopAgentRunTimer(body.querySelector('.agent-run'));
});

test('one run section is reused across steps and plans', () => {
  const body = host();
  const first = ensureAgentRunSection(body, 'run-2');
  const second = ensureAgentRunSection(body, 'run-2');
  assert.equal(first, second);
  stopAgentRunTimer(first);
});
