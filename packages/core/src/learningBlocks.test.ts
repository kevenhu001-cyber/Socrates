import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cleanText,
  extractNextQuestions,
  normalizeConceptMap,
  normalizeDiagnosticInsight,
  normalizeMistakeAnalysis,
  normalizeNextQuestions,
  parseLooseJson,
  stripNextQuestions,
} from './learningBlocks.ts';

describe('parseLooseJson', () => {
  it('reads JSON wrapped in fences, think blocks and prose', () => {
    const out = parseLooseJson('<think>plan</think>Here you go:\n```json\n{"a":1}\n```\nDone.');
    assert.deepEqual(out.value, { a: 1 });
    assert.equal(out.truncated, false);
  });
  it('preserves source offsets when Unicode precedes a think block', () => {
    assert.deepEqual(parseLooseJson('İ<think>private</think>{"a":1}').value, { a: 1 });
  });
  it('repairs curly-quote delimiters and trailing commas', () => {
    assert.deepEqual(parseLooseJson('{“a”: [1, 2,],}').value, { a: [1, 2] });
  });
  it('flags a cut-off document and salvages the complete objects', () => {
    const out = parseLooseJson('{"nodes":[{"name":"A","definition":"x"},{"name":"B","defin');
    assert.equal(out.value, undefined);
    assert.equal(out.truncated, true);
    assert.deepEqual(out.salvaged, [{ name: 'A', definition: 'x' }]);
  });
  it('returns nothing for text without JSON', () => {
    assert.deepEqual(parseLooseJson('no json here'), { value: undefined, truncated: false, salvaged: [] });
  });
  it('strips many unclosed think blocks in linear time', () => {
    const out = parseLooseJson('<think>'.repeat(20_000) + 'unfinished');
    assert.deepEqual(out, { value: undefined, truncated: false, salvaged: [] });
  });
});

describe('next questions', () => {
  it('extracts a JSON array at the end of a reply', () => {
    const reply = 'Body text.\n\n<next-questions>["为什么需要先验？", "如果先验均匀会怎样？"]</next-questions>';
    assert.deepEqual(extractNextQuestions(reply), { status: 'ok', questions: ['为什么需要先验？', '如果先验均匀会怎样？'], warnings: [] });
  });
  it('accepts an object form, item objects, and dedupes', () => {
    const out = normalizeNextQuestions('{"questions":[{"question":"Why?"},"Why?","What if x=0?"]}');
    assert.deepEqual(out.questions, ['Why?', 'What if x=0?']);
  });
  it('reads a plain numbered list and caps at three', () => {
    const out = normalizeNextQuestions('1. One?\n2. Two?\n- Three?\n4) Four?');
    assert.equal(out.status, 'ok');
    assert.deepEqual(out.questions, ['One?', 'Two?', 'Three?']);
    assert.equal(out.warnings.length, 2);
  });
  it('reports a block that never closed as truncated, with no questions', () => {
    assert.deepEqual(extractNextQuestions('Body <next-questions>["A?", "B'), { status: 'truncated', questions: [], warnings: ['The question block never closed.'] });
  });
  it('reports a reply without the block as missing (no fixed fallback)', () => {
    assert.equal(extractNextQuestions('Just prose.').status, 'missing');
    assert.deepEqual(extractNextQuestions(null).questions, []);
  });
  it('treats an empty list as invalid', () => {
    assert.equal(normalizeNextQuestions('[]').status, 'invalid');
  });
  it('uses the last block when the model wrote more than one', () => {
    assert.deepEqual(extractNextQuestions('<next-questions>["Old?"]</next-questions> x <next-questions>["New?"]</next-questions>').questions, ['New?']);
  });
});

describe('stripNextQuestions', () => {
  it('removes a complete block', () => {
    assert.equal(stripNextQuestions('Body.\n\n<next-questions>["A?"]</next-questions>\n'), 'Body.\n');
  });
  it('hides an unclosed block while streaming', () => {
    assert.equal(stripNextQuestions('Body.\n<next-questions>["A'), 'Body.\n');
  });
  it('hides a half-typed opening tag at the tail but keeps other tags', () => {
    assert.equal(stripNextQuestions('Body <next-qu'), 'Body ');
    assert.equal(stripNextQuestions('Body <flashcard>'), 'Body <flashcard>');
    assert.equal(stripNextQuestions('a < b'), 'a < b');
  });
});

