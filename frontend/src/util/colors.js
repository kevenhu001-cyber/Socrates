// @ts-check
/**
 * Hex / HSL colour helpers for the display-prefs panel.
 *
 * The user can pick a custom dark / light background colour from the
 * `≡` popover. We convert their hex pick to HSL, then derive three
 * additional shades (bg-000 / bg-100 / bg-200 / bg-300) so every
 * card / divider / scrollbar tint stays consistent with the chosen
 * base.  All conversion is done in JS — no Canvas, no CSS variables
 * mutation outside the document root.
 */

const BG_VARS = [
  '--bg-000', '--bg-100', '--bg-200', '--bg-300',
  '--ui-bg-page', '--ui-bg-raised', '--ui-bg-surface', '--ui-bg-control', '--ui-bg-hover',
  '--ui-bg-composer', '--ui-bg-bubble', '--ui-bg-chip', '--ui-bg-chip-hover', '--ui-bg-segment-active',
];

/** @param {string} hex */
export function parseHexColor(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * @param {string} hex
 * @param {'light' | 'dark'} mode
 */
export function applyCustomBg(hex, mode) {
  var p = parseHexColor(hex);
  /* Neutral-black theme contract: a custom background must never tint the
     UI. We keep only the *lightness* of the user's pick and force hue and
     saturation to 0, so every derived surface is a pure grayscale step.
     This kills the historical "跑色" (green/warm cast) while still letting
     users pick how light or dark the page is. */
  var l = p.l;
  var b000, b100, b200, b300;
  if (mode === 'light') {
    b100 = _hslStr(0, 0, l);
    /* When the user picks near-white (l >= 95), the standard
       +4/-6/-14 offsets collapse to ~97/94/86 — barely distinguishable
       from a pure-white page. Branch to fixed gaps that always give
       readable contrast. */
    if (l >= 95) {
      b000 = _hslStr(0, 0, 96);
      b200 = _hslStr(0, 0, 88);
      b300 = _hslStr(0, 0, 76);
    } else {
      b000 = _hslStr(0, 0, Math.min(l + 4, 97));
      b200 = _hslStr(0, 0, Math.max(l - 6, 3));
      b300 = _hslStr(0, 0, Math.max(l - 14, 0));
    }
  } else {
    b100 = _hslStr(0, 0, l);
    /* Same idea for near-black picks (l <= 5): the standard +3.5/-2.7/-6.7
       offsets clamp so all four surfaces land between 0 and 3.5 — the
       sidebar / raised / hover states are indistinguishable. Branch
       to fixed gaps that always keep the surface tints visible. */
    if (l <= 5) {
      b000 = _hslStr(0, 0, 8);
      b200 = _hslStr(0, 0, 14);
      b300 = _hslStr(0, 0, 22);
    } else {
      b000 = _hslStr(0, 0, Math.min(l + 3.5, 95));
      b200 = _hslStr(0, 0, Math.max(l - 2.7, 0));
      b300 = _hslStr(0, 0, Math.max(l - 6.7, 0));
    }
  }
  var root = document.documentElement;
  root.style.setProperty('--bg-000', b000);
  root.style.setProperty('--bg-100', b100);
  root.style.setProperty('--bg-200', b200);
  root.style.setProperty('--bg-300', b300);
  root.style.setProperty('--ui-bg-page', `hsl(${b100})`);
  root.style.setProperty('--ui-bg-raised', `hsl(${b000})`);
  root.style.setProperty('--ui-bg-surface', `hsl(${b200})`);
  root.style.setProperty('--ui-bg-control', `hsl(${b300})`);
  root.style.setProperty('--ui-bg-hover', `hsl(${b300})`);
  /* The composer capsule and user bubble ride the same derived step as the
     control surface; chips and the active segment take the lightest step so
     they stay legible inside the capsule. */
  root.style.setProperty('--ui-bg-composer', `hsl(${b300})`);
  root.style.setProperty('--ui-bg-bubble', `hsl(${b300})`);
  root.style.setProperty('--ui-bg-chip', `hsl(${b000})`);
  root.style.setProperty('--ui-bg-chip-hover', `hsl(${b000})`);
  root.style.setProperty('--ui-bg-segment-active', `hsl(${b300})`);
}

export function removeCustomBg() {
  var root = document.documentElement;
  BG_VARS.forEach(function (v) {
    root.style.removeProperty(v);
  });
}

/**
 * @param {number} h
 * @param {number} s
 * @param {number} l
 */
function _hslStr(h, s, l) {
  return Math.round(h) + ' ' + Math.round(s) + '% ' + Math.round(l) + '%';
}
