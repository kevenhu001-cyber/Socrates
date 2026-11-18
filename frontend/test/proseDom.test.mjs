import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { updateProseDom } from '../src/render/proseDom.ts';

test('appending and completing a table preserves its DOM, focus, scroll and unchanged cells', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.getElementById('host');
  const markup = (rows) =>
    `<p>Data</p><div class="ds-table-wrap" tabindex="0"><table class="ds-table"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  updateProseDom(host, markup('<tr><td>1</td><td>first</td></tr>'));
  const wrap = host.querySelector('.ds-table-wrap');
  const table = wrap.firstChild;
  const cell = table.querySelector('td');
  wrap.focus();
  wrap.scrollLeft = 70;
  updateProseDom(host, markup('<tr><td>1</td><td>first</td></tr><tr><td>2</td><td>par</td></tr>'));
  updateProseDom(
    host,
    markup('<tr><td>1</td><td>first</td></tr><tr><td>2</td><td>partial completed</td></tr>') +
      '<p>Done</p>',
  );
  assert.equal(host.querySelector('table'), table);
  assert.equal(table.querySelector('td'), cell);
  assert.equal(dom.window.document.activeElement, wrap);
  assert.equal(wrap.scrollLeft, 70);
  assert.equal(table.querySelector('tr:last-child td:last-child').textContent, 'partial completed');
  updateProseDom(host, '<p>Replaced answer</p>');
  assert.equal(host.textContent, 'Replaced answer');
  dom.window.close();
});

test('a growing paragraph keeps its element, text node and selection', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.getElementById('host');
  updateProseDom(host, '<p>First paragraph.</p>');
  const paragraph = host.querySelector('p');
  const text = paragraph.firstChild;
  const selection = dom.window.getSelection();
  const range = dom.window.document.createRange();
  range.selectNodeContents(paragraph);
  selection.removeAllRanges();
  selection.addRange(range);

  updateProseDom(host, '<p>First paragraph. More text.</p>');
  assert.equal(host.querySelector('p'), paragraph);
  assert.equal(paragraph.firstChild, text);
  assert.equal(text.nodeValue, 'First paragraph. More text.');
  assert.equal(selection.toString(), 'First paragraph. More text.');
  dom.window.close();
});

test('opening and closing inline markup replaces only the changed child', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.getElementById('host');
  updateProseDom(host, '<p>Hello world</p>');
  const paragraph = host.querySelector('p');
  const text = paragraph.firstChild;

  updateProseDom(host, '<p>Hello <strong>world</strong></p>');
  assert.equal(host.querySelector('p'), paragraph);
  assert.equal(paragraph.firstChild, text);
  assert.equal(text.nodeValue, 'Hello ');
  assert.equal(paragraph.querySelector('strong').textContent, 'world');

  updateProseDom(host, '<p>Hello world!</p>');
  assert.equal(host.querySelector('p'), paragraph);
  assert.equal(paragraph.firstChild, text);
  assert.equal(text.nodeValue, 'Hello world!');
  assert.equal(paragraph.querySelector('strong'), null);
  dom.window.close();
});

test('a changed block structure still rebuilds the changed block', () => {
  const dom = new JSDOM('<div id="host"></div>');
  const host = dom.window.document.getElementById('host');
  updateProseDom(host, '<p>Before</p><p>Keep</p>');
  const kept = host.querySelectorAll('p')[1];
  updateProseDom(host, '<ul><li>After</li></ul><p>Keep</p>');
  assert.equal(host.textContent, 'AfterKeep');
  assert.equal(host.querySelectorAll('p').length, 1);
  assert.equal(host.querySelector('p'), kept);
  dom.window.close();
});
