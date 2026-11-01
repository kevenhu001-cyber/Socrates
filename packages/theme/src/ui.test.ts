import assert from 'node:assert/strict';
import test from 'node:test';

import { getThemePaletteHex } from './rn';
import { uiColors, uiColorVar, uiColorsCssVars, uiRadius, uiType } from './ui';

test('canvas and card reuse the shared background ladder', () => {
  assert.equal(uiColors.light.canvas, getThemePaletteHex('light').bg.page);
  assert.equal(uiColors.light.card, getThemePaletteHex('light').bg.raised);
  assert.equal(uiColors.dark.canvas, getThemePaletteHex('dark').bg.page);
  assert.equal(uiColors.dark.card, getThemePaletteHex('dark').bg.raised);
});

test('both modes define every colour role', () => {
  const roles = Object.keys(uiColorVar).sort();
  assert.deepEqual(Object.keys(uiColors.light).sort(), roles);
  assert.deepEqual(Object.keys(uiColors.dark).sort(), roles);
});

test('the accent is neutral ink, never a hue', () => {
  for (const mode of ['light', 'dark'] as const) {
    const ink = uiColors[mode].ink.replace('#', '');
    assert.match(ink, /^([0-9a-f]{2})\1\1$/i, `${mode} ink must be a grey`);
  }
});

test('css var palette points every role at its generated variable', () => {
  for (const [role, name] of Object.entries(uiColorVar)) {
    assert.equal(uiColorsCssVars[role as keyof typeof uiColorsCssVars], `var(${name})`);
    assert.match(name, /^--ui-/);
  }
});

test('controls are pills and display type outranks body type', () => {
  assert.ok(uiRadius.pill >= 999);
  assert.ok(uiType.display.size >= 2 * uiType.body.size);
  assert.ok(uiType.displayCompact.size > uiType.title.size);
});
