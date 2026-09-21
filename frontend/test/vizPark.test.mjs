import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

/* Off-screen parking (P_viz-park): a ready card's iframe is navigated
   to about:blank to release its document; re-entering the viewport
   restores data-srcdoc and re-runs the viz-ready handshake. */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { parkVizCardForTest, unparkVizCardForTest } = await import('../src/render/viz.js');

function makeCard(state = 'ready') {
  const card = document.createElement('div');
  card.className = 'viz';
  card.id = 'viz-card-test-' + Math.random().toString(36).slice(2);
  card.setAttribute('data-viz-state', state);
  const body = document.createElement('div');
  body.className = 'viz-body';
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-srcdoc', '<div>hi</div>');
  iframe.setAttribute('srcdoc', '<div>hi</div>');
  body.appendChild(iframe);
  card.appendChild(body);
  document.body.appendChild(card);
  return card;
}

test('a ready offscreen card is parked: srcdoc dropped, data kept', () => {
  const card = makeCard('ready');
  const iframe = card.querySelector('iframe');
  parkVizCardForTest(card);
  assert.equal(card.getAttribute('data-viz-parked'), '1');
  assert.equal(iframe.getAttribute('srcdoc'), null);
  assert.equal(iframe.getAttribute('data-srcdoc'), '<div>hi</div>');
});

test('unpark restores srcdoc and re-enters the loading handshake', () => {
  const card = makeCard('ready');
  const iframe = card.querySelector('iframe');
  parkVizCardForTest(card);
  unparkVizCardForTest(card);
  assert.equal(card.getAttribute('data-viz-parked'), null);
  assert.equal(card.getAttribute('data-viz-state'), 'loading');
  assert.equal(iframe.getAttribute('srcdoc'), '<div>hi</div>');
});

test('parking guards: only ready, connected, un-parked cards qualify', () => {
  const loading = makeCard('loading');
  parkVizCardForTest(loading);
  assert.equal(loading.getAttribute('data-viz-parked'), null);

  const ready = makeCard('ready');
  parkVizCardForTest(ready);
  const iframe = ready.querySelector('iframe');
  iframe.setAttribute('srcdoc', 'changed-by-park-check');
  parkVizCardForTest(ready); // already parked — must not clobber
  assert.equal(iframe.getAttribute('srcdoc'), 'changed-by-park-check');

  const detached = makeCard('ready');
  detached.remove();
  parkVizCardForTest(detached);
  assert.equal(detached.getAttribute('data-viz-parked'), null);
});
