import assert from 'node:assert/strict';
import test from 'node:test';

import { beginScrollOwner, endScrollOwner, writeScrollTop } from '../src/ui/scrollCoordinator.ts';
import { recordScrollIntent } from '../src/ui/scrollCoordinator.ts';
import {
  captureScrollAnchor,
  correctScrollAnchor,
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