describe('normalizeConceptMap', () => {
  const known = ['贝叶斯定理', '先验概率', '似然'];
  it('adds definitions to known nodes and resolves links by name or index', () => {
    const out = normalizeConceptMap(JSON.stringify({
      nodes: [{ name: '先验概率', definition: '观测之前对假设的信念。' }, { name: '贝叶斯定理', definition: '用证据更新信念的规则。' }],
      links: [
        { from: '先验概率', to: '贝叶斯定理', relation: '组成部分', why: '贝叶斯定理用先验乘以似然得到后验。' },
        { from: 2, to: 0, why: '似然衡量证据对假设的支持。' },
      ],
    }), known);
    assert.equal(out.status, 'ok');
    assert.deepEqual(out.nodes.map((node) => node.name), known);
    assert.equal(out.nodes[0]!.definition, '用证据更新信念的规则。');
    assert.equal(out.nodes[2]!.definition, null);
    assert.deepEqual(out.links.map((link) => [link.from, link.to, link.relation]), [[1, 0, '组成部分'], [2, 0, null]]);
  });
  it('drops links without a reason, to unknown nodes, self-links and duplicates', () => {
    const out = normalizeConceptMap({ links: [
      { from: 0, to: 1 },
      { from: 0, to: '不存在的概念', why: 'x' },
      { from: 1, to: 1, why: 'x' },
      { from: 0, to: 1, why: 'a' },
      { from: 1, to: 0, why: 'b' },
    ] }, known);
    assert.equal(out.links.length, 1);
    assert.equal(out.warnings.length, 3);
  });
  it('appends new nodes up to the limit without reordering known ones', () => {
    const out = normalizeConceptMap({ nodes: [{ name: '后验概率', definition: 'd' }, 'X', 'Y'] }, known, 5);
    assert.deepEqual(out.nodes.map((node) => node.name), [...known, '后验概率', 'X']);
    assert.match(out.warnings[0]!, /limit/);
  });
  it('accepts the legacy array of names', () => {
    const out = normalizeConceptMap('["A","B","C"]');
    assert.deepEqual(out.nodes, [{ name: 'A', definition: null }, { name: 'B', definition: null }, { name: 'C', definition: null }]);
  });
  it('keeps complete entries from a cut-off map and says so', () => {
    const out = normalizeConceptMap('{"nodes":[{"name":"似然","definition":"P(E|H)"}],"links":[{"from":"似然","to":"贝叶斯定理","why":"后验正比于似然乘先验"},{"from":"先', known);
    assert.equal(out.status, 'ok');
    assert.equal(out.nodes[2]!.definition, 'P(E|H)');
    assert.equal(out.links.length, 1);
  });
  it('reports pure truncation with nothing usable', () => {
    assert.equal(normalizeConceptMap('{"nodes":[{"name":"似', known).status, 'truncated');
  });
});

describe('normalizeDiagnosticInsight', () => {
  const names = ['基础概念', '核心原理', '应用场景'];
  it('maps reasons to dimensions and keeps summary and next step', () => {
    const out = normalizeDiagnosticInsight('{"summary":"概念扎实，原理薄弱。","nextStep":"先从条件概率的定义补起。","gaps":[{"name":"核心原理","reason":"把条件概率当成联合概率。"},{"name":"别的","reason":"x"}]}', names);
    assert.equal(out.status, 'ok');
    assert.equal(out.nextStep, '先从条件概率的定义补起。');
    assert.deepEqual(out.reasons, { 1: '把条件概率当成联合概率。' });
    assert.equal(out.warnings.length, 1);
  });
  it('is invalid when nothing usable came back', () => {
    assert.equal(normalizeDiagnosticInsight('{}', names).status, 'invalid');
  });
});

describe('normalizeMistakeAnalysis', () => {
  it('reads both fields with aliases', () => {
    const out = normalizeMistakeAnalysis('{"why_wrong":"混淆了 P(A|B) 和 P(B|A)。","approach":"先写出贝叶斯公式。"}');
    assert.deepEqual(out, { status: 'ok', whyWrong: '混淆了 P(A|B) 和 P(B|A)。', correctApproach: '先写出贝叶斯公式。', warnings: [] });
  });
  it('flags truncation and never invents a missing field', () => {
    const out = normalizeMistakeAnalysis('{"whyWrong":"把分母');
    assert.equal(out.status, 'truncated');
    assert.equal(out.correctApproach, null);
  });
});

describe('cleanText', () => {
  it('trims, collapses spaces and caps length', () => {
    assert.equal(cleanText('  a   b  '), 'a b');
    assert.equal(cleanText('一二三四五', 3), '一二…');
    assert.equal(cleanText(''), null);
    assert.equal(cleanText({}), null);
  });
});
