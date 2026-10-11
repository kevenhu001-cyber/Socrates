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
        return {};
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
  } finally {
    if (hadDocument) setDocument(previous);
    else setDocument(undefined);
  }
});
