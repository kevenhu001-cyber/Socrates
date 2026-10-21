import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createStreamReveal } from '../src/render/streamReveal.ts';

function fixture() {
  const dom = new JSDOM('<div id="root"></div>');
  return { dom, root: dom.window.document.getElementById('root'), reveal: createStreamReveal() };
}

test('new chunks fade at their original age and text/markup remain intact', () => {
  const { root, reveal } = fixture();
  root.innerHTML = '<p>原文</p>';
  reveal(root, '原文', 0);
  root.innerHTML = '<p>原文 <strong>新增</strong> 😀</p>';
  reveal(root, '原文 **新增** 😀', 50);
  assert.equal(root.textContent, '原文 新增 😀');
  assert.equal(root.querySelector('strong').textContent, '新增');
  root.innerHTML = '<p>原文 <strong>新增</strong> 😀继续</p>';
  reveal(root, '原文 **新增** 😀继续', 100);
  assert.equal(root.textContent, '原文 新增 😀继续');
  assert.ok([...root.querySelectorAll('.stream-append-reveal')].some((el) => el.style.animationDelay === '-50ms'));
  assert.equal(root.querySelector('.stream-append-reveal .stream-append-reveal'), null);
  for (const span of root.querySelectorAll('.stream-append-reveal')) assert.ok(span.textContent.isWellFormed());
  root.innerHTML = '<p>原文 <strong>新增</strong> 😀继续。</p>';
  reveal(root, '原文 **新增** 😀继续。', 500);
  assert.equal(root.querySelectorAll('.stream-append-reveal').length, 1);
  assert.equal(root.querySelector('.stream-append-reveal').textContent, '。');
});

test('Markdown block separator newlines do not suppress later reveals', () => {
  const { root, reveal } = fixture();
  root.innerHTML = '<p>新的内容</p>\n';
  reveal(root, '新的内容', 0);
  root.innerHTML = '<p>新的内容，<strong>柔和渐显</strong>。</p>\n';
  assert.ok(reveal(root, '新的内容，**柔和渐显**。', 50) > 0);
  assert.equal(root.textContent, '新的内容，柔和渐显。\n');
  assert.ok([...root.querySelectorAll('.stream-append-reveal')].some((el) => el.style.animationDelay === '-50ms'));
});

test('deep formatted tails have a fixed traversal/decoration budget', () => {
  const { dom, root, reveal } = fixture();
  root.innerHTML = '<p>' + '<strong>字</strong>'.repeat(2000) + '</p>';
  const original = dom.window.Element.prototype.matches;
  let inspections = 0;
  dom.window.Element.prototype.matches = function (...args) { inspections++; return original.apply(this, args); };
  const count = reveal(root, '字'.repeat(2000), 0);
  assert.ok(inspections <= 64);
  assert.ok(count <= 24);
  assert.equal(root.textContent, '字'.repeat(2000));
});

test('long tails inspect a bounded suffix and preserve code, math, and controls', () => {
  const { root, reveal } = fixture();
  root.innerHTML = '<p>' + 'a'.repeat(100_000) + '</p><pre><code>result = 1</code></pre><button>Copy</button><span class="katex">formula</span>';
  const before = root.textContent;
  const pre = root.querySelector('pre').outerHTML;
  const math = root.querySelector('.katex').outerHTML;
  assert.ok(reveal(root, 'long answer', 0) <= 12);
  assert.equal(root.textContent, before);
  assert.equal(root.querySelector('pre').outerHTML, pre);
  assert.equal(root.querySelector('.katex').outerHTML, math);
  assert.equal([...root.querySelectorAll('.stream-append-reveal')].reduce((n, el) => n + el.textContent.length, 0), 256);
});

test('reduced motion skips decoration and history never accumulates', () => {
  const { dom, root, reveal } = fixture();
  dom.window.matchMedia = () => ({ matches: true });
  root.innerHTML = '<p>Readable immediately</p>';
  assert.equal(reveal(root, 'Readable immediately', 0), 0);
  assert.equal(root.querySelector('span'), null);
  dom.window.matchMedia = () => ({ matches: false });
  for (let i = 1; i <= 100; i++) {
    root.innerHTML = '<p>' + '字'.repeat(i) + '</p>';
    assert.ok(reveal(root, '字'.repeat(i), i) <= 12);
    assert.equal(root.textContent, '字'.repeat(i));
  }
});
