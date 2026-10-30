import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDeepResearchEnabled,
  setDeepResearchEnabled,
} from '../src/config/deepResearchMode.ts';

test('Deep Research mode is shared as module state', () => {
  setDeepResearchEnabled(false);
  assert.equal(isDeepResearchEnabled(), false);

  setDeepResearchEnabled(true);
  assert.equal(isDeepResearchEnabled(), true);

  setDeepResearchEnabled(false);
  assert.equal(isDeepResearchEnabled(), false);
});
