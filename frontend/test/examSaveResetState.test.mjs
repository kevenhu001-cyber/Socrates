import test from 'node:test';
import assert from 'node:assert/strict';
import { registerExamSaveReset, resetExamSaveStateIfLoaded } from '../src/app/lifecycle/examSaveReset.ts';

test('account cleanup is a no-op before the lazy exam module loads', () => {
  assert.doesNotThrow(() => resetExamSaveStateIfLoaded());
});

test('account cleanup invokes the registered exam save reset', () => {
  let resets = 0;
  registerExamSaveReset(() => { resets += 1; });

  resetExamSaveStateIfLoaded();

  assert.equal(resets, 1);
});
