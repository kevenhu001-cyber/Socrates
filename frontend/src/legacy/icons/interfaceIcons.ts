/** Shared interface glyphs for React and the remaining string renderers.
 * 24px grid, 1.75px round strokes, generous counters and quiet rounded shells.
 * Keep brand marks and user-created SVG content outside this collection.
 */
import { OPENAI_GLYPHS, isOpenAIGlyph } from './openaiGlyphs';

export { isOpenAIGlyph } from './openaiGlyphs';
export const INTERFACE_ICON_STROKE = 1.75;

type ShapeTag = 'path' | 'rect' | 'circle';
export type IconShape = readonly [ShapeTag, Readonly<Record<string, string | number>>];
const path = (d: string, attrs: Record<string, string | number> = {}): IconShape => [
  'path',
  { d, ...attrs },
];
const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => [
  'rect',
  { x, y, width, height, rx },
];
const circle = (cx: number, cy: number, r: number): IconShape => ['circle', { cx, cy, r }];

const DOCUMENT = [
  path('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'),
  path('M14 2v6h6'),
];
const THUMB = [
  path(
    'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3Z',
  ),
];

const GLYPHS = {
  // Two-line conversation menu from the supplied phone reference.
  menuCompact: [path('M4 8h16'), path('M4 16h11')],
  knowledge: [
    circle(6, 6, 2.5),
    circle(18, 8, 2.5),
    circle(11, 18, 2.5),
    path('m8.5 6.4 7 1.2M7.2 8.3l2.8 7.4M16.5 10l-4 6'),
  ],
  bookmark: [path('M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z')],
  list: [path('M4 6h3M4 12h3M4 18h3'), path('M10 6h10M10 12h10M10 18h10')],
  lifeBuoy: [
    circle(12, 12, 8.5),
    circle(12, 12, 3.25),
    path('m6 6 3.7 3.7m4.6 4.6L18 18M18 6l-3.7 3.7m-4.6 4.6L6 18'),
  ],
  /* Door frame on the left, arrow leaving to the right. */
  logOut: [path('M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M15 7l5 5-5 5M20 12H9')],
  sun: [
    circle(12, 12, 4),
    path(
      'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
    ),
  ],
  tag: [
    path(
      'M4 6.5V11a2 2 0 0 0 .6 1.4l7 7a2 2 0 0 0 2.8 0l5-5a2 2 0 0 0 0-2.8l-7-7A2 2 0 0 0 11 4H6.5A2.5 2.5 0 0 0 4 6.5Z',
    ),
  ],
  compass: [circle(12, 12, 8.5), path('m15.9 8.1-2.2 5.6-5.6 2.2 2.2-5.6 5.6-2.2Z')],
  analyze: [path('M5 19.5v-6M12 19.5v-15M19 19.5v-10')],
  arrowUp: [path('M12 19V5M5 12l7-7 7 7')],
  arrowDown: [path('M12 5v14M5 12l7 7 7-7')],
  check: [path('m5 12 5 5L20 7')],
  activitySpinner: [path('M12 2v4m0 12v4M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83')],
  regenerate: [
    path(
      'M4 10a8 8 0 0 1 13.7-3.7L20 8.5M20 4v4.5h-4.5M20 14A8 8 0 0 1 6.3 17.7L4 15.5M4 20v-4.5h4.5',
    ),
  ],
  thumbsUp: THUMB,
  thumbsDown: THUMB.map(([tag, attrs]): IconShape => [
    tag,
    { ...attrs, transform: 'rotate(180 12 12)' },
  ]),
  branch: [path('M6 4v11.5M18 8.5A9.5 9.5 0 0 1 8.5 18'), circle(6, 18, 2.5), circle(18, 6, 2.5)],
  bulb: [
    path('M9 16c0-1.5-.8-2.5-1.8-3.5a6 6 0 1 1 9.6 0C15.8 13.5 15 14.5 15 16M9 17h6M10 20.5h4'),
  ],
  speaker: [
    path(
      'M10.5 5 6 8.5H4a.5.5 0 0 0-.5.5v6a.5.5 0 0 0 .5.5h2l4.5 3.5a.6.6 0 0 0 1-.5v-13a.6.6 0 0 0-1-.5ZM15.5 9a4.5 4.5 0 0 1 0 6M18 6a8.5 8.5 0 0 1 0 12',
    ),
  ],
  document: DOCUMENT,
  read: [...DOCUMENT, path('M8.5 13.5h7M8.5 17h4')],
  code: [path('m8 8-4 4 4 4m8-8 4 4-4 4M14 5l-4 14')],
  agent: [
    rect(4, 7, 16, 13, 5),
    path('M12 7V3.5M2 13.5h2M20 13.5h2'),
    path('M8.5 11.5v2M15.5 11.5v2'),
    path('M9 16h6'),
  ],
  upload: [rect(4, 4, 16, 16, 3), path('M12 16V8m-3.5 3.5 3.5-3.5 3.5 3.5')],
  wechat: [
    path(
      'M10 5.5C6.4 5.5 3.5 7.9 3.5 10.8c0 1.6.8 3 2.1 4l-.6 2.2 2.5-1.2c.8.3 1.6.4 2.5.4 3.6 0 6.5-2.4 6.5-5.4S13.6 5.5 10 5.5Z',
    ),
    circle(8, 10, 0.9),
    circle(12, 10, 0.9),
    path(
      'M16 11.5c-2.8 0-5 1.8-5 4 0 1.2.6 2.3 1.6 3l-.5 1.7 1.9-.9c.6.2 1.3.3 2 .3 2.8 0 5-1.8 5-4s-2.2-4.1-5-4.1Z',
    ),
    circle(14.5, 15, 0.8),
    circle(17.5, 15, 0.8),
  ],
  plug: [
    path(
      'm19 5-3-3m-6 6L7.5 5.5M12 12l2.5 2.5M6 18l3-3m-1-4 5.5-5.5a2.5 2.5 0 0 1 3.5 3.5L8.5 14a2.5 2.5 0 0 1-3.5-3.5Z',
    ),
  ],
  ...OPENAI_GLYPHS,
} satisfies Record<string, readonly IconShape[]>;

export type InterfaceIconName = keyof typeof GLYPHS;

export function getInterfaceIconShapes(name: InterfaceIconName): readonly IconShape[] {
  return Object.prototype.hasOwnProperty.call(GLYPHS, name) ? GLYPHS[name] : [];
}

/** Only the static, trusted shape attributes above are serialized. */
export function interfaceIconInnerHtml(name: InterfaceIconName): string {
  return getInterfaceIconShapes(name)
    .map(([tag, attrs]) => {
      const attributes = Object.entries(attrs)
        .map(([key, value]) => {
          const attribute = key === 'fillRule' ? 'fill-rule' : key === 'clipRule' ? 'clip-rule' : key;
          return `${attribute}="${value}"`;
        })
        .join(' ');
      return `<${tag} ${attributes}/>`;
    })
    .join('');
}

export function interfaceIcon(name: InterfaceIconName, size?: number): string {
  const body = interfaceIconInnerHtml(name);
  if (!body) return '';
  const dimensions = size === undefined ? '' : ` width="${size}" height="${size}"`;
  const paint = isOpenAIGlyph(name)
    ? 'fill="currentColor" stroke="none" data-icon-source="openai-apps-sdk"'
    : `fill="none" stroke="currentColor" stroke-width="${INTERFACE_ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  return `<svg viewBox="0 0 24 24"${dimensions} ${paint} aria-hidden="true" focusable="false">${body}</svg>`;
}
