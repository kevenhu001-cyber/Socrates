import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installVisualizationMath } from '../src/render/visualizationMath.ts';

test('chart motion retains unchanged formulas; text changes and cleanup update only their labels', async () => {
  const dom = new JSDOM(
    '<div id="chart"><svg><g><text>$ct$</text><text>$xy$</text><path /></g></svg><p>$dt$</p></div>',
  );
  const previous = new Map();
  const frames = new Map();
  let sequence = 0;
  let renders = 0;
  for (const [name, value] of Object.entries({
    document: dom.window.document,
    Node: dom.window.Node,
    NodeFilter: dom.window.NodeFilter,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: (callback) => {
      frames.set(++sequence, callback);
      return sequence;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    katex: {
      renderToString: (source) => {
        renders++;
        return `<span class="katex">${source}</span>`;
      },
    },
  })) {
    previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  dom.window.SVGElement.prototype.getBBox = () => ({ x: 10, y: 10, width: 40, height: 20 });
  const flush = async () => {
    await Promise.resolve();
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback();
    await Promise.resolve();
  };
  let dispose;
  try {
    const host = document.getElementById('chart');
    dispose = installVisualizationMath(host);
    await flush();
    assert.equal(host.querySelectorAll('.katex').length, 3);
    assert.equal(renders, 3);
    const labels = [...host.querySelectorAll('foreignObject')];
    for (let i = 0; i < 20; i++) {
      host.querySelector('path').setAttribute('transform', `translate(${i},0)`);
      host.querySelector('g').setAttribute('transform', `translate(0,${i})`);
      await flush();
    }
    assert.deepEqual([...host.querySelectorAll('foreignObject')], labels);
    assert.equal(renders, 3, 'animated shapes do not typeset formulas again');
    host.querySelector('text').setAttribute('x', '100');
    await flush();
    assert.equal(renders, 3, 'geometry updates reuse typeset HTML');
    const untouched = host.querySelectorAll('foreignObject')[1];
    host.querySelector('text').textContent = '$ab$';
    await flush();
    assert.equal(renders, 4);
    assert.equal(host.querySelectorAll('foreignObject')[1], untouched);
    assert.equal(host.querySelector('foreignObject .katex').textContent, 'ab');
    dispose();
    dispose = undefined;
    assert.equal(host.querySelectorAll('foreignObject').length, 0);
    assert.equal(host.querySelector('text').style.opacity, '');
    assert.equal(frames.size, 0);
  } finally {
    dispose?.();
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    dom.window.close();
  }
});
