/**
 * tailReveal — the time-driven fade for the live streaming tail.
 *
 * The live tail's innerHTML is rebuilt by React on every frame, so any
 * per-glyph animation restarts on each commit unless it is anchored to the
 * wall-clock moment the glyph was revealed. These tests pin that contract:
 * a fade's elapsed time keeps growing across rebuilds, expires after the
 * window, and a shrinking tail (retry / block settling) resets the history.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  recordReveal,
  computeFadeSegments,
  applyTailFade,
} from '../src/render/tailReveal.ts';

const WINDOW = 250;

test('same text re-rendered later: fade age grows, never resets to 0', () => {
  let h = recordReveal([], 0, 0);
  h = recordReveal(h, 10, 100);
  const first = computeFadeSegments(h, 120, WINDOW);
  assert.deepEqual(first, [{ start: 0, end: 10, age: 20 }]);

  // Same length again (an unrelated re-render) must not append a new entry.
  const same = recordReveal(h, 10, 180);
  assert.equal(same.length, h.length);
  const later = computeFadeSegments(same, 180, WINDOW);
  assert.deepEqual(later, [{ start: 0, end: 10, age: 80 }]);
});

test('each reveal is its own segment with its own age', () => {
  let h = recordReveal([], 5, 0);
  h = recordReveal(h, 9, 100);
  h = recordReveal(h, 14, 200);
  assert.deepEqual(computeFadeSegments(h, 210, WINDOW), [
    { start: 5, end: 9, age: 110 },
    { start: 9, end: 14, age: 10 },
  ]);
});

test('segments older than the window are no longer wrapped', () => {
  let h = recordReveal([], 0, 0);
  h = recordReveal(h, 4, 10);
  h = recordReveal(h, 8, 300);
  const segs = computeFadeSegments(h, 320, WINDOW);
  assert.deepEqual(segs, [{ start: 4, end: 8, age: 20 }]);
  assert.deepEqual(computeFadeSegments(h, 10_000, WINDOW), []);
});

test('history stays bounded: expired entries are pruned', () => {
  let h = recordReveal([], 0, 0);
  for (let i = 1; i <= 200; i++) h = recordReveal(h, i, i * 16, WINDOW);
  assert.ok(h.length < 40, `history length ${h.length}`);
  // The newest segment is still exact after pruning.
  const segs = computeFadeSegments(h, 200 * 16, WINDOW);
  assert.equal(segs[segs.length - 1].end, 200);
});

test('a shrinking tail resets history; the surviving text is shown, not faded', () => {
  let h = recordReveal([], 0, 0);
  h = recordReveal(h, 40, 50);
  h = recordReveal(h, 12, 60); // block settled / retry → tail shorter
  assert.deepEqual(computeFadeSegments(h, 70, WINDOW), []);
  h = recordReveal(h, 15, 80);
  assert.deepEqual(computeFadeSegments(h, 90, WINDOW), [{ start: 12, end: 15, age: 10 }]);
});

test('text present at the very first record is never faded', () => {
  const h = recordReveal([], 30, 0);
  assert.deepEqual(computeFadeSegments(h, 1, WINDOW), []);
});

function dom(html) {
  const { window } = new JSDOM(`<!doctype html><body><div id="r">${html}</div></body>`);
  return { window, root: window.document.getElementById('r') };
}

test('applyTailFade wraps only the fading range of the last text node', () => {
  const { window, root } = dom('<p>Hello <strong>bold</strong> world tail</p>');
  // textContent: "Hello bold world tail" (21 chars). Fade the last 4 ("tail").
  applyTailFade(root, [{ start: 17, end: 21, age: 40 }], window.document);
  const spans = root.querySelectorAll('span.stream-fade');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].textContent, 'tail');
  assert.equal(spans[0].style.animationDelay, '-40ms');
  assert.equal(root.textContent, 'Hello bold world tail');
  // Earlier nodes untouched.
  assert.equal(root.querySelector('strong').innerHTML, 'bold');
});

test('applyTailFade clamps segments that start before the last text node', () => {
  const { window, root } = dom('<p>ab<em>cd</em>ef</p>');
  applyTailFade(root, [{ start: 1, end: 6, age: 5 }], window.document);
  const spans = [...root.querySelectorAll('span.stream-fade')];
  assert.equal(spans.map((s) => s.textContent).join(''), 'ef');
  assert.equal(root.querySelector('em').textContent, 'cd');
});

test('applyTailFade never touches code or math', () => {
  const { window, root } = dom('<p>see <code>x+1</code></p>');
  applyTailFade(root, [{ start: 0, end: 7, age: 5 }], window.document);
  assert.equal(root.querySelectorAll('span.stream-fade').length, 0);
  const { window: w2, root: r2 } = dom('<p>a <span class="katex">yz</span></p>');
  applyTailFade(r2, [{ start: 0, end: 4, age: 5 }], w2.document);
  assert.equal(r2.querySelectorAll('span.stream-fade').length, 0);
});

test('multiple segments become multiple spans with their own delays', () => {
  const { window, root } = dom('<p>abcdef</p>');
  applyTailFade(root, [{ start: 2, end: 4, age: 100 }, { start: 4, end: 6, age: 10 }], window.document);
  const spans = [...root.querySelectorAll('span.stream-fade')];
  assert.deepEqual(spans.map((s) => [s.textContent, s.style.animationDelay]), [
    ['cd', '-100ms'],
    ['ef', '-10ms'],
  ]);
  assert.equal(root.textContent, 'abcdef');
});
