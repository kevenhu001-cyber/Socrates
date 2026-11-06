import test from 'node:test';
import assert from 'node:assert/strict';
import { airyIntensity, pairIntensity, rayleighAngle, sampledAiry } from '../src/react/intelligence-ui/physics/optics.ts';
import { validateIntelligentUi, parseIntelligenceUiRecords } from '@socrates/core';

test('circular aperture has normalized peak, first dark ring and physical sidelobe', () => {
  assert.equal(airyIntensity(0), 1);
  assert.ok(airyIntensity(1) < 1e-20);
  assert.ok(Math.abs(airyIntensity(1.34) - .0175) < .0001);
  for (const radius of [.1, .5, 1, 1.34, 2.8, 4.4]) assert.ok(Math.abs(sampledAiry(radius) - airyIntensity(radius)) < .00002);
});
test('Rayleigh pair has expected 26.5 percent central dip and adds intensities', () => {
  const peak = pairIntensity(.5, 0, 1), saddle = pairIntensity(0, 0, 1);
  assert.ok(Math.abs(peak - 1) < .00001);
  assert.ok(Math.abs(saddle / peak - .735) < .001);
  assert.equal(pairIntensity(0, 0, 0), 2);
  assert.equal(pairIntensity(.3, .7, 1), pairIntensity(-.3, -.7, 1));
});
test('physical angle scales with wavelength and inverse pupil diameter', () => {
  const theta = rayleighAngle(550, 100);
  assert.ok(Math.abs(theta * 206264.806 - 1.3837) < .001);
  assert.equal(rayleighAngle(550, 200), theta / 2);
  assert.equal(rayleighAngle(1100, 100), theta * 2);
});
test('native physics contract parses and rejects unsupported scenes or bad numeric inputs', () => {
  const node = { id: 'optic', type: 'physics', scene: 'rayleigh', separation: 1, wavelength: 550, aperture: 100 };
  assert.equal(validateIntelligentUi({ version: 1, nodes: [node] }).ok, true);
  assert.equal(parseIntelligenceUiRecords(JSON.stringify(node))[0].type, 'physics');
  for (const patch of [{scene:'unknown'}, {separation:Infinity}, {wavelength:0}, {aperture:301}, {separation:{state:'s'}}, {wavelength:'550'}]) {
    assert.equal(validateIntelligentUi({ version: 1, nodes: [{...node, ...patch}] }).ok, false);
  }
});
