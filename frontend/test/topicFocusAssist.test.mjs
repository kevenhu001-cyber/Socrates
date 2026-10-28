import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { initTopicFocusAssist } from '../src/ui/topicFocusAssist.ts';

function createBrowser({ keyboardOpen = false, coarsePointer = false, initialScrollTop = 0 } = {}) {
  const dom = new JSDOM(
    '<!doctype html><html><body><section id="topicSetup"><div id="composerRoot">'
      + '<div contenteditable="true"></div></div></section></body></html>',
    { url: 'http://localhost/' },
  );
  const previousGlobals = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
  })) {
    previousGlobals.set(name, Object.hasOwn(globalThis, name) ? globalThis[name] : undefined);
    globalThis[name] = value;
  }
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 200 });
  Object.defineProperty(dom.window, 'visualViewport', {
    configurable: true,
    value: { offsetTop: 0, height: 200 },
  });
  dom.window.matchMedia = (query) => ({
    matches: coarsePointer && (query === '(pointer: coarse)' || query === '(hover: none)'),
  });
  const topic = dom.window.document.querySelector('#topicSetup');
  Object.defineProperties(topic, {
    scrollHeight: { configurable: true, value: 500 },
    clientHeight: { configurable: true, value: 200 },
  });
  topic.scrollTop = initialScrollTop;
  if (keyboardOpen) dom.window.document.documentElement.dataset.keyboardOpen = 'true';

  return {
    dom,
    topic,
    composer: dom.window.document.querySelector('#composerRoot'),
    editor: dom.window.document.querySelector('[contenteditable="true"]'),
    cleanup() {
      dom.window.close();
      for (const [name, value] of previousGlobals) {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      }
    },
  };
}

function setComposerRect(composer, top, bottom) {
  Object.defineProperty(composer, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top, bottom, left: 0, right: 100, x: 0, y: top, width: 100, height: bottom - top }),
  });
}

function waitForFocusSettle() {
  return new Promise((resolve) => setTimeout(resolve, 210));
}

test('desktop focus scrolls the topic surface just enough to reveal the composer', async () => {
  const browser = createBrowser();
  try {
    setComposerRect(browser.composer, 180, 240);
    const stop = initTopicFocusAssist();
    browser.editor.focus();
    await waitForFocusSettle();
    stop();
    assert.equal(browser.topic.scrollTop, 56);
  } finally {
    browser.cleanup();
  }
});

test('keyboard-owned and touch-only focus leave topic scrolling to the keyboard controller', async () => {
  for (const options of [{ keyboardOpen: true }, { coarsePointer: true }]) {
    const browser = createBrowser({ ...options, initialScrollTop: 30 });
    try {
      setComposerRect(browser.composer, 180, 240);
      const stop = initTopicFocusAssist();
      browser.editor.focus();
      await waitForFocusSettle();
      stop();
      assert.equal(browser.topic.scrollTop, 30);
    } finally {
      browser.cleanup();
    }
  }
});
