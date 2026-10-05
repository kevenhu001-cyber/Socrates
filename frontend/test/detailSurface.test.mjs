import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openDetailSurface, closeDetailSurface } from '../src/ui/detailSurface.ts';
import { activateMainView } from '../src/ui/mainViewController.js';

function fixture(width = 1440) {
  const dom = new JSDOM('<html><body><div id="appShell"><button id="trigger">Open</button><aside id="sidebar"></aside><div id="topicSetup"></div><div id="sitesPanel" class="hidden"></div></div></body></html>');
  Object.defineProperty(dom.window, 'innerWidth', { value: width, configurable: true });
  const doc = dom.window.document;
  doc.getElementById('sidebar').getBoundingClientRect = () => ({ width: 260 });
  doc.getElementById('trigger').focus();
  return { dom, doc, options: (owner, onClose) => ({ owner, title: owner, closeLabel: 'Close', content: doc.createElement('div'), onClose }) };
}

test('replacement reuses one shell and stale cleanup cannot close the new owner', () => {
  const { doc, options } = fixture();
  let closed = 0;
  openDetailSurface(options('thinking', () => closed++), doc);
  const shell = doc.querySelector('.detail-surface');
  openDetailSurface(options('artifact'), doc);
  assert.equal(closed, 1);
  assert.equal(doc.querySelectorAll('.detail-surface').length, 1);
  assert.equal(doc.querySelector('.detail-surface'), shell);
  closeDetailSurface('thinking', doc);
  assert.equal(doc.documentElement.dataset.detailOpen, 'true');
  closeDetailSurface('artifact', doc);
  assert.equal(doc.activeElement.id, 'trigger');
});

test('modal layout makes the app inert and restores its prior state on close', () => {
  const { dom, doc, options } = fixture(1024);
  const app = doc.getElementById('appShell');
  app.inert = false;
  openDetailSurface(options('artifact'), doc);
  assert.equal(doc.documentElement.dataset.detailLayout, 'modal');
  assert.equal(app.inert, true);
  Object.defineProperty(dom.window, 'innerWidth', { value: 1440 });
  dom.window.dispatchEvent(new dom.window.Event('resize'));
  assert.equal(doc.documentElement.dataset.detailLayout, 'docked');
  assert.equal(app.inert, false);
  closeDetailSurface(undefined, doc);
  assert.equal(app.inert, false);
});

test('navigation closes the detail and a missing page leaves the current page intact', () => {
  const { doc, options } = fixture();
  activateMainView('topicSetup', doc);
  openDetailSurface(options('artifact'), doc);
  assert.equal(activateMainView('libraryPanel', doc), false);
  assert.equal(doc.documentElement.dataset.mainView, 'topicSetup');
  assert.equal(doc.documentElement.dataset.detailOpen, 'true');
  activateMainView('sitesPanel', doc);
  assert.equal(doc.documentElement.dataset.mainView, 'sitesPanel');
  assert.equal(doc.documentElement.dataset.detailOpen, undefined);
  assert.equal(doc.getElementById('topicSetup').classList.contains('hidden'), true);
});
