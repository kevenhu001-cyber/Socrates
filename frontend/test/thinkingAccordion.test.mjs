import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ThinkingAccordion } from '../src/react/tool-run/ThinkingAccordion.tsx';
import { en } from '../src/i18n/en.js';
import { zh } from '../src/i18n/zh.js';

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
  await act(() => root.render(createElement(ThinkingAccordion, { publicSummary: 'Public summary', isLive: true, ...props })));
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
