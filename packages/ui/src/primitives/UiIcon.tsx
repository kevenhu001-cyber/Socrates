/**
 * RN-7 line icons for the shared shell (home shortcuts, composer, top bar,
 * sidebar).
 *
 * The package stays DOM-free and does not depend on an SVG library: each
 * glyph is plain geometry data (24px viewBox, outline only), and the host
 * hands in the renderer through `UiThemeProvider`. The web shell draws an
 * inline `<svg>`; a native client can draw the same data with
 * react-native-svg. Every glyph is rendered with ONE line weight
 * (`UI_ICON_STROKE`, a non-scaling 1.5px on the web), so icons from
 * different sources never mix 1.6 / 1.75 / 2 / 2.2 strokes again.
 *
 * Shape tuples: p=path, c=circle(cx,cy,r), r=rect(x,y,w,h,rx), l=line.
 * Nothing here is a dot: no zero-length paths, no filled circles.
 */
import { View } from 'react-native';
import type { ComponentType } from 'react';
import { useUiTheme } from './theme';

export type UiGlyphShape =
  | readonly ['p', string]
  | readonly ['c', number, number, number]
  | readonly ['r', number, number, number, number, number]
  | readonly ['l', number, number, number, number];

export const UI_ICON_STROKE = 1.5;

export const UI_GLYPHS = {
  plus: [['p', 'M12 5v14M5 12h14']],
  minus: [['p', 'M5 12h14']],
  close: [['p', 'M7 7l10 10M17 7 7 17']],
  paperclip: [['p', 'm20.5 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l8.2-8.2a3.3 3.3 0 0 1 4.7 4.7l-8.2 8.2a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6']],
  image: [['r', 3.5, 4.5, 17, 15, 3], ['c', 9, 10, 1.75], ['p', 'm20.5 15.5-4.5-4.5-9 8.5']],
  pen: [['p', 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z'], ['p', 'm14.5 7.5 3 3']],
  globe: [['c', 12, 12, 8.5], ['p', 'M3.5 12h17'], ['p', 'M12 3.5c2.4 2.4 3.5 5.3 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.3-3.5-8.5s1.1-6.1 3.5-8.5z']],
  mic: [['r', 9, 3.5, 6, 11, 3], ['p', 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v3M9 20.5h6']],
  'arrow-up': [['p', 'M12 19V5M6 11l6-6 6 6']],
  stop: [['r', 7, 7, 10, 10, 2]],
  'chevron-down': [['p', 'm6 9 6 6 6-6']],
  'chevron-right': [['p', 'm9 6 6 6-6 6']],
  search: [['c', 11, 11, 6.5], ['p', 'm20 20-4-4']],
  'new-chat': [['p', 'M12 20h8.5'], ['p', 'M16.5 3.8a2.1 2.1 0 0 1 3 3L7 19.3l-4 1 1-4z']],
  panel: [['r', 3.5, 4.5, 17, 15, 3], ['p', 'M9.5 4.5v15']],
  share: [['p', 'M12 15V4M7.5 8.5 12 4l4.5 4.5'], ['p', 'M5 13v4.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V13']],
  sliders: [['p', 'M4 7h9M17 7h3M4 17h3M11 17h9'], ['c', 15, 7, 2], ['c', 9, 17, 2]],
  sparkle: [['p', 'M12 4v4M12 16v4M4 12h4M16 12h4M6.5 6.5l2.5 2.5M15 15l2.5 2.5M17.5 6.5 15 9M9 15l-2.5 2.5']],
  /* RN-7 sidebar navigation. Same geometry as the web interface set, with
     the dotted marks (assistant eyes, browser lights, the ⋯ of More) redrawn
     as short strokes so nothing reads as a dot. */
  compose: [['p', 'M11 4H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4'], ['p', 'm14.5 5.5 4 4M5 19l3.6-.9L19.2 7.5a2.8 2.8 0 0 0-4-4L4.6 14.1 3.7 18a.8.8 0 0 0 1 1Z']],
  library: [['p', 'M7.5 4h10A2.5 2.5 0 0 1 20 6.5v13a.5.5 0 0 1-.5.5h-12A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4ZM4 16.5A2.5 2.5 0 0 1 6.5 14H20M8 4v10M9 17h6']],
  folder: [['p', 'M3.5 8V7A2.5 2.5 0 0 1 6 4.5h3a2 2 0 0 1 1.6.8l1.2 1.4a2 2 0 0 0 1.6.8H18a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V8Z']],
  clock: [['c', 12, 12, 8.25], ['p', 'M12 7.5V12l3 2']],
  puzzle: [['p', 'M9 4.5H6.5a2 2 0 0 0-2 2V10H6a2 2 0 0 1 0 4H4.5v3.5a2 2 0 0 0 2 2H10V18a2 2 0 0 1 4 0v1.5h3.5a2 2 0 0 0 2-2V14H18a2 2 0 0 1 0-4h1.5V6.5a2 2 0 0 0-2-2H14V4a2.5 2.5 0 0 0-5 0v.5Z']],
  assistant: [['r', 3.5, 3.5, 17, 17, 6], ['p', 'M8.5 9v2M15.5 9v2M9 14.5c1.7 1.5 4.3 1.5 6 0']],
  site: [['r', 3.5, 4.5, 17, 15, 3], ['p', 'M3.5 9.5h17M9 9.5v10']],
  exam: [['r', 5, 4.5, 14, 16, 3], ['r', 9, 2.5, 6, 4, 1.5], ['p', 'm8.5 13 2.5 2.5 4.5-5']],
  skills: [['r', 4, 4, 6, 6, 2], ['r', 14, 4, 6, 6, 2], ['r', 4, 14, 6, 6, 2], ['p', 'M17 13c.4 2.3 1.7 3.6 4 4-2.3.4-3.6 1.7-4 4-.4-2.3-1.7-3.6-4-4 2.3-.4 3.6-1.7 4-4Z']],
  more: [['p', 'M5 8h14M5 12h14M5 16h9']],
  /* RN-10 — the pinned-chat mark in the history rows; an outline pushpin. */
  pin: [['p', 'M9.5 3.5h5M10.5 3.5v5L7.5 12v1.5h9V12l-3-3.5v-5M12 13.5v7']],
  /* Incognito (temporary) chat — hat brim and two lenses, all outlines. The
     phone header carries it where the reference keeps its temporary chat. */
  incognito: [['p', 'M6.5 10.5 8.3 6c.2-.6.9-.9 1.5-.7l2.2.7 2.2-.7c.6-.2 1.3.1 1.5.7l1.8 4.5'], ['p', 'M4 10.5h16'], ['c', 8.5, 15.5, 2.7], ['c', 15.5, 15.5, 2.7], ['p', 'M11.2 15.5h1.6']],
} as const satisfies Record<string, readonly UiGlyphShape[]>;

export type UiGlyphName = keyof typeof UI_GLYPHS;

export interface UiIconRendererProps {
  name: UiGlyphName;
  shapes: readonly UiGlyphShape[];
  size: number;
  color: string;
  strokeWidth: number;
}

export type UiIconRenderer = ComponentType<UiIconRendererProps>;

export interface UiIconProps {
  name: UiGlyphName;
  size?: number;
  /** Defaults to the theme's ink; pass a palette colour for quieter glyphs. */
  color?: string;
}

/** A decorative line glyph. Accessible names belong on the control around it. */
export function UiIcon({ name, size = 18, color }: UiIconProps) {
  const { colors, iconRenderer: Renderer } = useUiTheme();
  if (!Renderer) return <View style={{ width: size, height: size }} />;
  return <Renderer name={name} shapes={UI_GLYPHS[name]} size={size} color={color ?? colors.ink} strokeWidth={UI_ICON_STROKE} />;
}
