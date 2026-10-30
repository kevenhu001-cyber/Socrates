import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

import { JSDOM } from 'jsdom';
import { stateStore } from '../src/state/store.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);

const {
  configureTurnAnchor,
  releaseTurnViewportHold,
  scheduleActiveTurnToTop,
  scheduleTurnToTopForMessage,
  turnAnchorReserve,
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

test('scheduleTurnToTopForMessage waits for a React row to mount by client id', async () => {
  const list = makeList();
  const queue = [];
  const restoreRaf = stubRaf(queue);
  const previousMessages = stateStore.read('messages');
  try {
    makeUser(list);
    stateStore.dispatch({
      type: 'state/set',
      key: 'messages',
      value: [
        { clientId: 'react-user', role: 'user', rawText: 'hello', html: null },
        { clientId: 'react-reply', role: 'assistant', rawText: 'reply', html: '<p>reply</p>' },
      ],
    });

    /* The direct reply is in the authoritative store before React commits
       its row. The first positioning pass must stay alive instead of
       dereferencing a missing assistant node or giving up. */
    scheduleTurnToTopForMessage(list, 'react-reply');
    assert.ok(queue.length > 0);

    const assistant = makeAssistant(list, 'react-reply');
    queue.shift()();
    await Promise.resolve();
    for (let i = 0; i < 8 && queue.length; i += 1) {
      const frame = queue.shift();
      if (frame.length > 0) frame(0);
      else frame();
    }

    assert.ok(assistant.classList.contains('turn-viewport-anchor'));
    assert.notEqual(assistant.style.minHeight, '');
    assert.equal(list.__socratesTurnViewportOwner, true);
  } finally {
    releaseTurnViewportHold();
    mock.timers.reset();
    stateStore.dispatch({ type: 'state/set', key: 'messages', value: previousMessages });
    restoreRaf();
    list.remove();
  }
});

test('turnAnchorReserve keeps the prompt at the top offset with the answer filling the rest', () => {
  /* 800 px transcript, 81 px prompt, no list padding: the answer gets
     everything the prompt does not use, minus the bottom gap. */
  assert.equal(turnAnchorReserve(800, 81, 0), 695);
  /* List padding below the transcript is air, not answer room. */
  assert.equal(turnAnchorReserve(800, 81, 24), 671);
  /* A short viewport cannot collapse the reserve below its floor. */
  assert.equal(turnAnchorReserve(160, 81, 0), 120);
  /* Non-finite geometry (a detached or hidden list) falls back to the floor. */
  assert.equal(turnAnchorReserve(NaN, 81, 0), 120);
  assert.equal(turnAnchorReserve(800, Number.POSITIVE_INFINITY, 0), 120);
});

test('retiring a spent reserve keeps the prompt in its slot when the row settles later', async () => {
  const list = makeList();
  /* JSDOM has no layout: drive the transcript's geometry by hand. The
     reader sits 8px short of the bottom, so the transcript's scroll range
     shrinks by more than the reader can give back when the spent row
     settles — which is what used to leave the prompt above its slot. */
  const clientHeight = 666;
  let scrollHeight = 3288;
  let scrollTop = 2614;
  /* The prompt's position inside the transcript's content never moves; its
     visible offset is that position minus the scroll offset. */
  let promptContent = 2626;
  const clampScroll = () => {
    const max = Math.max(0, scrollHeight - clientHeight);
    if (scrollTop > max) scrollTop = max;
  };
  Object.defineProperty(list, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(list, 'scrollHeight', { get: () => scrollHeight, configurable: true });
  Object.defineProperty(list, 'scrollTop', {
    get: () => scrollTop,
    set: (value) => { scrollTop = value; clampScroll(); },
    configurable: true,
  });
  list.getBoundingClientRect = () => ({ top: 0, bottom: clientHeight, height: clientHeight });

  const prompt = makeUser(list);
  prompt.getBoundingClientRect = () => ({
    top: promptContent - scrollTop,
    bottom: promptContent - scrollTop + 80,
    height: 80,
  });
  Object.defineProperty(prompt, 'offsetTop', { get: () => promptContent, configurable: true });

  /* The spent turn's answer: reserved, and above the visible transcript. */
  const spent = makeAssistant(list, 'spent');
  spent.classList.add('turn-viewport-anchor');
  spent.style.minHeight = '534px';
  let spentHeight = 534;
  spent.getBoundingClientRect = () => ({
    top: 200 - scrollTop, bottom: 200 - scrollTop + spentHeight, height: spentHeight,
  });

  /* The new turn's answer: the row the hold owns. */
  const assistant = makeAssistant(list, 'current');
  assistant.getBoundingClientRect = () => ({
    top: scrollTop + 900, bottom: scrollTop + 940, height: 40,
  });

  const previousMessages = stateStore.read('messages');
  const observers = [];
  const previousResizeObserver = globalThis.ResizeObserver;
  globalThis.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.observed = new Set(); observers.push(this); }
    observe(element) { this.observed.add(element); }
    unobserve(element) { this.observed.delete(element); }
    disconnect() { this.observed.clear(); }
  };
  /* A real ResizeObserver only fires for the elements it watches, so a
     layout change in an unwatched row must not reach the hold. */
  const resize = (element) => {
    for (const observer of observers) {
      if (observer.observed.has(element)) { observer.callback(); return true; }
    }
    return false;
  };
  const queue = [];
  const restoreRaf = stubRaf(queue);
  mock.timers.enable({ apis: ['Date'] });
  const pump = (times = 8) => {
    for (let i = 0; i < times; i += 1) {
      const frame = queue.shift();
      if (!frame) break;
      if (frame.length > 0) frame(i * 16);
      else frame();
    }
  };
  try {
    stateStore.dispatch({
      type: 'state/set',
      key: 'messages',
      value: [
        { clientId: 'user-1', role: 'user', rawText: 'hello', html: null },
        { clientId: 'spent', role: 'assistant', rawText: 'old answer', html: null, _turnAnchorMinHeight: 534 },
        { clientId: 'current', role: 'assistant', rawText: '', html: null, _turnAnchorMinHeight: 562 },
      ],
    });

    scheduleActiveTurnToTop(list, assistant, -1, null);
    await Promise.resolve();
    pump();
    /* The turn's settle window runs on a deadline: let it expire so the
       spent reserve is retired. */
    mock.timers.tick(200);
    pump();

    /* The spent row's reserve is retired once the new turn's glide has
       landed: the row loses its anchor, but its CONTENT only settles on the
       next React commit. */
    assert.equal(spent.classList.contains('turn-viewport-anchor'), false);
    assert.equal(spent.style.minHeight, '');

    /* The commit lands: the row settles 154px shorter, the transcript's
       scroll range shrinks with it, and the browser clamps the scroll
       offset — which is what moves the reader. */
    spentHeight = 380;
    promptContent -= 154;
    scrollHeight = 3134;
    clampScroll();
    assert.equal(prompt.getBoundingClientRect().top, 4);

    /* The hold watches the retired row, so the commit reaches it and it
       re-aligns the prompt in its slot. */
    assert.equal(resize(spent), true, 'the hold watches the retired row');
    assert.equal(scrollTop, 2460);
    assert.equal(prompt.getBoundingClientRect().top, 12);
  } finally {
    releaseTurnViewportHold();
    mock.timers.reset();
    stateStore.dispatch({ type: 'state/set', key: 'messages', value: previousMessages });
    if (previousResizeObserver === undefined) delete globalThis.ResizeObserver;
    else globalThis.ResizeObserver = previousResizeObserver;
    restoreRaf();
    list.remove();
  }
});
