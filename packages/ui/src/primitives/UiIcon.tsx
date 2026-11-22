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
 * Dots are drawn as tiny stroked circles (the ⋯ of More), never zero-length paths.
 */
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
  close: [['p', 'M18 6 6 18M6 6l12 12']],
  paperclip: [
    [
      'p',
      'm21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48',
    ],
  ],
  image: [
    ['r', 3, 3, 18, 18, 2.5],
    ['c', 8.5, 8.5, 1.5],
    ['p', 'm21 15-5-5L5 21'],
  ],
  pen: [
    [
      'p',
      'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.852l-.84 2.873a.5.5 0 0 0 .62.62l2.873-.84a2 2 0 0 0 .852-.5Z',
    ],
    ['p', 'm15 5 4 4'],
  ],
  globe: [
    ['c', 12, 12, 9],
    ['p', 'M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18'],
  ],
  mic: [
    ['r', 9, 2.5, 6, 11, 3],
    ['p', 'M5 10v1a7 7 0 0 0 14 0v-1M12 18.5v3.5M8 22h8'],
  ],
  'arrow-up': [['p', 'M12 19V5M5 12l7-7 7 7']],
  stop: [['r', 6, 6, 12, 12, 2.5]],
  'chevron-down': [['p', 'm6 9 6 6 6-6']],
  'chevron-right': [['p', 'm9 18 6-6-6-6']],
  search: [
    ['c', 11, 11, 7],
    ['p', 'm21 21-4.35-4.35'],
  ],
  'new-chat': [
    ['p', 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'],
    [
      'p',
      'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
    ],
  ],
  panel: [
    ['r', 3, 3, 18, 18, 3],
    ['p', 'M9 3v18'],
  ],
  share: [
    ['p', 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7'],
    ['p', 'm16 6-4-4-4 4M12 2v13'],
  ],
  sliders: [
    ['p', 'M3 8h8M15 8h6M3 16h4M11 16h10'],
    ['c', 13, 8, 2],
    ['c', 9, 16, 2],
  ],
  sparkle: [
    [
      'p',
      'm12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z',
    ],
  ],
  /* RN-7 sidebar navigation. Same geometry as the web interface set; More
     is the reference ⋯ (three round dots). */
  compose: [
    ['p', 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'],
    [
      'p',
      'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z',
    ],
  ],
  library: [
    ['p', 'm16 6 4 14'],
    ['p', 'M12 6v14'],
    ['p', 'M8 8v12'],
    ['p', 'M4 4v16'],
  ],
  folder: [
    [
      'p',
      'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z',
    ],
  ],
  clock: [
    ['c', 12, 12, 9],
    ['p', 'M12 7v5l3 2'],
  ],
  puzzle: [
    [
      'p',
      'M19.4 7.85c-.05-.32.06-.65.29-.88l1.57-1.57a1.5 1.5 0 0 0-2.12-2.12l-1.57 1.57a.86.86 0 0 1-.88.29c-.77-.16-1.56.12-2.03.74a2.5 2.5 0 0 0-4 0c-.47-.62-1.26-.9-2.03-.74a.86.86 0 0 1-.88-.29L6.12 3.28a1.5 1.5 0 0 0-2.12 2.12l1.57 1.57c.23.23.34.56.29.88-.16.77.12 1.56.74 2.03a2.5 2.5 0 0 0 0 4c-.62.47-.9 1.26-.74 2.03.05.32-.06.65-.29.88l-1.57 1.57a1.5 1.5 0 0 0 2.12 2.12l1.57-1.57c.23-.23.56-.34.88-.29.77.16 1.56-.12 2.03-.74a2.5 2.5 0 0 0 4 0c.47.62 1.26.9 2.03.74.32.05.65-.06.88-.29l1.57 1.57a1.5 1.5 0 0 0 2.12-2.12l-1.57-1.57a.86.86 0 0 1-.29-.88c.16-.77-.12-1.56-.74-2.03a2.5 2.5 0 0 0 0-4c.62-.47.9-1.26.74-2.03Z',
    ],
  ],
  assistant: [
    ['r', 4, 6, 16, 14, 4],
    ['p', 'M12 2v4M8 12h.01M16 12h.01M9 16c1.5 1 4.5 1 6 0'],
  ],
  site: [
    ['r', 3, 4, 18, 16, 3],
    ['p', 'M3 9h18M7 6.5h.01M10 6.5h.01M13 6.5h.01'],
  ],
  exam: [
    ['r', 4, 3, 16, 18, 2.5],
    ['p', 'M9 12l2 2 4-4M8 3h8'],
  ],
  skills: [
    ['r', 3, 3, 8, 8, 2],
    ['c', 17, 7, 4],
    ['r', 13, 13, 8, 8, 2],
    ['p', 'm3 21 4-7 4 7z'],
  ],
  more: [
    ['c', 6, 12, 1.5],
    ['c', 12, 12, 1.5],
    ['c', 18, 12, 1.5],
  ],
  /* RN-10 — the pinned-chat mark in the history rows; an outline pushpin. */
  pin: [
    [
      'p',
      'M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4.76z',
    ],
  ],
  /* Incognito (temporary) chat — hat brim and two lenses, all outlines. The
     phone header carries it where the reference keeps its temporary chat. */
  incognito: [
    ['p', 'M4 11h16M7 11l1.5-6h7l1.5 6'],
    ['c', 8, 16, 2.8],
    ['c', 16, 16, 2.8],
    ['p', 'M10.8 16h2.4'],
  ],
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
  if (!Renderer) {
    return <span aria-hidden style={{ display: 'inline-block', width: size, height: size }} />;
  }
  return (
    <Renderer
      name={name}
      shapes={UI_GLYPHS[name]}
      size={size}
      color={color ?? colors.ink}
      strokeWidth={UI_ICON_STROKE}
    />
  );
}
