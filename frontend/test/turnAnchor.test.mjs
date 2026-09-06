import test from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const {
  configureTurnAnchor,
  scheduleActiveTurnToTop,
  turnRowFor,
} = await import('../src/chat/turnAnchor.ts');

configureTurnAnchor({ isMsgListMounted: () => false });

function makeList() {
  const list = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(list);
  return list;
}

function makeAssistant(list, clientId) {
  const assistant = dom.window.document.createElement('div');
  assistant.className = 'msg assistant';
  assistant.dataset.clientId = clientId;
  list.appendChild(assistant);
  return assistant;
}

function makeUser(list) {
  const user = dom.window.document.createElement('div');
  user.className = 'msg user';
  user.textContent = 'hello';
  list.appendChild(user);
  return user;
}

function stubRaf(queue) {
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    queue.push(callback);
    return queue.length;
  };
  return () => {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
  };
}

test('turnRowFor resolves rows by node or client id', () => {
  const list = makeList();
  try {
    assert.equal(turnRowFor(null, null, 'x'), null);
    assert.equal(turnRowFor(list, null, ''), null);
    const assistant = makeAssistant(list, 'a1');
    assert.equal(turnRowFor(list, assistant, 'a1'), assistant);
    const detached = dom.window.document.createElement('div');
    assert.equal(turnRowFor(list, detached, 'a1'), assistant);
    assert.equal(turnRowFor(list, null, 'missing'), null);
  } finally {
    list.remove();
  }
});

test('scheduleActiveTurnToTop reserves the turn and takes viewport ownership', () => {
  const list = makeList();
  const queue = [];
  const restoreRaf = stubRaf(queue);
  try {
    makeUser(list);
    const assistant = makeAssistant(list, 'a2');
    scheduleActiveTurnToTop(list, assistant, -1, null);
    for (let i = 0; i < 12 && queue.length; i++) {
      queue.shift()();
    }
    assert.ok(assistant.classList.contains('turn-viewport-anchor'));
    assert.equal(assistant.style.minHeight, '120px');
    assert.equal(list.__socratesTurnViewportOwner, true);
  } finally {
    restoreRaf();
    list.remove();
  }
});

test('scheduleActiveTurnToTop positions a retry bubble synchronously', () => {
  const list = makeList();
  /* JSDOM reports zero layout geometry; give the list a viewport so
     the retry offset survives clamping. */
  Object.defineProperty(list, 'clientHeight', { value: 600, configurable: true });
  const queue = [];
  const restoreRaf = stubRaf(queue);
  try {
    const assistant = makeAssistant(list, 'a3');
    scheduleActiveTurnToTop(list, assistant, -1, { offset: 40 });
    assert.equal(assistant.style.minHeight, '560px');
    for (let i = 0; i < 12 && queue.length; i++) {
      const frame = queue.shift();
      if (frame.length > 0) frame(0);
      else frame();
    }
    assert.equal(assistant.style.marginTop, '40px');
  } finally {
    restoreRaf();
    list.remove();
  }
});
