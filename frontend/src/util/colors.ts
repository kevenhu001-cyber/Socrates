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

export interface HSL {
  h: number;
  s: number;
  l: number;
}

const BG_VARS = ['--bg-000', '--bg-100', '--bg-200', '--bg-300'];

export function parseHexColor(hex: string): HSL {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function applyCustomBg(hex: string, mode: 'light' | 'dark'): void {
  const p = parseHexColor(hex);
  const h = p.h, s = p.s, l = p.l;
  let b000: string, b100: string, b200: string, b300: string;
  if (mode === 'light') {
    b100 = _hslStr(h, s, l);
    /* When the user picks near-white (l >= 95), the standard
       +4/-6/-14 offsets collapse to ~97/94/86 — barely distinguishable
       from a pure-white page. Branch to fixed gaps that always give
       readable contrast, regardless of how saturated the pick is. */
    if (l >= 95) {
      b000 = _hslStr(h, Math.min(s * 1.4, 12), 96);
      b200 = _hslStr(h, Math.max(s * 0.7, 0), 88);
      b300 = _hslStr(h, Math.max(s * 0.5, 0), 76);
    } else {
      b000 = _hslStr(h, Math.min(s * 1.4, 20), Math.min(l + 4, 97));
      b200 = _hslStr(h, Math.max(s * 0.7, 0), Math.max(l - 6, 3));
      b300 = _hslStr(h, Math.max(s * 0.5, 0), Math.max(l - 14, 0));
    }
  } else {
    b100 = _hslStr(h, s, l);
    /* Same idea for near-black picks (l <= 5): the standard +3.5/-2.7/-6.7
       offsets clamp so all four surfaces land between 0 and 3.5 — the
       sidebar / raised / hover states are indistinguishable. Branch
       to fixed gaps that always keep the surface tints visible. */
    if (l <= 5) {
      b000 = _hslStr(h, Math.min(s * 1.2, 8), 8);
      b200 = _hslStr(h, Math.max(s * 0.8, 0), 14);
      b300 = _hslStr(h, Math.max(s * 0.6, 0), 22);
    } else {
      b000 = _hslStr(h, Math.min(s * 1.2, 15), Math.min(l + 3.5, 95));
      b200 = _hslStr(h, Math.max(s * 0.8, 0), Math.max(l - 2.7, 0));
      b300 = _hslStr(h, Math.max(s * 0.6, 0), Math.max(l - 6.7, 0));
    }
  }
  const root = document.documentElement;
  root.style.setProperty('--bg-000', b000);
  root.style.setProperty('--bg-100', b100);
  root.style.setProperty('--bg-200', b200);
  root.style.setProperty('--bg-300', b300);
}

export function removeCustomBg(): void {
  const root = document.documentElement;
  BG_VARS.forEach(v => {
    root.style.removeProperty(v);
  });
}

function _hslStr(h: number, s: number, l: number): string {
  return Math.round(h) + ' ' + Math.round(s) + '% ' + Math.round(l) + '%';
}
