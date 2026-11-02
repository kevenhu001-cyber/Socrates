import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  configureMountRegistry,
  hostIsMountedBy,
  markHostMountedBy,
  mountRegistry,
  runMountRegistry,
} from '../src/react/lib/boot/registry.ts';
import { showMountRecovery } from '../src/react/ui/mountRecovery.ts';

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

test('local recovery preserves content and retries only the failed surface', () => {
  const { document } = new JSDOM('<!doctype html><div id="composer"><textarea>Saved draft</textarea></div><div id="other"></div>').window;
  const host = document.getElementById('composer');
  const draft = host.firstChild;
  let attempts = 0;
  let otherAttempts = 0;
  configureMountRegistry([
    { hostId: 'composer', label: 'composer', mount: () => {
      if (++attempts < 3) throw new Error('offline');
    } },
    { hostId: 'other', label: 'other', mount: () => { otherAttempts++; return false; } },
  ]);
  const result = runMountRegistry(document, {
    onFailure: (failure) => showMountRecovery(failure, 'Editor unavailable', 'Try again', 'boot.composerUnavailable'),
  });
  assert.equal(result.failed.length, 1);
  const status = host.querySelector('[role="status"]');
  const firstButton = host.querySelector('button');
  assert.equal(firstButton.type, 'button');
  assert.equal(firstButton.getAttribute('aria-describedby'), status.id);
  assert.equal(firstButton.dataset.slot, 'button');
  assert.equal(status.dataset.i18nKey, 'boot.composerUnavailable');
  assert.equal(firstButton.dataset.i18nKey, 'error.retry');
  firstButton.click();
  assert.equal(attempts, 2);
  assert.equal(host.querySelectorAll('[data-mount-recovery]').length, 1, 'failed retries replace only the recovery notice');
  firstButton.click();
  assert.equal(attempts, 2, 'retired controls release their listeners');
  host.querySelector('button').click();
  assert.equal(attempts, 3);
  assert.equal(otherAttempts, 1, 'a retry does not re-run unrelated opted-out specs');
  assert.equal(host.querySelector('[data-mount-recovery]'), null);
  assert.equal(host.firstChild, draft, 'the draft node is never replaced');
  assert.equal(draft.value, 'Saved draft');
});

test('pending retries are deduplicated and dispose recovery after settling', async () => {
  const { document } = new JSDOM('<!doctype html><div id="lazy"></div>').window;
  let finish;
  let failure;
  let attempts = 0;
  configureMountRegistry([{ hostId: 'lazy', label: 'lazy', mount: () => {
    if (++attempts === 1) throw new Error('offline');
    return new Promise((resolve) => { finish = resolve; });
  } }]);
  const options = { onFailure: (value) => {
    failure = value;
    return showMountRecovery(value, 'Unavailable', 'Try again', 'boot.headerUnavailable');
  } };
  runMountRegistry(document, options);
  const retry = failure.retry();
  assert.equal(failure.retry(), undefined, 'an in-flight retry retains its reservation');
  assert.equal(attempts, 2);
  assert.equal(document.querySelectorAll('[data-mount-recovery]').length, 1);
  runMountRegistry(document, options);
  assert.equal(attempts, 2);
  finish();
  await Promise.all(retry.pending);
  assert.equal(document.querySelector('[data-mount-recovery]'), null);
});

test('late failures and obsolete retry controls cannot affect replacement hosts', async () => {
  const { document } = new JSDOM('<!doctype html><div id="lazy"></div>').window;
  let reject;
  let failure;
  let notices = 0;
  let attempts = 0;
  const spec = { hostId: 'lazy', label: 'lazy', mount: () => {
    attempts++;
    return new Promise((_, fail) => { reject = fail; });
  } };
  const options = { onFailure: (value) => { failure = value; notices++; } };
  configureMountRegistry([spec]);
  const first = runMountRegistry(document, options);
  const oldHost = document.getElementById('lazy');
  const replacement = document.createElement('div');
  replacement.id = 'lazy';
  replacement.textContent = 'Replacement content';
  oldHost.replaceWith(replacement);
  markHostMountedBy(replacement, 'replacement');
  reject(new Error('late failure'));
  await Promise.all(first.pending);
  assert.equal(notices, 0, 'detached hosts cannot publish recovery UI');
  assert.equal(hostIsMountedBy(document, 'lazy', 'replacement'), true);
  assert.equal(replacement.textContent, 'Replacement content');

  replacement.remove();
  document.body.append(oldHost);
  const second = runMountRegistry(document, options);
  reject(new Error('current failure'));
  await Promise.all(second.pending);
  assert.equal(notices, 1);
  oldHost.replaceWith(replacement);
  assert.equal(failure.retry(), undefined);
  assert.equal(attempts, 2);
});

test('recovery observers cannot interrupt other mounts or release a new owner', async () => {
  const { document } = new JSDOM('<!doctype html><div id="failed"></div><div id="next"></div>').window;
  let nextMounts = 0;
  configureMountRegistry([
    { hostId: 'failed', label: 'failed', mount: () => { throw new Error('offline'); } },
    { hostId: 'next', label: 'next', mount: () => { nextMounts++; } },
  ]);
  const result = runMountRegistry(document, { onFailure: () => { throw new Error('recovery failed'); } });
  assert.equal(result.failed.length, 1);
  assert.equal(nextMounts, 1);

  const host = document.createElement('div');
  host.id = 'takeover';
  document.body.append(host);
  let reject;
  configureMountRegistry([{ hostId: 'takeover', label: 'old', mount: () => new Promise((_, fail) => { reject = fail; }) }]);
  let recoveryCalls = 0;
  const pending = runMountRegistry(document, { onFailure: () => { recoveryCalls++; } });
  markHostMountedBy(host, 'new-owner');
  reject(new Error('obsolete mount'));
  await Promise.all(pending.pending);
  assert.equal(recoveryCalls, 0);
  assert.equal(hostIsMountedBy(document, 'takeover', 'new-owner'), true);
});

test('an intentional opt-out clears recovery without claiming the legacy host', async () => {
  const { document } = new JSDOM('<!doctype html><div id="share"></div>').window;
  let attempts = 0;
  let failure;
  configureMountRegistry([{ hostId: 'share', label: 'share', mount: () => {
    if (++attempts === 1) throw new Error('offline');
    return Promise.resolve(false);
  } }]);
  runMountRegistry(document, { onFailure: (value) => {
    failure = value;
    return showMountRecovery(value, 'Unavailable', 'Try again', 'boot.messagesUnavailable');
  } });
  const retry = failure.retry();
  await Promise.all(retry.pending);
  assert.equal(document.querySelector('[data-mount-recovery]'), null);
  assert.equal(hostIsMountedBy(document, 'share', 'share'), false);
});

test('a retired spec cannot be retried after registry reconfiguration', () => {
  const { document } = new JSDOM('<!doctype html><div id="page"></div>').window;
  let failure;
  let attempts = 0;
  configureMountRegistry([{ hostId: 'page', label: 'old', mount: () => {
    attempts++;
    throw new Error('offline');
  } }]);
  runMountRegistry(document, { onFailure: (value) => { failure = value; } });
  configureMountRegistry([{ hostId: 'page', label: 'new', mount: () => undefined }]);
  assert.equal(failure.retry(), undefined);
  assert.equal(attempts, 1);
  runMountRegistry(document);
  assert.equal(hostIsMountedBy(document, 'page', 'new'), true);
});
