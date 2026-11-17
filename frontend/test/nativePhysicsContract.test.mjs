import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIntelligentUi, parseIntelligentUiRecords } from '@socrates/core';

test('native physics contract parses and rejects unsupported scenes or bad numeric inputs', () => {
  const node = {
    id: 'optic',
    type: 'physics',
    scene: 'rayleigh',
    separation: 1,
    wavelength: 550,
    aperture: 100,
  };
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node] }).ok, true);
  assert.equal(parseIntelligentUiRecords(JSON.stringify(node))[0].type, 'physics');
  for (const patch of [
    { scene: 'unknown' },
    { separation: Infinity },
    { wavelength: 0 },
    { aperture: 301 },
    { separation: { state: 's' } },
    { wavelength: 'not-a-number' },
  ]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{ ...node, ...patch }] }).ok, false);
  }
  /* A quoted number is recoverable (the normalizer supports XML-encoded and
     re-serialized payloads) and normalizes to the numeric range check. */
  assert.equal(
    validateIntelligentUi({ version: 1, nodes: [{ ...node, wavelength: '550' }] }).ok,
    true,
  );
});
