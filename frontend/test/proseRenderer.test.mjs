import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useProseRenderer, __resetSharedProseCache } from '../src/react/tool-run/proseRenderer.ts';
import { resetBridgeCache } from '../src/react/legacy/gateway.ts';
import { bumpMathRenderRevision, getMathRenderRevision } from '../src/render/mathRevision.ts';

test('math revisions invalidate prose caches while matching revisions share finalized HTML', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' });
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let paints = 0;
  window.__socratesLegacy = { render: { renderAssistantHTML: text => {
    paints += 1;
    return `<p data-math-revision="${getMathRenderRevision()}">${text}</p>`;
  } } };
  resetBridgeCache();
  __resetSharedProseCache();
  const initialRevision = getMathRenderRevision();
  let prose;
  function Harness() { prose = useProseRenderer(false); return null; }
  let root = createRoot(document.getElementById('root'));
  const render = revision => act(() => root.render(createElement(Harness, { revision })));
  try {
    await render(0);
    const initialRenderer = prose;
    const initial = prose.settled('Formula $x$.');
    assert.equal(prose.settled('Formula $x$.'), initial);
    assert.match(initial.__html, new RegExp(`data-math-revision="${initialRevision}"`));
    assert.equal(paints, 1);

    const nextRevision = bumpMathRenderRevision();
    await render(1);
    assert.notEqual(prose, initialRenderer);
    const updated = prose.settled('Formula $x$.');
    assert.notEqual(updated, initial);
    assert.match(updated.__html, new RegExp(`data-math-revision="${nextRevision}"`));
    assert.equal(paints, 2);

    await act(() => root.unmount());
    root = createRoot(document.getElementById('root'));
    await render(2);
    assert.equal(prose.settled('Formula $x$.'), updated);
    assert.equal(paints, 2);
  } finally {
    await act(() => root.unmount());
    __resetSharedProseCache();
    resetBridgeCache();
    dom.window.close();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
  }
});
