import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { TurnActivitySurface } from '../src/react/tool-run/TurnActivitySurface.tsx';
import { en } from '../src/i18n/en.ts';
import { zh } from '../src/i18n/zh.ts';

let dom;
let root;
let container;
let lang;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  dom = new JSDOM('<!doctype html><body><div id="root"></div></body>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  lang = 'en';
  window.t = (key) => ({ en, zh })[lang][key] || key;
  container = document.getElementById('root');
  root = createRoot(container);
});

afterEach(async () => {
  await act(() => root.unmount());
  dom.window.close();
});

async function render(props = {}) {
  await act(() => root.render(createElement(TurnActivitySurface, { publicSummary: 'Public summary', isLive: true, ...props })));
}
const toggle = () => container.querySelector('.thinking-accordion-toggle');

test('live disclosure preserves user intent across text updates and completion', async () => {
  await render();
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
  const bodyId = toggle().getAttribute('aria-controls');
  assert.equal(document.getElementById(bodyId).getAttribute('aria-hidden'), 'true');
  await act(() => toggle().click());
  await render({ publicSummary: 'Updated public summary' });
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  assert.equal(toggle().getAttribute('aria-controls'), bodyId);
  await act(() => toggle().click());
  await render({ isLive: false });
  assert.equal(toggle().getAttribute('aria-expanded'), 'false');
  await act(() => toggle().click());
  await render({ isLive: false, publicSummary: 'Complete summary' });
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
});

test('language changes update a mounted disclosure without resetting expansion', async () => {
  await render();
  await act(() => toggle().click());
  await act(() => {
    lang = 'zh';
    document.dispatchEvent(new window.Event('socrates:langchange'));
  });
  assert.match(toggle().textContent, /正在思考/);
  assert.equal(container.querySelector('.thinking-copy-quote-btn'), null);
  assert.equal(toggle().getAttribute('aria-expanded'), 'true');
  await render({ isLive: false });
  assert.match(toggle().textContent, /思路总结/);
});

test('settled disclosure renders only the explicit public summary', async () => {
  await render({ isLive: false, publicSummary: 'A concise public summary.' });
  await act(() => toggle().click());
  assert.equal(container.querySelector('.thinking-accordion-text').textContent, 'A concise public summary.');
  assert.doesNotMatch(container.textContent, /private reasoning|internal draft/i);
});

test('settled disclosure without a public summary is hidden', async () => {
  await render({ isLive: false, publicSummary: '' });
  assert.equal(container.querySelector('.thinking-accordion'), null);
});

test('live chrome never fabricates summary content or repeats tool activity', async () => {
  await render({ publicSummary: '', activities: [{ id: 'search', kind: 'tool', phase: 'running', startedAt: 0, toolName: 'web_search' }] });
  assert.equal(container.querySelector('.thinking-accordion-text'), null);
  assert.equal(toggle().disabled, true);
  await render({ publicSummary: 'Compared publication dates.', activities: [
    { id: 'search', kind: 'tool', phase: 'running', startedAt: 0, toolName: 'web_search' },
    { id: 'summary', kind: 'reasoning_summary', phase: 'running', startedAt: 0, text: 'Compared publication dates.' },
  ], showActivityCue: false });
  await act(() => toggle().click());
  assert.equal(container.querySelectorAll('[role="listitem"]').length, 1);
  assert.doesNotMatch(container.textContent, /Searching|In progress|Reviewing your question|Response ready/);
  assert.equal(container.querySelector('[data-live="true"]'), null);
});

test('summary list stays concise and localizes the observed thought duration', async () => {
  const activities = Array.from({ length: 8 }, (_, i) => ({ id: `summary-${i}`, kind: 'reasoning_summary', phase: 'done', startedAt: i, text: `Finding ${i}` }));
  await render({ activities: [...activities, { ...activities[7], id: 'duplicate' }], isLive: false, elapsedSec: 12.3 });
  assert.equal(container.querySelectorAll('[role="listitem"]').length, 5);
  assert.match(toggle().textContent, /Thought for 12s/);
  await act(() => { lang = 'zh'; document.dispatchEvent(new window.Event('socrates:langchange')); });
  assert.match(toggle().textContent, /思考了 12 秒/);
});
