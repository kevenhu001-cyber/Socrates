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
