import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';
import { marked } from 'marked';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.t = (key) => key;
/* formatMsg reads the eagerly-bundled marked global (vendor/init.js in
   the browser); provide the npm copy the same way streaming.test.mjs does. */
globalThis.marked = marked;

const { buildAssistantHtml, configureAssistantHtml } = await import(
  '../src/render/assistantHtml.ts'
);
const { setAppMode } = await import('../src/config/providers.js');

test('plain markdown renders to html', () => {
  const html = buildAssistantHtml('Hello **world**');
  assert.match(html, /<strong>world<\/strong>/);
});

test('think blocks never reach the prose, closed or trailing', () => {
  assert.doesNotMatch(buildAssistantHtml('a <think>scratch</think> b'), /scratch/);
  assert.doesNotMatch(buildAssistantHtml('a <think>partial'), /partial/);
});

test('chat mode strips a trailing Sources block, tutor mode keeps it', () => {
  setAppMode('chat');
  try {
    assert.doesNotMatch(buildAssistantHtml('Answer.\nSources: example.com'), /example\.com/);
  } finally {
    setAppMode('chat');
  }
  setAppMode('tutor');
  try {
    assert.match(buildAssistantHtml('Answer.\nSources: example.com'), /example\.com/);
  } finally {
    setAppMode('chat');
  }
});

test('chat mode keeps prose that follows a mid-answer 参考：/来源： line', () => {
  /* The old rule cut from the FIRST marker line to the end, so an ordinary
     reference sentence swallowed the rest of the answer at finish. */
  setAppMode('chat');
  try {
    const html = buildAssistantHtml('正文第一段。\n\n参考：教材第三章。\n\n后续还有很重要的内容。');
    assert.match(html, /教材第三章/);
    assert.match(html, /后续还有很重要的内容/);
    const mixed = buildAssistantHtml('Answer.\n\nSources: example.com\n\nHope this helps!');
    assert.match(mixed, /Hope this helps!/);
  } finally {
    setAppMode('chat');
  }
});

test('chat mode strips a trailing citation list with links or [n] entries', () => {
  setAppMode('chat');
  try {
    const html = buildAssistantHtml(
      '判别式决定根的个数。\n\n参考资料：\n[1] 维基百科：二次方程\n[2] https://example.com/quadratic',
    );
    assert.match(html, /判别式决定根的个数/);
    assert.doesNotMatch(html, /维基百科|example\.com|参考资料/);
    const links = buildAssistantHtml(
      'Answer text.\n\nSources:\n- [Wiki](https://en.wikipedia.org/wiki/Quadratic)\n- www.khanacademy.org',
    );
    assert.match(links, /Answer text\./);
    assert.doesNotMatch(links, /wikipedia|khanacademy|Sources/);
  } finally {
    setAppMode('chat');
  }
});

test('chat mode keeps an answer that STARTS with a sources-like marker', () => {
  /* The trailing-Sources rule must never blank the whole bubble: a short
     answer can legitimately open with such a marker (e.g. an etymology
     reply "来源：意大利语…"), and deleting it reads as the head of the
     answer being swallowed. */
  setAppMode('chat');
  try {
    const html = buildAssistantHtml('来源：意大利语 quarantina，意为四十。');
    assert.match(html, /意大利语/);
    const ref = buildAssistantHtml('参考：详见上文第二段分析。');
    assert.match(ref, /上文第二段/);
  } finally {
    setAppMode('chat');
  }
});

test('first quiz becomes a slot, extra quizzes degrade to text', () => {
  const quiz = '<quiz><q>Pick?</q><o letter="A">x</o><o letter="B">y</o><correct>A</correct></quiz>';
  const html = buildAssistantHtml(`${quiz} mid ${quiz}`);
  const slots = html.match(/data-quiz-id="/g) || [];
  assert.equal(slots.length, 1);
  assert.match(html, /Pick\?/);
});

test('unparseable quiz renders the fallback card', () => {
  const html = buildAssistantHtml('<quiz>no question here</quiz>');
  assert.match(html, /inline-block-fallback/);
  assert.doesNotMatch(html, /data-quiz-id/);
});

test('example and practice blocks become slots', () => {
  const html = buildAssistantHtml(
    '<example><title>T</title><problem>P</problem><solution>S</solution></example>',
  );
  assert.match(html, /data-example-id="/);

  const practice = buildAssistantHtml(
    '<practice correct="42"><problem>What?</problem></practice>',
  );
  assert.match(practice, /data-practice-id="/);
});

test('mistake blocks are stripped and recorded with the inner question', () => {
  const seen = [];
  configureAssistantHtml({
    recordMistake: (rec) => {
      seen.push(rec);
    },
  });
  try {
    const html = buildAssistantHtml('<mistake type="practice" correct="42">What is 6x7?</mistake>');
    assert.doesNotMatch(html, /What is 6x7\?/);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'practice');
    assert.equal(seen[0].q, 'What is 6x7?');
    assert.equal(seen[0].correct, '42');
  } finally {
    configureAssistantHtml({ recordMistake: () => {} });
  }
});

test('scaffold definition tags become slots via the pipeline', () => {
  const html = buildAssistantHtml('<definition><term>Entropy</term><body>Disorder.</body></definition>');
  assert.match(html, /data-definition-id="/);
});
