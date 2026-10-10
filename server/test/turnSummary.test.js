import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSummary, generateTurnSummary, generateInitialTaskSummary, TURN_SUMMARY_SYSTEM_PROMPT } from '../src/services/turnSummary.js';

test('normalizeSummary strips the wrappers models reach for', () => {
  assert.equal(normalizeSummary('查找了 3 个来源并汇总'), '查找了 3 个来源并汇总');
  assert.equal(normalizeSummary('- 查找了 3 个来源'), '查找了 3 个来源');
  assert.equal(normalizeSummary('Summary: 查找了 3 个来源'), '查找了 3 个来源');
  assert.equal(normalizeSummary('摘要：已完成比对'), '已完成比对');
  assert.equal(normalizeSummary('"完成了分析"'), '完成了分析');
  assert.equal(normalizeSummary('「完成了分析」'), '完成了分析');
  assert.equal(normalizeSummary('完成了分析。'), '完成了分析');
  assert.equal(normalizeSummary('  完成了  分析  '), '完成了 分析');
});

test('normalizeSummary takes the first usable line', () => {
  assert.equal(normalizeSummary('Summary: 第一行\n第二行\n第三行'), '第一行');
  assert.equal(normalizeSummary('\n\n  \n真正的第一行'), '真正的第一行');
});

test('normalizeSummary drops control characters', () => {
  /* A stray NUL / bell would break the one-line layout. */
  assert.equal(normalizeSummary('完成\x00了\x1b分析'), '完成了分析');
});

test('normalizeSummary caps long output', () => {
  const long = 'x'.repeat(300);
  const out = normalizeSummary(long, 180);
  assert.equal(out.length, 180);
  assert.ok(out.endsWith('…'));
});

test('normalizeSummary rejects empty input', () => {
  assert.equal(normalizeSummary(''), null);
  assert.equal(normalizeSummary('   '), null);
  assert.equal(normalizeSummary('- '), null);
  assert.equal(normalizeSummary('摘要：'), null);
});

test('generateTurnSummary returns the model line', async () => {
  const out = await generateTurnSummary(
    { question: '报销流程', answer: '差旅报销需要提交…'.repeat(20), toolCalls: [{ name: 'web_search' }] },
    { complete: async () => '查找了 3 个来源并汇总' },
  );
  assert.equal(out, '查找了 3 个来源并汇总');
});

test('generateTurnSummary names the tool outcome in the prompt', async () => {
  let seen = '';
  await generateTurnSummary(
    { question: 'Q', answer: 'A'.repeat(80), toolCalls: [{ name: 'web_search' }, { name: 'code_interpreter', isError: true }] },
    { complete: async (p) => { seen = p; return 'ok'; } },
  );
  assert.match(seen, /web_search/);
  assert.match(seen, /code_interpreter\(失败\)/);
});

test('generateTurnSummary includes reasoning in prompt when provided', async () => {
  let seen = '';
  await generateTurnSummary(
    { question: '物理题', answer: 'A'.repeat(80), toolCalls: [], reasoning: '拆解运动条件和数据分析，计算初速度' },
    { complete: async (p) => { seen = p; return 'ok'; } },
  );
  assert.match(seen, /思考与推导要点：拆解运动条件和数据分析/);
});

test('generateTurnSummary skips turns with nothing to summarise', async () => {
  let called = false;
  const out = await generateTurnSummary(
    { question: 'Q', answer: '', toolCalls: [] },
    { complete: async () => { called = true; return 'x'; } },
  );
  assert.equal(out, null);
  assert.equal(called, false, 'must not spend a call on an empty turn');
});

test('generateTurnSummary tolerates a failing provider', async () => {
  const out = await generateTurnSummary(
    { question: 'Q', answer: 'A'.repeat(80), toolCalls: [] },
    { complete: async () => { throw new Error('upstream 500'); } },
  );
  assert.equal(out, null);
});

test('generateTurnSummary hands its deadline down as a real signal', async () => {
  /* The timeout is only worth anything if it reaches the request. A provider
     call that ignores the signal would hold the turn's closing frame open for
     as long as it liked — which is exactly what a rate-limited key does while
     it works through a retry budget. */
  let seen;
  const out = await generateTurnSummary(
    { question: 'Q', answer: 'A'.repeat(80), toolCalls: [] },
    {
      timeoutMs: 20,
      complete: (_prompt, signal) => new Promise((_resolve, reject) => {
        seen = signal;
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    },
  );
  assert.equal(out, null, 'a timed-out summary degrades to null');
  assert.ok(seen, 'complete() must receive a signal');
  assert.equal(seen.aborted, true, 'the signal must actually be aborted by the deadline');
});

test('the system prompt asks for one plain line', () => {
  assert.match(TURN_SUMMARY_SYSTEM_PROMPT, /One line/);
  assert.match(TURN_SUMMARY_SYSTEM_PROMPT, /No markdown/);
});

test('generateInitialTaskSummary returns upfront summary before thinking begins', () => {
  assert.equal(
    generateInitialTaskSummary('解析函数积分与路径无关吗'),
    '解析函数路径无关性的说明。',
  );
  assert.equal(
    generateInitialTaskSummary('已知小球从高处自由落体，求运动时间和落地速度'),
    '拆解运动条件和数据分析。',
  );
  assert.equal(
    generateInitialTaskSummary('帮我用 Python 写一个爬虫'),
    '爬虫方案设计与代码实现。',
  );
  assert.equal(
    generateInitialTaskSummary('求解微分方程 dy/dx = y'),
    '微分方程求解与推导。',
  );
  assert.equal(
    generateInitialTaskSummary(''),
    '',
  );
});
