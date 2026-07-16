// @ts-check
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkShareAccess } from '../src/routes/publicShares.js';

describe('checkShareAccess', () => {
  const session = { id: 's-1', userId: 'u-1' };
  const owner = { id: 'u-1' };
  const other = { id: 'u-2' };

  test('public visibility is open to anyone', () => {
    assert.equal(checkShareAccess({ visibility: 'public' }, session, null), 'ok');
    assert.equal(checkShareAccess({ visibility: 'public' }, session, other), 'ok');
  });

  test('unlisted visibility is open to anyone', () => {
    assert.equal(checkShareAccess({ visibility: 'unlisted' }, session, null), 'ok');
  });

  test('private visibility is restricted to the session owner', () => {
    assert.equal(checkShareAccess({ visibility: 'private' }, session, owner), 'ok');
    assert.equal(checkShareAccess({ visibility: 'private' }, session, other), 'forbidden');
    assert.equal(checkShareAccess({ visibility: 'private' }, session, null), 'forbidden');
  });

  test('unknown visibility falls back to forbidden', () => {
    assert.equal(checkShareAccess({ visibility: 'link' }, session, owner), 'forbidden');
  });

  test('missing share or session is unauthorized', () => {
    assert.equal(checkShareAccess(null, session, owner), 'unauthorized');
    assert.equal(checkShareAccess({ visibility: 'public' }, null, owner), 'unauthorized');
  });
});
