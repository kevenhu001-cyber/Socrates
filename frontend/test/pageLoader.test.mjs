import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { loadPage } from '../src/react/lib/boot/pageLoader.ts';

async function inPage(run) {
  const previous = globalThis.document;
  const dom = new JSDOM('<!doctype html><div id="page"></div>');
  globalThis.document = dom.window.document;
  try { await run(dom.window.document); }
  finally { globalThis.document = previous; dom.window.close(); }
}

test('page loading coalesces concurrent imports and notifies every navigation caller', async () => inPage(async (document) => {
  let resolve, imports = 0, mounts = 0, notifications = 0;
  const load = () => { imports++; return new Promise((done) => { resolve = done; }); };
  const first = loadPage('page', load, () => { notifications++; });
  const second = loadPage('page', load, () => { notifications++; });
  await Promise.resolve();
  assert.equal(imports, 1);
  assert.equal(document.getElementById('page').getAttribute('aria-busy'), 'true');
  resolve((host) => { mounts++; host.textContent = 'Ready'; });
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(mounts, 1);
  assert.equal(notifications, 2);
  assert.equal(document.getElementById('page').hasAttribute('aria-busy'), false);
}));

test('late page imports cannot mount into a replacement node with the same id', async () => inPage(async (document) => {
  let resolve, obsoleteMounts = 0;
  const original = document.getElementById('page');
  const oldLoad = loadPage('page', () => new Promise((done) => { resolve = done; }));
  await Promise.resolve();
  const replacement = document.createElement('div');
  replacement.id = 'page';
  original.replaceWith(replacement);
  assert.equal(await loadPage('page', async () => (host) => { host.textContent = 'Replacement'; }), true);
  resolve(() => { obsoleteMounts++; });
  assert.equal(await oldLoad, false);
  assert.equal(obsoleteMounts, 0);
  assert.equal(replacement.textContent, 'Replacement');
}));

test('failed imports retry and late navigation failures preserve a mounted page', async () => inPage(async (document) => {
  assert.equal(await loadPage('page', async () => { throw new Error('offline'); }), false);
  assert.match(document.getElementById('page').textContent, /Could not load/);
  assert.equal(await loadPage('page', async () => (host) => { host.innerHTML = '<button>Keep me</button>'; }), true);
  const button = document.querySelector('button');
  assert.equal(await loadPage('page', async () => { throw new Error('navigation failed'); }), false);
  assert.equal(document.querySelector('button'), button, 'React-owned contents are never overwritten');
  assert.equal(await loadPage('page', async () => () => {}, () => { throw new Error('refresh failed'); }), false);
  assert.equal(document.querySelector('button'), button);
}));
