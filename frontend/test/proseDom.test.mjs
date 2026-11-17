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
