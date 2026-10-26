import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  configureMountRegistry,
  hostIsMountedBy,
  mountRegistry,
  runMountRegistry,
} from '../src/react/lib/boot/registry.ts';

test('mount registry owns host markers and is idempotent', () => {
  const dom = new JSDOM('<!doctype html><div id="primary"></div>');
  const { document } = dom.window;
  let mounts = 0;
  const specs = [
    { hostId: 'primary', label: 'primary-root', mount: () => { mounts += 1; } },
    {
      hostId: 'lazy',
      label: 'lazy-root',
      ensureHost(doc) {
        const host = doc.createElement('div');
        host.id = 'lazy';
        doc.body.appendChild(host);
        return host;
      },
      mount: () => { mounts += 1; },
    },
    { hostId: 'missing', label: 'missing-root', mount: () => { mounts += 1; } },
  ];
  configureMountRegistry(specs);

  const first = runMountRegistry(document);
  assert.equal(first.mounted.length, 2);
  assert.equal(first.skipped.length, 1);
  assert.equal(mounts, 2);
  assert.equal(hostIsMountedBy(document, 'primary', 'primary-root'), true);
  assert.equal(hostIsMountedBy(document, 'lazy', 'lazy-root'), true);

  const second = runMountRegistry(document);
  assert.equal(second.mounted.length, 0);
  assert.equal(second.skipped.length, 3);
  assert.equal(mounts, 2, 'owned hosts do not mount twice');
});

test('mount registry replaces specs and preserves intentional legacy ownership', () => {
  const dom = new JSDOM('<!doctype html><div id="legacy"></div>');
  const { document } = dom.window;
  const spec = { hostId: 'legacy', label: 'react-root', mount: () => false };
  configureMountRegistry([spec]);

  const result = runMountRegistry(document);

  assert.equal(mountRegistry.length, 1, 'configuration replaces prior specs');
  assert.equal(result.mounted.length, 0);
  assert.deepEqual(result.skipped, [spec]);
  assert.equal(document.getElementById('legacy').dataset.mountedBy, undefined);
});

test('mount registry label filters skip lazy hosts until the full pass', () => {
  const dom = new JSDOM('<!doctype html><div id="light"></div>');
  const { document } = dom.window;
  let mounts = 0;
  configureMountRegistry([
    { hostId: 'light', label: 'light', mount: () => { mounts += 1; } },
    {
      hostId: 'lazy',
      label: 'heavy',
      ensureHost(doc) {
        const host = doc.createElement('div');
        host.id = 'lazy';
        doc.body.appendChild(host);
        return host;
      },
      mount: () => { mounts += 1; },
    },
  ]);

  const shellPass = runMountRegistry(document, { labels: new Set(['light']) });
  assert.equal(shellPass.mounted.length, 1);
  assert.equal(document.getElementById('lazy'), null, 'filtered lazy hosts stay uncreated');
  assert.equal(mounts, 1);

  const fullPass = runMountRegistry(document);
  assert.equal(fullPass.mounted.length, 1);
  assert.equal(mounts, 2);
});

test('lazy mounts reserve hosts, deduplicate boot passes and release failures for retry', async () => {
  const { document } = new JSDOM('<!doctype html><div id="lazy"></div><div id="next"></div>').window;
  let reject;
  let attempts = 0;
  let nextMounts = 0;
  const error = new Error('chunk unavailable');
  const spec = { hostId: 'lazy', label: 'lazy-root', mount: () => {
    attempts++;
    return attempts === 1 ? new Promise((_, fail) => { reject = fail; }) : Promise.resolve();
  } };
  configureMountRegistry([spec, { hostId: 'next', label: 'next', mount: () => { nextMounts++; } }]);
  const first = runMountRegistry(document);
  assert.equal(first.pending.length, 1);
  assert.equal(hostIsMountedBy(document, 'lazy', 'lazy-root'), true, 'legacy writers are excluded during loading');
  runMountRegistry(document);
  assert.equal(attempts, 1);
  reject(error);
  await Promise.all(first.pending);
  assert.deepEqual(first.failed, [{ spec, error }]);
  assert.equal(hostIsMountedBy(document, 'lazy', 'lazy-root'), false);
  assert.equal(nextMounts, 1, 'other surfaces still mount');
  const retry = runMountRegistry(document);
  await Promise.all(retry.pending);
  assert.equal(attempts, 2);
  assert.deepEqual(retry.mounted, [spec]);
  assert.equal(hostIsMountedBy(document, 'lazy', 'lazy-root'), true);
});

test('synchronous failures and asynchronous opt-outs preserve legacy ownership', async () => {
  const { document } = new JSDOM('<!doctype html><div id="broken"></div><div id="share"></div>').window;
  const error = new Error('bridge install failed');
  configureMountRegistry([
    { hostId: 'broken', label: 'broken', mount: () => { throw error; } },
    { hostId: 'share', label: 'msg-list', mount: () => Promise.resolve(false) },
  ]);
  const result = runMountRegistry(document);
  await Promise.all(result.pending);
  assert.equal(result.failed[0].error, error);
  assert.equal(result.skipped.length, 1);
  assert.equal(hostIsMountedBy(document, 'broken', 'broken'), false);
  assert.equal(hostIsMountedBy(document, 'share', 'msg-list'), false);
});
