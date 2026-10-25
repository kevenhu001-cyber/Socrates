import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveTextSegment } from '../src/react/tool-run/LiveTextSegment.tsx';

test('tail promotion retains paragraph, selection and code DOM through completion', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // This test checks reconciliation, independent of animation timing.
  dom.window.__socratesSmoothStream = false;
  dom.window.__socratesLegacy = { postRender: {} };
  const host = document.getElementById('root');
  const root = createRoot(host);
  const paint = text => ({ __html: marked.parse(text) });
  const render = (text, live = true) => act(() => root.render(createElement(LiveTextSegment, { text, live, settled: paint, tail: paint })));
  try {
    await render('First paragraph.');
    const paragraph = host.querySelector('p');
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection().addRange(range);
    await render('First paragraph.\n\nSecond paragraph.');
    assert.equal(host.querySelector('p'), paragraph);
    assert.equal(window.getSelection().toString(), 'First paragraph.');
    const source = 'First paragraph.\n\nSecond paragraph.\n\n```js\nconst value = 1;\n```';
    await render(source);
    const code = host.querySelector('pre');
    code.dataset.localState = 'preserved';
    await render(source + '\n\nLast paragraph.');
    assert.equal(host.querySelector('pre'), code);
    assert.equal(code.dataset.localState, 'preserved');
    await render(source + '\n\nLast paragraph.\n\n', false);
    assert.equal(host.querySelector('p'), paragraph);
    assert.equal(host.querySelector('pre'), code);
    assert.equal(host.querySelectorAll('.is-live').length, 0);
    assert.equal(host.querySelector('[data-prose-last] p').textContent, 'Last paragraph.');
    // Replaced/truncated input must still rebuild the correct content.
    await render('Replacement.');
    assert.equal(host.textContent, 'Replacement.\n');
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    globalThis.IS_REACT_ACT_ENVIRONMENT = originalAct;
  }
});
