import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

/* P_mermaid-viewport-gate — a queued mermaid diagram is held until its
   card nears the viewport, so opening a long history no longer pays one
   synchronous mermaid.parse+layout for every diagram in the session.

   The gate is decided from the card's rect, so it is testable by driving
   getBoundingClientRect; the observer is only a wake-up mechanism and its
   absence must never strand a card. */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

/* Pretend the browser supports IntersectionObserver — the gate's "should I
   defer this?" branch is only reachable when it does. */
class FakeObserver {
  constructor(cb, opts) { this.cb = cb; this.opts = opts; this.targets = new Set(); }
  observe(el) { this.targets.add(el); }
  unobserve(el) { this.targets.delete(el); }
  disconnect() { this.targets.clear(); }
  /* Drive the wake-up the real browser would fire. */
  fireIntersecting(el) { this.cb([{ target: el, isIntersecting: true }], this); }
}
let lastObserver = null;
globalThis.IntersectionObserver = function (cb, opts) {
  lastObserver = new FakeObserver(cb, opts);
  return lastObserver;
};

const {
  mermaidCardIsNearViewportForTest,
  resetMermaidGateForTest,
} = await import('../src/render/viz.js');

const MARGIN = 600;

function makeCard(id, rect) {
  const card = document.createElement('div');
  card.className = 'viz';
  card.id = id;
  card.setAttribute('data-viz-state', 'loading');
  const body = document.createElement('div');
  body.className = 'viz-body';
  card.appendChild(body);
  document.body.appendChild(card);
  if (rect) card.getBoundingClientRect = () => rect;
  return card;
}

/* jsdom reports innerHeight 0 by default; the gate reads it as the
   viewport height, so pin a realistic one for these cases. */
function setViewportHeight(px) {
  Object.defineProperty(dom.window, 'innerHeight', { value: px, configurable: true, writable: true });
}

test.beforeEach(() => {
  resetMermaidGateForTest();
  document.body.innerHTML = '';
  lastObserver = null;
  setViewportHeight(800);
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

test('a card inside the viewport renders now', () => {
  const card = makeCard('in-view', { top: 100, bottom: 300, width: 600, height: 200 });
  assert.equal(mermaidCardIsNearViewportForTest(card), true);
});

test('a card far below the viewport is held', () => {
  const card = makeCard('below', { top: 9000, bottom: 9200, width: 600, height: 200 });
  assert.equal(mermaidCardIsNearViewportForTest(card), false);
});

test('a card far above the viewport is held', () => {
  const card = makeCard('above', { top: -9000, bottom: -8800, width: 600, height: 200 });
  assert.equal(mermaidCardIsNearViewportForTest(card), false);
});

test('a card just outside the viewport still renders (margin pre-warm)', () => {
  /* Sitting 400px below an 800px viewport: within the 600px margin, so it
     is rendered before the user scrolls to it — the point of the margin. */
  const card = makeCard('near-miss', { top: 1000, bottom: 1200, width: 600, height: 200 });
  assert.equal(mermaidCardIsNearViewportForTest(card), true);
});

test('a zero-size (unlaid-out) card is never held — it would strand', () => {
  /* display:none ancestor / detached element: the observer will not report
     it again, so holding it would leave the diagram permanently blank. */
  const card = makeCard('unlaid', { top: 0, bottom: 0, width: 0, height: 0 });
  assert.equal(mermaidCardIsNearViewportForTest(card), true);
});

test('a hidden tab renders rather than holding the whole backlog', () => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  const card = makeCard('offscreen-hidden-tab', { top: 9000, bottom: 9200, width: 600, height: 200 });
  assert.equal(mermaidCardIsNearViewportForTest(card), true);
});

test('without IntersectionObserver support everything renders (no stranding)', () => {
  const saved = globalThis.IntersectionObserver;
  delete globalThis.IntersectionObserver;
  try {
    const card = makeCard('no-io', { top: 9000, bottom: 9200, width: 600, height: 200 });
    assert.equal(mermaidCardIsNearViewportForTest(card), true);
  } finally {
    globalThis.IntersectionObserver = saved;
  }
});

test('an element whose rect throws renders rather than throwing out of the drain', () => {
  const card = makeCard('throws', null);
  card.getBoundingClientRect = () => { throw new Error('detached'); };
  assert.equal(mermaidCardIsNearViewportForTest(card), true);
});
