import assert from 'node:assert/strict';
import test from 'node:test';

import { hasViewTransitions, withViewTransition } from '../src/ui/viewTransitions.ts';

function setDocument(value) {
  if (value === undefined) {
    delete globalThis.document;
    return;
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value,
  });
}

test('page view-transition wrapper preserves immediate fallback and supported paths', () => {
  const previous = globalThis.document;
  const hadDocument = Object.prototype.hasOwnProperty.call(globalThis, 'document');

  try {
    let updates = 0;

    // SSR / non-DOM execution: the state mutation still runs exactly once.
    setDocument(undefined);
    withViewTransition(() => { updates += 1; });
    assert.equal(updates, 1);

    // Browsers without the API use the same synchronous fallback.
    setDocument({});
    withViewTransition(() => { updates += 1; });
    assert.equal(updates, 2);

    // Supported browsers delegate the mutation to startViewTransition.
    let starts = 0;
    setDocument({
      startViewTransition(update) {
        starts += 1;
        update();
        return { skipTransition() {} };
      },
    });
    withViewTransition(() => { updates += 1; });
    assert.equal(starts, 1);
    assert.equal(updates, 3);
    assert.equal(hasViewTransitions(), true);

    // A nested/invalid transition may throw before invoking the callback;
    // the wrapper must degrade to the direct mutation rather than drop input.
    setDocument({
      startViewTransition() {
        throw new Error('transition already active');
      },
    });
    withViewTransition(() => { updates += 1; });
    assert.equal(updates, 4);

    // A throwing mutation must not run twice in synchronous adapters.
    setDocument({ startViewTransition(update) { update(); } });
    assert.throws(() => withViewTransition(() => {
      updates += 1;
      throw new Error('mutation failed');
    }), /mutation failed/);
    assert.equal(updates, 5);

    // Repeated navigation skips the old snapshot, but never drops updates.
    let skips = 0;
    setDocument({
      startViewTransition(update) {
        update();
        return { skipTransition() { skips += 1; } };
      },
    });
    withViewTransition(() => { updates += 1; });
    withViewTransition(() => { updates += 1; });
    assert.equal(skips, 1);
    assert.equal(updates, 7);

    // Reduced motion bypasses the API, including its deferred update phase.
    const previousWindow = globalThis.window;
    try {
      globalThis.window = { matchMedia: () => ({ matches: true }) };
      withViewTransition(() => { updates += 1; });
      assert.equal(skips, 2);
      assert.equal(updates, 8);
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  } finally {
    if (hadDocument) setDocument(previous);
    else setDocument(undefined);
  }
});
