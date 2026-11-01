import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { disposeVisualization, disposeVisualizations, mountVisualization } from '../src/render/visualization.ts';
import { getCurrentLanguage, setCurrentLanguage } from '../src/i18n/languageState.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.XMLSerializer = dom.window.XMLSerializer;
globalThis.getComputedStyle = dom.window.getComputedStyle;
const spec = {
  version: 1, template: 'geometry', title: 'A circle', accessibilitySummary: 'A unit circle.',
  payload: { shapes: [{ type: 'circle', center: [0, 0], radius: 1, label: 'Unit circle' }] },
};

const initialLanguage = getCurrentLanguage();
beforeEach(() => {
  document.body.replaceChildren();
  delete window.renderMathInElement;
  setCurrentLanguage(initialLanguage);
});
afterEach(() => disposeVisualizations(document.body));

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return mountVisualization(spec, host);
}

test('static SVG cards expose data and export, with no inert reset control', async (context) => {
  const downloads = [];
  context.mock.method(dom.window.HTMLAnchorElement.prototype, 'click', function () {
    downloads.push({ url: this.href, name: this.download });
  });
  const card = await mount();
  assert.ok(card.querySelector('svg'));
  assert.equal(card.querySelector('[data-viz-action="reset"]').hidden, true);
  assert.equal(card.querySelector('[data-viz-action="reset"]').getAttribute('aria-hidden'), 'true');
  const table = card.querySelector('.visualization-data');
  card.querySelector('[data-viz-action="table"]').click();
  assert.equal(table.hidden, false);
  card.querySelector('[data-viz-action="download"]').click();
  await Promise.resolve();
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, 'A-circle.svg');
  assert.match(downloads[0].url, /^data:image\/svg\+xml/);
});

test('cleanup failure is reported once and does not block card removal', async (context) => {
  const diagnostics = [];
  context.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  const card = await mount();
  let cleanups = 0;
  card._visualizationCleanup = () => { cleanups += 1; throw new Error('Cleanup failed'); };
  disposeVisualization(card);
  disposeVisualization(card);
  assert.equal(cleanups, 1);
  assert.equal(card.isConnected, false);
  assert.deepEqual(diagnostics.map((entry) => entry[1]), ['visualization.cleanupCard']);
});

test('math enhancement failure preserves the SVG and its action controls', async (context) => {
  const diagnostics = [];
  context.mock.method(console, 'warn', (...args) => diagnostics.push(args));
  /* renderCardMath reads the KaTeX auto-render hook from `window`, which in
     this test is the JSDOM window rather than Node's globalThis. */
  window.renderMathInElement = () => { throw new Error('Math renderer failed'); };
  const card = await mount();
  assert.ok(card.querySelector('svg'));
  assert.equal(card.querySelector('[data-viz-action="download"]').hidden, false);
  assert.deepEqual(diagnostics.map((entry) => entry[1]), ['visualization.renderCardMath']);
});

test('action labels follow the active locale through the imported translator', async () => {
  /* The card used to read a global window.t that tests could replace; it now
     imports `t` from i18n.ts and only falls back to English when a key is
     missing, so the locale itself decides the label. */
  setCurrentLanguage('en');
  let card = await mount();
  assert.equal(card.querySelector('[data-viz-action="download"]').textContent, 'Download PNG');
  disposeVisualizations(document.body);
  document.body.replaceChildren();
  setCurrentLanguage('zh');
  card = await mount();
  assert.equal(card.querySelector('[data-viz-action="download"]').textContent, '下载 PNG');
});
