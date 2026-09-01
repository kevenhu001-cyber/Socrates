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
