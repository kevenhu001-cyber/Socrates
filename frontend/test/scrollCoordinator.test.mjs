import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginScrollOwner,
  endScrollOwner,
  writeScrollTop,
} from '../src/legacy/scrollCoordinator.ts';
import { recordScrollIntent } from '../src/legacy/scrollCoordinator.ts';
import {
  captureScrollAnchor,
  correctScrollAnchor,
  updateScrollFadeMask,
} from '../src/react/message-list/messageScroll.ts';

test('higher-priority scroll owners block lower-priority writes', () => {
  const list = { scrollTop: 10 };
  const turnToken = beginScrollOwner(list, 'turn');

  assert.notEqual(turnToken, null);
  assert.equal(writeScrollTop(list, 80, 'content'), false);
  assert.equal(list.scrollTop, 10);
  assert.equal(writeScrollTop(list, 80, 'turn'), true);
  assert.equal(list.scrollTop, 80);

  endScrollOwner(list, turnToken);
  assert.equal(writeScrollTop(list, 120, 'content'), true);
  assert.equal(list.scrollTop, 120);
});

test('a newer owner supersedes a previous claim without stale release', () => {
  const list = { scrollTop: 0 };
  const first = beginScrollOwner(list, 'content');
  const user = beginScrollOwner(list, 'user');

  assert.notEqual(first, null);
  assert.notEqual(user, null);
  endScrollOwner(list, first);
  assert.equal(writeScrollTop(list, 40, 'content'), false);
  assert.equal(writeScrollTop(list, 40, 'user'), true);

  endScrollOwner(list, user);
  assert.equal(writeScrollTop(list, 60, 'content'), true);
  assert.equal(list.scrollTop, 60);
});

function fadeList(scrollTop, scrollHeight, clientHeight) {
  const properties = new Map();
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    dataset: {},
    style: {
      getPropertyValue: (name) => properties.get(name) || '',
      setProperty: (name, value) => properties.set(name, value),
    },
  };
}

test('the transcript mask is enabled only while an edge is fading', () => {
  const resting = fadeList(0, 100, 100);
  updateScrollFadeMask(resting);
  assert.equal(resting.dataset.scrollFade, 'false');
  assert.equal(resting.style.getPropertyValue('--ui-scroll-fade-top'), '0px');
  assert.equal(resting.style.getPropertyValue('--ui-scroll-fade-bottom'), '0px');

  const middle = fadeList(400, 1000, 200);
  updateScrollFadeMask(middle);
  assert.equal(middle.dataset.scrollFade, 'true');
  assert.equal(middle.style.getPropertyValue('--ui-scroll-fade-top'), '28px');
  assert.equal(middle.style.getPropertyValue('--ui-scroll-fade-bottom'), '28px');

  const atTop = fadeList(0, 1000, 200);
  updateScrollFadeMask(atTop);
  assert.equal(atTop.dataset.scrollFade, 'true');
  assert.equal(atTop.style.getPropertyValue('--ui-scroll-fade-top'), '0px');
  assert.equal(atTop.style.getPropertyValue('--ui-scroll-fade-bottom'), '28px');
});

test('a pending history anchor cannot re-pin after new input or a host replacement', () => {
  const host = { scrollTop: 50, scrollHeight: 150, clientHeight: 100 };
  const captured = captureScrollAnchor(host);
  const replacement = { ...host, scrollHeight: 300 };
  correctScrollAnchor(captured, replacement);
  assert.equal(replacement.scrollTop, 50);

  recordScrollIntent();
  host.scrollHeight = 300;
  host.scrollTop = 20;
  correctScrollAnchor(captured, host);
  assert.equal(host.scrollTop, 20);
});

test('edge fading ramps smoothly as the transcript leaves the viewport', () => {
  const nearTop = fadeList(10, 1000, 200);
  updateScrollFadeMask(nearTop);
  assert.equal(nearTop.style.getPropertyValue('--ui-scroll-fade-top'), '8px');
  const nearBottom = fadeList(790, 1000, 200);
  updateScrollFadeMask(nearBottom);
  assert.equal(nearBottom.style.getPropertyValue('--ui-scroll-fade-bottom'), '8px');
  const bottom = fadeList(800, 1000, 200);
  updateScrollFadeMask(bottom);
  assert.equal(bottom.style.getPropertyValue('--ui-scroll-fade-bottom'), '0px');
});
