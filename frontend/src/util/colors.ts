/**
 * Hex / HSL colour helpers for the display-prefs panel.
 *
 * The user can pick a custom dark / light background colour from the
 * `≡` popover. We convert their hex pick to HSL, then derive three
 * additional surface shades so every
 * card / divider / scrollbar tint stays consistent with the chosen
 * base.  All conversion is done in JS — no Canvas, no CSS variables
 * mutation outside the document root.
 */

const BG_VARS = [
  '--ui-bg-page',
  '--ui-bg-raised',
  '--ui-bg-surface',
  '--ui-bg-control',
  '--ui-bg-hover',
  '--ui-bg-composer',
  '--ui-bg-bubble',
  '--ui-bg-chip',
  '--ui-bg-chip-hover',
  '--ui-bg-segment-active',
];

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export function parseHexColor(hex: string): HslColor {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function applyCustomBg(hex: string, mode: 'light' | 'dark'): void {
  const p = parseHexColor(hex);
  /* Neutral-black theme contract: a custom background must never tint the
     UI. We keep only the *lightness* of the user's pick and force hue and
     saturation to 0, so every derived surface is a pure grayscale step.
     This kills the historical "跑色" (green/warm cast) while still letting
     users pick how light or dark the page is. */
  const l = p.l;
  let raised: string, page: string, surface: string, control: string;
  if (mode === 'light') {
    page = _hslStr(0, 0, l);
    /* When the user picks near-white (l >= 95), the standard
       +4/-6/-14 offsets collapse to ~97/94/86 — barely distinguishable
       from a pure-white page. Branch to fixed gaps that always give
       readable contrast. */
    if (l >= 95) {
      raised = _hslStr(0, 0, 96);
      surface = _hslStr(0, 0, 88);
      control = _hslStr(0, 0, 76);
    } else {
      raised = _hslStr(0, 0, Math.min(l + 4, 97));
      surface = _hslStr(0, 0, Math.max(l - 6, 3));
      control = _hslStr(0, 0, Math.max(l - 14, 0));
    }
  } else {
    page = _hslStr(0, 0, l);
    /* Same idea for near-black picks (l <= 5): the standard +3.5/-2.7/-6.7
       offsets clamp so all four surfaces land between 0 and 3.5 — the
       sidebar / raised / hover states are indistinguishable. Branch
       to fixed gaps that always keep the surface tints visible. */
    if (l <= 5) {
      raised = _hslStr(0, 0, 8);
      surface = _hslStr(0, 0, 14);
      control = _hslStr(0, 0, 22);
    } else {
      raised = _hslStr(0, 0, Math.min(l + 3.5, 95));
      surface = _hslStr(0, 0, Math.max(l - 2.7, 0));
      control = _hslStr(0, 0, Math.max(l - 6.7, 0));
    }
  }
  const root = document.documentElement;
  root.style.setProperty('--ui-bg-page', `hsl(${page})`);
  root.style.setProperty('--ui-bg-raised', `hsl(${raised})`);
  root.style.setProperty('--ui-bg-surface', `hsl(${surface})`);
  root.style.setProperty('--ui-bg-control', `hsl(${control})`);
  root.style.setProperty('--ui-bg-hover', `hsl(${control})`);
  /* The composer capsule and user bubble ride the same derived step as the
     control surface; chips and the active segment take the lightest step so
     they stay legible inside the capsule. */
  root.style.setProperty('--ui-bg-composer', `hsl(${control})`);
  root.style.setProperty('--ui-bg-bubble', `hsl(${control})`);
  root.style.setProperty('--ui-bg-chip', `hsl(${raised})`);
  root.style.setProperty('--ui-bg-chip-hover', `hsl(${raised})`);
  root.style.setProperty('--ui-bg-segment-active', `hsl(${control})`);
}

export function removeCustomBg(): void {
  const root = document.documentElement;
  BG_VARS.forEach(function (v) {
    root.style.removeProperty(v);
  });
}

function _hslStr(h: number, s: number, l: number): string {
  return Math.round(h) + ' ' + Math.round(s) + '% ' + Math.round(l) + '%';
}
