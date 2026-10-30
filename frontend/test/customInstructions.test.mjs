import assert from 'node:assert/strict';
import test from 'node:test';

const values = new Map();
globalThis.localStorage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
};

const instructions = await import('../src/config/customInstructions.ts');

test('custom instructions storage validates fields and formats the request value', () => {
  values.set('socrates-custom-instructions', JSON.stringify({
    response: 'Use examples.', about: 'I teach physics.', savedAt: '2026-10-31', ignored: true,
  }));

  assert.deepEqual(instructions.loadCustomInstructions(), {
    response: 'Use examples.', about: 'I teach physics.', savedAt: '2026-10-31',
  });
  assert.equal(instructions.getCustomInstructionsString(),
    '[How to respond]\nUse examples.\n\n[About the user]\nI teach physics.');
});

test('malformed custom instruction storage falls back to empty values', () => {
  values.set('socrates-custom-instructions', '{invalid');

  assert.deepEqual(instructions.loadCustomInstructions(), { response: '', about: '', savedAt: '' });
  assert.equal(instructions.getCustomInstructionsString(), '');
});
