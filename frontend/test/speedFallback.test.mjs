import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'https://app.example.test/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);

const { notifySpeedFallbackOnce, resetSpeedFallbackNoticeForTest } = await import('../src/chat/speedFallback.js');

test('speed fallback notice is localized and shown only once per page', () => {
  const pendingTimers = [];
  const originalSetTimeout = globalThis.setTimeout;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
  globalThis.setTimeout = (callback) => {
    pendingTimers.push(callback);
    return pendingTimers.length;
  };
  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };

  try {
    document.body.replaceChildren();
    resetSpeedFallbackNoticeForTest();
    window.t = (key) => key === 'toast.speedFallback' ? 'Fast mode fell back to standard.' : key;

    notifySpeedFallbackOnce();
    notifySpeedFallbackOnce();

    const notices = document.querySelectorAll('.msg-toast');
    assert.equal(notices.length, 1);
    assert.equal(notices[0].textContent, 'Fast mode fell back to standard.');
    assert.equal(notices[0].classList.contains('visible'), true);

    resetSpeedFallbackNoticeForTest();
    notifySpeedFallbackOnce();
    assert.equal(document.querySelectorAll('.msg-toast').length, 2);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    dom.window.close();
  }
});
