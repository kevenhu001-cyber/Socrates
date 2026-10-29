import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { mountOwnedRoot } from '../src/react/lib/boot/ownedRoot.ts';
import { hostIsMounted, markHostMountedBy } from '../src/react/lib/boot/ownership.ts';

// Exercise real React roots: duplicate roots and stale cleanup are runtime bugs.
test('owned roots reuse hosts, isolate replacements and ignore stale destroy handles', async () => {
  const dom = new JSDOM('<!doctype html><div id="overlay"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const handles = [];
  try {
    const host = document.getElementById('overlay');
    let installs = 0;
    const mount = (node) => {
      const handle = mountOwnedRoot(node, 'overlay', createElement('button', null, 'Open'), () => installs++);
      handles.push(handle);
      return handle;
    };
    // Boot reservations must not suppress the actual root mount.
    markHostMountedBy(host, 'overlay');
    let first;
    await act(() => { first = mount(host); });
    assert.equal(host.textContent, 'Open');
    assert.equal(mount(host), first);
    assert.equal(installs, 1);
    assert.throws(() => mountOwnedRoot(host, 'other', null), /another surface/);

    const replacement = document.createElement('div');
    replacement.id = host.id;
    host.replaceWith(replacement);
    let second;
    await act(() => { second = mount(replacement); });
    assert.notEqual(second.root, first.root);
    await act(() => first.destroy());
    assert.equal(hostIsMounted(host), false);
    assert.equal(hostIsMounted(replacement), true);
    assert.equal(replacement.textContent, 'Open');

    await act(() => second.destroy());
    assert.equal(hostIsMounted(replacement), false);
    let third;
    await act(() => { third = mount(replacement); });
    second.destroy();
    assert.equal(hostIsMounted(replacement), true);
    assert.equal(replacement.textContent, 'Open');
    assert.notEqual(third.root, second.root);
  } finally {
    await act(() => handles.forEach((handle) => handle.destroy()));
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('feature root slots update the current host and release it on host replacement', async () => {
  const { createRootSlot } = await import('../src/react/lib/boot/ownedRoot.ts');
  const dom = new JSDOM('<!doctype html><div id="root"></div><div id="portal"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const slot = createRootSlot('page');
  let cleanupCount = 0;
  try {
    const first = document.getElementById('root');
    const portal = document.getElementById('portal');
    let firstHandle;
    await act(() => { firstHandle = slot.mount(first, createElement(Fragment, null, createElement('button', null, 'First'),
      createPortal(createElement('button', null, 'Portaled'), portal)), () => () => cleanupCount++); });
    assert.equal(portal.textContent, 'Portaled');
    let updatedHandle;
    await act(() => { updatedHandle = slot.mount(first, createElement('button', null, 'Updated')); });
    assert.equal(updatedHandle, firstHandle);
    assert.equal(first.textContent, 'Updated');
    assert.equal(portal.textContent, '', 'updating removes obsolete portals');
    const second = document.createElement('div');
    second.id = first.id;
    first.replaceWith(second);
    await act(() => { slot.mount(second, createElement('button', null, 'Second')); });
    assert.equal(first.textContent, '');
    assert.equal(portal.textContent, '', 'replacing the main host also removes its old portals');
    assert.equal(hostIsMounted(first), false);
    assert.equal(cleanupCount, 1);
    assert.equal(second.textContent, 'Second');
    await act(() => slot.destroy());
    slot.destroy();
    assert.equal(hostIsMounted(second), false);
    assert.equal(cleanupCount, 1);
  } finally {
    await act(() => slot.destroy());
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('hydration adopts the existing node and supports guarded updates and release', async () => {
  const { hydrateOwnedRoot } = await import('../src/react/lib/boot/ownedRoot.ts');
  const dom = new JSDOM('<div id="hydrated"><button>Open</button></div>');
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let handle;
  try {
    const host = document.getElementById('hydrated');
    const original = host.firstChild;
    await act(() => { handle = hydrateOwnedRoot(host, 'pill', createElement('button', null, 'Open')); });
    assert.equal(host.firstChild, original);
    assert.equal(hydrateOwnedRoot(host, 'pill', createElement('button', null, 'Open')), handle);
    await act(() => handle.render(createElement('button', null, 'Updated')));
    assert.equal(host.firstChild, original);
    assert.equal(host.textContent, 'Updated');
    await act(() => handle.destroy());
    handle.render(createElement('button', null, 'Stale'));
    assert.equal(hostIsMounted(host), false);
    assert.equal(host.textContent, '');
  } finally {
    await act(() => handle?.destroy());
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('grouped roots preserve component state across updates and release every member before fallback', async () => {
  const { createRootGroup } = await import('../src/react/lib/boot/ownedRoot.ts');
  const { useState, useEffect } = await import('react');
  const dom = new JSDOM('<div id="a"></div><div id="b"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const group = createRootGroup('turn');
  let released = 0;
  function Turn({ label }) {
    const [count, setCount] = useState(0);
    useEffect(() => () => { released++; }, []);
    return createElement('button', { onClick: () => setCount((value) => value + 1) }, `${label}:${count}`);
  }
  try {
    const a = document.getElementById('a'), b = document.getElementById('b');
    let first;
    await act(() => { first = group.render(a, createElement(Turn, { label: 'First' })); group.render(b, createElement(Turn, { label: 'Second' })); });
    await act(() => a.querySelector('button').click());
    await act(() => { assert.equal(group.render(a, createElement(Turn, { label: 'Updated' })), first); });
    assert.equal(a.textContent, 'Updated:1');
    assert.equal(b.textContent, 'Second:0');
    await act(() => group.release(a));
    assert.equal(released, 1);
    a.innerHTML = '<p>Legacy fallback</p>';
    await act(() => group.releaseAll());
    group.releaseAll();
    assert.equal(a.textContent, 'Legacy fallback');
    assert.equal(b.textContent, '');
    assert.equal(released, 2);
  } finally {
    await act(() => group.releaseAll());
    globalThis.window = previous.window; globalThis.document = previous.document; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});

test('observed root groups reuse roots and release hosts removed by legacy DOM updates', async () => {
  const { createObservedRootGroup } = await import('../src/react/lib/boot/observedRootGroup.ts');
  const dom = new JSDOM('<div id="root"></div>');
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    MutationObserver: globalThis.MutationObserver,
    act: globalThis.IS_REACT_ACT_ENVIRONMENT,
  };
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const group = createObservedRootGroup('legacy-test');
  let unmounted = 0;
  const { useEffect } = await import('react');
  function View({ label }) {
    useEffect(() => () => { unmounted++; }, []);
    return createElement('button', null, label);
  }
  try {
    const host = document.getElementById('root');
    let first;
    await act(() => { first = group.render(host, createElement(View, { label: 'First' })); });
    await act(() => { assert.equal(group.render(host, createElement(View, { label: 'Updated' })), first); });
    assert.equal(host.textContent, 'Updated');

    await act(async () => {
      host.remove();
      await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    });
    assert.equal(host.textContent, '');
    assert.equal(hostIsMounted(host), false);
    assert.equal(unmounted, 1);

    group.releaseAll();
  } finally {
    group.releaseAll();
    globalThis.window = previous.window;
    globalThis.document = previous.document;
    globalThis.MutationObserver = previous.MutationObserver;
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act;
    dom.window.close();
  }
});
