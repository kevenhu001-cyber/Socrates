import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { ResultSection } from '../src/react/tool-run/ToolRunDetailSections.tsx';

test('a stale clipboard failure cannot alter or refocus a replacement result', async () => {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div><button id="outside">Outside</button></body>');
  const oldWindow = globalThis.window;
  const oldDocument = globalThis.document;
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let rejectCopy;
  let fallbackCalls = 0;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    clipboard: { writeText: () => new Promise((_, reject) => { rejectCopy = reject; }) },
  } });
  document.execCommand = () => { fallbackCalls += 1; return true; };
  const root = createRoot(document.getElementById('root'));
  const section = (text) => ({ kind: 'error', title: 'Error', text });
  try {
    await act(() => root.render(createElement(ResultSection, { section: section('Old result') })));
    const button = document.querySelector('.tool-inline-action');
    await act(() => button.click());
    await act(() => root.render(createElement(ResultSection, { section: section('New result') })));
    const outside = document.getElementById('outside');
    outside.focus();
    await act(async () => { rejectCopy(new Error('permission denied')); });
    assert.equal(fallbackCalls, 0);
    assert.equal(document.activeElement, outside);
    assert.equal(document.querySelector('.tool-inline-action').textContent, 'Copy');
    assert.equal(document.querySelector('.tool-inline-detail-value').textContent, 'New result');
  } finally {
    await act(() => root.unmount());
    dom.window.close();
    globalThis.window = oldWindow;
    globalThis.document = oldDocument;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  }
});
