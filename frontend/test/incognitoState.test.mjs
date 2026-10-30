import assert from 'node:assert/strict';
import test from 'node:test';

import { isIncognitoOn, setIncognitoOn } from '../src/app/lifecycle/incognitoState.ts';

test('incognito preference has one shared in-memory owner', () => {
  assert.equal(isIncognitoOn(), false);
  setIncognitoOn(true);
  assert.equal(isIncognitoOn(), true);
  setIncognitoOn(false);
  assert.equal(isIncognitoOn(), false);
});
