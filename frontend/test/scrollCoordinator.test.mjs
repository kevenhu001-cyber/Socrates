import assert from 'node:assert/strict';
import test from 'node:test';

import {
  beginScrollOwner,
  endScrollOwner,
  writeScrollTop,
} from '../src/ui/scrollCoordinator.ts';

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
