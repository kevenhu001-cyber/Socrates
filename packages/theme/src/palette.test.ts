import test from 'node:test';
import assert from 'node:assert/strict';
import { darkPalette, lightPalette, resolveBackground, type ThemePalette } from './tokens';
import { palettesHex } from './rn';

function hslToHex(value: string): string {
  const [h, s, l] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - chroma / 2;
  const sector = Math.floor(h / 60);
  const [r, g, b] = sector === 0 ? [chroma, x, 0]
    : sector === 1 ? [x, chroma, 0]
    : sector === 2 ? [0, chroma, x]
    : sector === 3 ? [0, x, chroma]
    : sector === 4 ? [x, 0, chroma] : [chroma, 0, x];
  return `#${[r, g, b].map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}
function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map((channel) => parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function checkParity(palette: ThemePalette, hex: (typeof palettesHex)['light']): void {
  for (const group of ['accent', 'bg', 'text', 'border'] as const) {
    for (const key of Object.keys(palette[group]) as Array<keyof typeof palette[typeof group]>) {
      assert.equal(hslToHex(palette[group][key]), hex[group][key], `${palette.mode}.${group}.${String(key)}`);
    }
  }
  for (const key of ['muted', 'onAccent'] as const) {
    assert.equal(hslToHex(palette[key]), hex[key], `${palette.mode}.${key}`);
  }
}
test('HSL design tokens stay in parity with native hex palettes', () => {
  checkParity(darkPalette, palettesHex.dark);
  checkParity(lightPalette, palettesHex.light);
  assert.equal(resolveBackground('dark'), palettesHex.dark.bg.page);
  assert.equal(resolveBackground('light'), palettesHex.light.bg.page);
});
test('primary, secondary, and readable muted text meet WCAG AA for normal text', () => {
  for (const [mode, palette] of Object.entries(palettesHex)) {
    const background = palette.bg.page;
    for (const role of ['primary', 'secondary', 'muted'] as const) {
      assert.ok(contrast(palette.text[role], background) >= 4.5, `${mode}.${role} contrast below 4.5:1`);
    }
  }
});
