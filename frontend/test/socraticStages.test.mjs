import test from 'node:test';
import assert from 'node:assert/strict';
import { getActiveSocraticStage, SOCRATIC_STAGES } from '../src/tutor/socraticStages.ts';

test('the top-bar stage mirrors the six stages stored by the teaching state machine', () => {
  assert.deepEqual(SOCRATIC_STAGES.map((stage) => stage.id), [
    'motivate', 'define', 'develop', 'illustrate', 'exercise', 'check',
  ]);
  for (const stage of SOCRATIC_STAGES) {
    assert.equal(getActiveSocraticStage(stage.id), stage);
  }
  assert.equal(getActiveSocraticStage('unknown'), SOCRATIC_STAGES[0]);
  assert.equal(getActiveSocraticStage(null), SOCRATIC_STAGES[0]);
});
