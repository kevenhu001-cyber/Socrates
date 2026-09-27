import test from 'node:test';
import assert from 'node:assert/strict';

import { planUpgradeOrder, startHistoryUpgrade } from '../src/session/historyUpgrade.js';

/* session/historyUpgrade.js is dependency-injected (stateStore + schedulers),
   so these tests drive it with a fake store and controllable frame/idle clocks
   — no DOM required. */

function makeStore(currentSessionId, messages) {
  return {
    _messages: messages,
    _session: currentSessionId,
    read(key) {
      if (key === 'messages') return this._messages;
      if (key === 'currentSessionId') return this._session;
      return undefined;
    },
    dispatch(action) {
      if (action.type === 'session/update-message') {
        const m = this._messages[action.index];
        if (m && m.clientId === action.clientId) Object.assign(m, action.patch);
      }
    },
  };
}

/* history of `n` user/assistant pairs; assistant html starts as a stale
   snapshot distinct from the canonical 'UP:'+rawText build. */
function makeHistory(n) {
  const messages = [];
  for (let i = 0; i < n; i++) {
    messages.push({ role: 'user', clientId: 'u' + i, rawText: 'q' + i, html: '<p>q' + i + '</p>' });
    messages.push({ role: 'assistant', clientId: 'a' + i, rawText: 'ans' + i, html: 'STALE-a' + i });
  }
  return messages;
}

const build = (raw) => 'UP:' + raw;
function makeClock() {
  const frameQ = [];
  const idleQ = [];
  return {
    frameQ, idleQ,
    raf: (cb) => { frameQ.push(cb); return frameQ.length; },
    ric: (cb) => { idleQ.push(cb); return idleQ.length; },
    runFrames(guard = 1000) { let n = 0; while (frameQ.length && n++ < guard) frameQ.shift()(); },
    runIdle(guard = 1000) { let n = 0; while (idleQ.length && n++ < guard) idleQ.shift()(); },
  };
}
const upgraded = (messages) => messages.filter((m) => typeof m.html === 'string' && m.html.startsWith('UP:')).map((m) => m.clientId);

test('planUpgradeOrder lists newest assistant turns first', () => {
  const messages = makeHistory(3);
  const order = planUpgradeOrder(messages);
  assert.deepEqual(order.map((o) => o.index), [5, 3, 1]);
  assert.deepEqual(order.map((o) => o.clientId), ['a2', 'a1', 'a0']);
});

test('the near burst upgrades the visible tail first (newest → older)', () => {
  const messages = makeHistory(20); // 20 assistant turns
  const store = makeStore('S1', messages);
  const clock = makeClock();
  startHistoryUpgrade('S1', messages, {
    stateStore: store, buildAssistantHtml: build, publish() {},
    raf: clock.raf, ric: clock.ric, visibleTail: 8,
  });
  // one frame = 2 newest turns (compare as a set — upgraded() is index-ordered)
  clock.runFrames(1);
  assert.deepEqual(upgraded(messages).slice().sort(), ['a18', 'a19']);
  // the whole near window completes on the frame clock before any far work runs
  clock.runFrames();
  const nearDone = upgraded(messages);
  assert.equal(nearDone.length, 8);
  assert.ok(nearDone.includes('a19') && nearDone.includes('a12'));
  assert.ok(!nearDone.includes('a11')); // still far, not yet drained
});

test('far (off-screen) turns drain on the idle clock after near finishes', () => {
  const messages = makeHistory(12);
  const store = makeStore('S1', messages);
  const clock = makeClock();
  const handle = startHistoryUpgrade('S1', messages, {
    stateStore: store, buildAssistantHtml: build, publish() {},
    raf: clock.raf, ric: clock.ric, visibleTail: 5,
  });
  assert.deepEqual(handle._stats(), { near: 5, far: 7 });
  clock.runFrames();   // near done, far scheduled on idle
  assert.equal(upgraded(messages).length, 5);
  clock.runIdle();     // far drains to completion
  assert.equal(upgraded(messages).length, 12);
});

test('a session switch mid-drain abandons the queue', () => {
  const messages = makeHistory(10);
  const store = makeStore('S1', messages);
  const clock = makeClock();
  startHistoryUpgrade('S1', messages, {
    stateStore: store, buildAssistantHtml: build, publish() {},
    raf: clock.raf, ric: clock.ric, visibleTail: 4,
  });
  clock.runFrames(1);
  const afterOneFrame = upgraded(messages).length;
  assert.equal(afterOneFrame, 2);
  store._session = 'OTHER'; // user switched sessions
  clock.runFrames();
  clock.runIdle();
  assert.equal(upgraded(messages).length, afterOneFrame); // nothing further ran
});

test('a row whose clientId no longer matches its index is skipped, not patched', () => {
  const messages = makeHistory(3);
  const store = makeStore('S1', messages);
  const clock = makeClock();
  startHistoryUpgrade('S1', messages, {
    stateStore: store, buildAssistantHtml: build, publish() {},
    raf: clock.raf, ric: clock.ric, visibleTail: 3,
  });
  // The list changes under the queue AFTER planning: index 4 is now a
  // different turn, so the captured slot must not be written into it.
  messages[4].clientId = 'a2-replaced';
  clock.runFrames();
  const ids = upgraded(messages);
  assert.ok(!ids.includes('a2-replaced')); // stale-slot turn was skipped
  assert.ok(ids.includes('a1') && ids.includes('a0')); // the rest upgraded fine
});

test('buildAssistantHtml throwing for one turn does not abort the queue', () => {
  const messages = makeHistory(2); // assistant indices 1 (a0) and 3 (a1)
  messages[3].rawText = 'boom';
  const store = makeStore('S1', messages);
  const clock = makeClock();
  startHistoryUpgrade('S1', messages, {
    stateStore: store,
    buildAssistantHtml: (raw) => { if (raw === 'boom') throw new Error('render fail'); return 'UP:' + raw; },
    publish() {}, raf: clock.raf, ric: clock.ric, visibleTail: 2,
  });
  clock.runFrames();
  assert.deepEqual(upgraded(messages), ['a0']); // a1 failed, a0 still upgraded
});
