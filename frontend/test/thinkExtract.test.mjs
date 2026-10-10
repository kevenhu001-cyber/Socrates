import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineThinkingText,
  extractThinkText,
  extractStepSummary,
  generateInitialTaskSummary,
  INLINE_THINK_DIVIDER,
} from '../src/chat/thinkExtract.ts';

test('extractThinkText returns empty string without think blocks', () => {
  assert.equal(extractThinkText('plain answer'), '');
  assert.equal(extractThinkText(''), '');
  assert.equal(extractThinkText(null), '');
  assert.equal(extractThinkText(undefined), '');
});

test('extractThinkText collects closed blocks', () => {
  assert.equal(
    extractThinkText('a <think>first</think> b <think>second</think> c'),
    'first\n\nsecond',
  );
});

test('extractThinkText includes an unclosed trailing tail', () => {
  assert.equal(extractThinkText('a <think>partial'), 'partial');
  assert.equal(
    extractThinkText('a <think>done</think> b <think>live'),
    'done\n\nlive',
  );
});

test('combineThinkingText returns whichever part exists', () => {
  assert.equal(combineThinkingText('reasoning', 'plain'), 'reasoning');
  assert.equal(combineThinkingText('', 'a <think>inner</think> b'), 'inner');
  assert.equal(combineThinkingText('', 'plain'), '');
});

test('combineThinkingText joins both parts with the default divider', () => {
  assert.equal(
    combineThinkingText('reasoning', 'a <think>inner</think> b'),
    `reasoning\n\n${INLINE_THINK_DIVIDER}\n\ninner`,
  );
});

test('combineThinkingText honors an explicit divider', () => {
  assert.equal(
    combineThinkingText('reasoning', 'a <think>inner</think> b', { divider: '---' }),
    'reasoning\n\n---\n\ninner',
  );
});

test('extractStepSummary parses explicit step headers', () => {
  assert.equal(
    extractStepSummary('首先分析题意。第一步：拆解运动条件和数据分析。已知初速度为0...'),
    '拆解运动条件和数据分析',
  );
  assert.equal(
    extractStepSummary('第一步：拆解运动条件和数据分析\n第二步：建立微分方程并推导'),
    '建立微分方程并推导',
  );
});

test('extractStepSummary handles intent markers and action verbs', () => {
  assert.equal(
    extractStepSummary('我们需要拆解运动条件和数据分析'),
    '拆解运动条件和数据分析',
  );
  assert.equal(
    extractStepSummary('正在分析柯西积分定理在单连通区域的适用条件'),
    '分析柯西积分定理在单连通区域的适用条件',
  );
});

test('extractStepSummary returns empty for non-string or empty input', () => {
  assert.equal(extractStepSummary(''), '');
  assert.equal(extractStepSummary(null), '');
  assert.equal(extractStepSummary(undefined), '');
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
    generateInitialTaskSummary('为什么天空是蓝色的？'),
    '天空是蓝色的成因与机理剖析。',
  );
  assert.equal(
    generateInitialTaskSummary(''),
    '',
  );
});
