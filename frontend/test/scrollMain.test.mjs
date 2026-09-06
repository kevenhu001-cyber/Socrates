import test from 'node:test';
import assert from 'node:assert/strict';

import { scrollMainToBottom, scheduleScrollMainToBottom } from '../src/ui/scroll.js';
import { stateStore } from '../src/state/store.js';

function makeList() {
  return {
    scrollHeight: 2000,
    scrollTop: 0,
    clientHeight: 600,
    dataset: {},
    offsetParent: {},
  };
}

function withDocument(list, fn) {
  const previousDocument = globalThis.document;
  globalThis.document = {
    getElementById: (id) => (id === 'msgList' ? list : null),
  };
  try {
    return fn();
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

function setScrolledAway(value) {
  stateStore.dispatch({ type: 'state/set', key: '_userScrolledAway', value });
}

test('scrollMainToBottom stays put when the reader scrolled away', () => {
  const list = makeList();
  list.scrollTop = 500;
  setScrolledAway(true);
  try {
    withDocument(list, () => scrollMainToBottom({}));
    assert.equal(list.scrollTop, 500);
  } finally {
    setScrolledAway(false);
  }
});

test('scrollMainToBottom force-snaps to the bottom', () => {
  const list = makeList();
  setScrolledAway(true);
  try {
    withDocument(list, () => scrollMainToBottom({ force: true }));
    assert.equal(list.scrollTop, 2000);
  } finally {
    setScrolledAway(false);
  }
});

test('scrollMainToBottom follows a pinned reader without force', () => {
  const list = makeList();
  list.scrollTop = 1400;
  setScrolledAway(false);
  withDocument(list, () => scrollMainToBottom({}));
  assert.equal(list.scrollTop, 2000);
});

test('scrollMainToBottom ignores an unpinned reader without force', () => {
  const list = makeList();
  setScrolledAway(false);
  withDocument(list, () => scrollMainToBottom({}));
  assert.equal(list.scrollTop, 0);
});

test('scheduleScrollMainToBottom scrolls after two frames', () => {
  const list = makeList();
  const queue = [];
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queue.push(callback);
    return queue.length;
  };
  const restoreRaf = () => {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
  };
  setScrolledAway(false);
  try {
    withDocument(list, () => {
      scheduleScrollMainToBottom({ force: true });
      assert.equal(list.scrollTop, 0);
      queue.shift()();
      /* The inner frame performs the scroll itself: drop the stub so
         the velocity planner takes its synchronous snap path. */
      restoreRaf();
      queue.shift()();
      assert.equal(list.scrollTop, 2000);
    });
  } finally {
    restoreRaf();
  }
});
