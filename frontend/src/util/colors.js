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

const BG_VARS = ['--bg-000', '--bg-100', '--bg-200', '--bg-300'];

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

export function applyCustomBg(hex, mode) {
  var p = parseHexColor(hex);
  var h = p.h, s = p.s, l = p.l;
  var b000, b100, b200, b300;
  if (mode === 'light') {
    b100 = _hslStr(h, s, l);
    b000 = _hslStr(h, Math.min(s * 1.4, 20), Math.min(l + 4, 97));
    b200 = _hslStr(h, Math.max(s * 0.7, 0), Math.max(l - 6, 3));
    b300 = _hslStr(h, Math.max(s * 0.5, 0), Math.max(l - 14, 0));
  } else {
    b100 = _hslStr(h, s, l);
    b000 = _hslStr(h, Math.min(s * 1.2, 15), Math.min(l + 3.5, 95));
    b200 = _hslStr(h, Math.max(s * 0.8, 0), Math.max(l - 2.7, 0));
    b300 = _hslStr(h, Math.max(s * 0.6, 0), Math.max(l - 6.7, 0));
  }
  var root = document.documentElement;
  root.style.setProperty('--bg-000', b000);
  root.style.setProperty('--bg-100', b100);
  root.style.setProperty('--bg-200', b200);
  root.style.setProperty('--bg-300', b300);
}

export function removeCustomBg() {
  var root = document.documentElement;
  BG_VARS.forEach(function (v) {
    root.style.removeProperty(v);
  });
}

function _hslStr(h, s, l) {
  return Math.round(h) + ' ' + Math.round(s) + '% ' + Math.round(l) + '%';
}
